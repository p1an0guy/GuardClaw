-- GuardClaw demo schema

create table if not exists incidents (
  id uuid primary key,
  event_id text not null,
  summary text,
  classification_level text,
  status text default 'active',
  affected_members jsonb default '[]',
  source_kind text,
  severity text,
  location_label text,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'incidents' and column_name = 'family_id'
  ) then
    alter table incidents add column family_id uuid references families(id);
  end if;
end $$;
