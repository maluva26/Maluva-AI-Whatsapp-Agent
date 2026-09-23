create extension if not exists "pgcrypto";

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique,
  profile_name text,
  mode text not null default 'ai' check (mode in ('ai', 'manual', 'paused')),
  last_message_preview text,
  last_message_at timestamptz default now(),
  message_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  direction text not null check (direction in ('incoming', 'outgoing')),
  content text not null,
  whatsapp_msg_id text unique,
  meta_message_id text unique,
  status text not null default 'stored',
  source text not null default 'whatsapp' check (source in ('whatsapp', 'dashboard', 'direct', 'system')),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.conversations add column if not exists wa_id text;
alter table public.conversations add column if not exists profile_name text;
alter table public.conversations add column if not exists mode text;
alter table public.conversations add column if not exists last_message_preview text;
alter table public.conversations add column if not exists last_message_at timestamptz;
alter table public.conversations add column if not exists message_count integer;
alter table public.conversations add column if not exists created_at timestamptz default now();
alter table public.conversations add column if not exists updated_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'phone'
  ) then
    execute 'update public.conversations set wa_id = coalesce(wa_id, phone) where wa_id is null';
    execute 'alter table public.conversations alter column phone drop not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'name'
  ) then
    execute 'update public.conversations set profile_name = coalesce(profile_name, name) where profile_name is null';
  end if;
end;
$$;

alter table public.conversations drop constraint if exists conversations_mode_check;

update public.conversations
set mode = case
  when mode = 'agent' then 'ai'
  when mode = 'human' then 'manual'
  when mode is null then 'ai'
  else mode
end;

alter table public.conversations alter column mode set default 'ai';
alter table public.conversations alter column wa_id set not null;
alter table public.conversations alter column mode set not null;
alter table public.conversations alter column message_count set default 0;

alter table public.conversations
  add constraint conversations_mode_check
  check (mode in ('ai', 'manual', 'paused'));

create unique index if not exists conversations_wa_id_key
  on public.conversations (wa_id);

alter table public.messages add column if not exists direction text;
alter table public.messages add column if not exists meta_message_id text;
alter table public.messages add column if not exists status text;
alter table public.messages add column if not exists raw_payload jsonb;
alter table public.messages add column if not exists created_at timestamptz default now();

alter table public.messages drop constraint if exists messages_role_check;
alter table public.messages drop constraint if exists messages_direction_check;
alter table public.messages drop constraint if exists messages_source_check;

update public.messages
set direction = case
  when source = 'customer' then 'incoming'
  else 'outgoing'
end
where direction is null;

update public.messages
set source = case
  when source in ('customer', 'ai') then 'whatsapp'
  when source = 'human' then 'dashboard'
  when source is null then 'whatsapp'
  else source
end;

update public.messages set status = coalesce(status, 'stored');
update public.messages set raw_payload = coalesce(raw_payload, '{}'::jsonb);

alter table public.messages alter column direction set default 'incoming';
alter table public.messages alter column direction set not null;
alter table public.messages alter column status set default 'stored';
alter table public.messages alter column status set not null;
alter table public.messages alter column source set default 'whatsapp';
alter table public.messages alter column raw_payload set default '{}'::jsonb;
alter table public.messages alter column raw_payload set not null;

alter table public.messages
  add constraint messages_role_check
  check (role in ('user', 'assistant', 'system'));

alter table public.messages
  add constraint messages_direction_check
  check (direction in ('incoming', 'outgoing'));

alter table public.messages
  add constraint messages_source_check
  check (source in ('whatsapp', 'dashboard', 'direct', 'system'));

create index if not exists conversations_last_message_at_idx
  on public.conversations (last_message_at desc nulls last);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc);

create index if not exists messages_whatsapp_msg_id_idx
  on public.messages (whatsapp_msg_id)
  where whatsapp_msg_id is not null;

create index if not exists messages_meta_message_id_idx
  on public.messages (meta_message_id)
  where meta_message_id is not null;

create unique index if not exists messages_meta_message_id_key
  on public.messages (meta_message_id);

update public.conversations c
set
  last_message_at = coalesce(c.last_message_at, stats.last_message_at, c.updated_at, c.created_at, now()),
  last_message_preview = coalesce(c.last_message_preview, stats.last_message_preview),
  message_count = coalesce(c.message_count, stats.message_count, 0)
from (
  select distinct on (conversation_id)
    conversation_id,
    max(created_at) over (partition by conversation_id) as last_message_at,
    first_value(content) over (partition by conversation_id order by created_at desc) as last_message_preview,
    count(*) over (partition by conversation_id) as message_count
  from public.messages
) stats
where c.id = stats.conversation_id;

update public.conversations
set
  last_message_at = coalesce(last_message_at, updated_at, created_at, now()),
  message_count = coalesce(message_count, 0);

alter table public.conversations alter column last_message_at set default now();
alter table public.conversations alter column message_count set not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create or replace function public.touch_conversation_from_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set
    last_message_at = new.created_at,
    last_message_preview = left(new.content, 180),
    message_count = message_count + 1
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_from_message();
