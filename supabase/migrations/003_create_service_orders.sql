create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_wa_id text not null,
  customer_name text,
  service_category text not null,
  service_name text not null,
  project_details text not null,
  contact_details text not null,
  status text not null default 'pending_admin_approval'
    check (status in ('pending_admin_approval', 'accepted', 'rejected')),
  approval_code text not null unique,
  acceptance_code text unique,
  admin_wa_id text,
  admin_decision text check (admin_decision in ('accepted', 'rejected')),
  admin_decision_message text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_orders_customer_wa_id_idx
  on public.service_orders (customer_wa_id, created_at desc);

create index if not exists service_orders_status_created_idx
  on public.service_orders (status, created_at desc);

create index if not exists service_orders_acceptance_code_idx
  on public.service_orders (acceptance_code)
  where acceptance_code is not null;

drop trigger if exists service_orders_set_updated_at on public.service_orders;
create trigger service_orders_set_updated_at
before update on public.service_orders
for each row execute function public.set_updated_at();
