do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'phone'
  ) then
    execute 'alter table public.conversations alter column phone drop not null';
  end if;
end;
$$;
