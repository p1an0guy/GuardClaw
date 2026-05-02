-- GuardClaw one-day demo Supabase setup.
-- Run this in the Supabase SQL editor for the demo project.
-- RLS is intentionally left disabled for the hackathon demo; enable policies before production.

create extension if not exists pgcrypto;

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  status text not null default 'Safe',
  battery int not null default 87,
  lat double precision,
  lng double precision,
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  sender_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists member_locations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy_meters double precision,
  speed_mps double precision,
  observed_at timestamptz not null default now()
);

create table if not exists member_contacts (
  member_id uuid primary key references members(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  phone_e164 text,
  telegram_chat_id text,
  home_lat double precision,
  home_lng double precision,
  work_lat double precision,
  work_lng double precision,
  role text,
  priority int
);

create index if not exists member_locations_family_observed_idx
  on member_locations (family_id, observed_at desc);

create index if not exists member_locations_member_observed_idx
  on member_locations (member_id, observed_at desc);

insert into families (id, name)
values ('00000000-0000-4000-8000-000000000001', 'GuardClaw Cal Poly Demo Family')
on conflict (id) do update set name = excluded.name;

insert into members (id, family_id, name, status, battery, lat, lng, updated_at)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Alex Rivera',
    'Safe',
    86,
    35.2828,
    -120.6596,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    'Jordan Lee',
    'Moving',
    72,
    35.2937,
    -120.67,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    'Maya Rivera',
    'Home',
    91,
    35.3009,
    -120.6615,
    now()
  )
on conflict (id) do update set
  name = excluded.name,
  status = excluded.status,
  battery = excluded.battery,
  lat = excluded.lat,
  lng = excluded.lng,
  updated_at = excluded.updated_at;

insert into member_contacts (
  member_id,
  family_id,
  phone_e164,
  telegram_chat_id,
  home_lat,
  home_lng,
  work_lat,
  work_lng,
  role,
  priority
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    '+15555550101',
    null,
    35.3009,
    -120.6615,
    35.2828,
    -120.6596,
    'guardian',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    '+15555550102',
    null,
    35.3009,
    -120.6615,
    35.2937,
    -120.67,
    'guardian',
    2
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    '+15555550103',
    null,
    35.3009,
    -120.6615,
    null,
    null,
    'child',
    3
  )
on conflict (member_id) do update set
  phone_e164 = excluded.phone_e164,
  telegram_chat_id = excluded.telegram_chat_id,
  home_lat = excluded.home_lat,
  home_lng = excluded.home_lng,
  work_lat = excluded.work_lat,
  work_lng = excluded.work_lng,
  role = excluded.role,
  priority = excluded.priority;

insert into member_locations (family_id, member_id, lat, lng, accuracy_meters, speed_mps, observed_at)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    35.2828,
    -120.6596,
    35,
    0.4,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000102',
    35.2937,
    -120.67,
    42,
    7.2,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000103',
    35.3009,
    -120.6615,
    18,
    0.1,
    now()
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'members'
  ) then
    alter publication supabase_realtime add table members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'member_locations'
  ) then
    alter publication supabase_realtime add table member_locations;
  end if;
end $$;
