# GuardClaw

GuardClaw is a hackathon-ready Expo React Native iOS MVP for family safety: live family map, status dashboard, and realtime chat.

## Local Setup

```bash
cd /Users/masonlewis/GuardClaw
npm install
cp .env.example .env
npx expo start
```

The app runs with polished demo data if Supabase env vars are empty or missing.

## Supabase Setup

Create a Supabase project, open the SQL editor, and run:

```bash
../scripts/supabase-guardclaw-demo.sql
```

Then copy `mobile/.env.example` to `mobile/.env` and choose one `EXPO_PUBLIC_MEMBER_ID` per phone. Use the anon key from Supabase Project Settings → API.

The equivalent schema is:

```sql
create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  status text not null default 'Safe',
  battery int not null default 87,
  lat double precision,
  lng double precision,
  updated_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  sender_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table member_locations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy_meters double precision,
  speed_mps double precision,
  observed_at timestamptz not null default now()
);

create table member_contacts (
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

alter publication supabase_realtime add table members;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table member_locations;
```

Seed a demo family:

```sql
insert into families (name) values ('GuardClaw Family') returning id;
```

Use that returned family UUID in `.env` as `EXPO_PUBLIC_FAMILY_ID`, then add a few members:

```sql
insert into members (family_id, name, status, battery, lat, lng)
values
  ('YOUR_FAMILY_UUID', 'Mason', 'Safe', 86, 37.7858, -122.4064),
  ('YOUR_FAMILY_UUID', 'Ava', 'Home', 72, 37.7793, -122.4192),
  ('YOUR_FAMILY_UUID', 'Theo', 'Moving', 51, 37.7694, -122.4862);
```

For the fastest hackathon demo, keep Row Level Security disabled. Before production, enable RLS and add family-scoped policies.

## TestFlight Path

```bash
cd /Users/masonlewis/GuardClaw
npm install
npx expo start
npx eas login
npx eas init
npx eas build --platform ios
npx eas submit --platform ios
```

Manual Apple checklist:

- Apple Developer Program membership is active.
- Bundle identifier is available or updated in `app.json`: `com.masonlewis.guardclaw`.
- App Store Connect app record exists for that bundle identifier.
- App privacy, age rating, export compliance, screenshots, and TestFlight tester details are completed.
- EAS has permission to manage Apple certificates/profiles during build.

## What To Test

- Demo mode launches with map pins, status cards, chat bubbles, and quick actions.
- Grant location permission on iOS; current location should appear and recenter should fit visible pins.
- Send a chat message; it should appear immediately.
- With Supabase env vars configured, updating `members` rows should update pins/cards in realtime.
- With Supabase env vars configured, foreground location updates should insert `member_locations` rows for backend movement inference.
- With Supabase env vars configured, inserting `messages` rows should update the chat in realtime.
