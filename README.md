# GuardClaw

GuardClaw is a hackathon MVP for a consent-based household safety coordinator. It ingests a simulated public safety alert, combines it with seeded household context, decides who is most affected, and produces a calm action plan plus outbound message drafts.

Demo mode is explicit throughout the API, web dashboard, and mobile app. No real Discord, email, SMS, Telegram, camera, FEMA, NWS, county, or Cal Poly outbound integration is required for the first slice.

## Architecture

```
guardclaw/
├── backend/    → Python FastAPI API server + SQLite
├── frontend/   → Next.js + Tailwind web dashboard
├── mobile/     → Expo React Native iOS app
├── hermes/     → Hermes messaging profile
└── scripts/    → Setup and utility scripts
```

## What Is Implemented

- FastAPI backend with the required endpoints:
  - `POST /api/simulate/event`
  - `GET /api/incidents/active`
  - `GET /api/household`
  - `POST /api/actions/acknowledge`
  - `GET /api/actions/timeline`
- Pydantic models for `ThreatEvent`, `HouseholdMember`, `HouseholdState`, `ActionPlan`, and `OutboundMessage`.
- SQLite persistence for household state, active incident/action plan, and timeline.
- Seed demo data:
  - two guardians away
  - one child at home
  - one upcoming calendar item
  - one occupancy-confirmed home signal
- Deterministic risk engine:
  - child at home is most affected
  - guardian 1 is notified before guardian 2
  - rationale is human-readable
- Messaging abstraction for Telegram, Discord DM, email, and SMS.
- Messaging stubs that log every outbound draft to the timeline.
- Optional Hermes API-server adapter for refining message drafts.
- Next.js + TypeScript + Tailwind dashboard with demo badge, active incident banner, household cards, rationale panel, action timeline, and a Leaflet/OpenStreetMap GPS map centered on Cal Poly.
- Expo React Native iOS app with live family map, status dashboard, and realtime chat (Supabase-backed or demo mode).
- Optional household member `location` fields seeded for the demo and shaped for future mobile-app location updates.
- Kiro steering and spec scaffold.
- Docker Compose for local development.

## What Remains Stubbed

- Real Telegram delivery from the backend is not implemented. Telegram conversation is handled by the Hermes `guardclaw` profile.
- Real Discord, email, and SMS sends are stubbed and timeline-logged.
- NWS can be used as a live public alert source for the Cal Poly demo.
- OpenFEMA IPAWS archived alerts can be used as official delayed context and must not be described as live IPAWS.
- SLO County and Cal Poly sources use replay/manual-ingest fixtures.
- NWS live alert fetching is implemented as a best-effort adapter, but the demo path uses replay data by default.
- Camera input is represented by prerecorded CCTV clip metadata and an occupancy-confirmed home signal.
- The mobile app can post Supabase location snapshots for backend movement inference when Supabase env vars are configured.

## Backend Setup

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at `http://localhost:8000`.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000` by default. If port 3000 is occupied:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3200
```

## Mobile Setup

```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```

The app runs with polished demo data if Supabase env vars are empty or missing.

### Supabase Setup (optional)

Create a Supabase project, open the SQL editor, and run:

```bash
scripts/supabase-guardclaw-demo.sql
```

That script creates the tables, realtime publication entries, and a deterministic Cal Poly demo family. The fixed demo IDs are:

- Family: `00000000-0000-4000-8000-000000000001`
- Alex Rivera: `00000000-0000-4000-8000-000000000101`
- Jordan Lee: `00000000-0000-4000-8000-000000000102`
- Maya Rivera: `00000000-0000-4000-8000-000000000103`

Then copy `backend/.env.example` to `backend/.env` and `mobile/.env.example` to `mobile/.env`, replacing the Supabase URL/keys with values from the Supabase project settings.

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

insert into members (family_id, name, status, battery, lat, lng)
values
  ('YOUR_FAMILY_UUID', 'Mason', 'Safe', 86, 37.7858, -122.4064),
  ('YOUR_FAMILY_UUID', 'Ava', 'Home', 72, 37.7793, -122.4192),
  ('YOUR_FAMILY_UUID', 'Theo', 'Moving', 51, 37.7694, -122.4862);
```

For the fastest hackathon demo, keep Row Level Security disabled. Before production, enable RLS and add family-scoped policies.

### TestFlight Path

```bash
cd mobile
npx eas login
npx eas init
npx eas build --platform ios
npx eas submit --platform ios
```

## Docker Compose

```bash
docker compose up --build
```

Then open `http://localhost:3000`.

## Map Tiles

The dashboard uses Leaflet with OpenStreetMap standard tiles at `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. This is intended for a light interactive hackathon demo with visible OpenStreetMap attribution, not bulk/offline tile downloading. For production traffic, swap this behind a configured tile provider or self-hosted tile service.

## Hermes Setup

```bash
bash scripts/setup-hermes-guardclaw.sh
hermes -p guardclaw gateway run
```

The setup script creates a dedicated Hermes profile, installs the GuardClaw `SOUL.md`, points Hermes at this repo, and enables the Hermes API server for optional backend message refinement.

If the `guardclaw` profile clones your existing Telegram token, stop the default Hermes gateway before running the GuardClaw gateway. A single Telegram bot token cannot be used by two Hermes profiles at once.

## Curl Demo

Start the backend, then run:

```bash
curl -X POST http://localhost:8000/api/simulate/event \
  -H "Content-Type: application/json" \
  -d '{}'
```

Choose a replay source:

```bash
curl -X POST http://localhost:8000/api/simulate/event \
  -H "Content-Type: application/json" \
  -d '{"source":"ipaws"}'
```

Inspect state:

```bash
curl http://localhost:8000/api/incidents/active
curl http://localhost:8000/api/household
curl http://localhost:8000/api/actions/timeline
```

Ack a timeline item:

```bash
curl -X POST http://localhost:8000/api/actions/acknowledge \
  -H "Content-Type: application/json" \
  -d '{"target_id":"<timeline-id>","acknowledged_by":"demo-guardian"}'
```

## Optional Hermes Message Refinement

After running `scripts/setup-hermes-guardclaw.sh`, copy the generated `API_SERVER_KEY` from the `guardclaw` profile config or `.env` into the backend environment:

```bash
export GUARDCLAW_USE_HERMES=true
export HERMES_API_BASE_URL=http://127.0.0.1:8642/v1
export HERMES_API_KEY=<profile-api-server-key>
```

If Hermes is unavailable, GuardClaw automatically falls back to deterministic local message drafts.

## Demo Classifier and Routing

For the full demo path, run Hermes and set:

```bash
export GUARDCLAW_USE_HERMES=true
export HERMES_API_BASE_URL=http://127.0.0.1:8642/v1
export HERMES_API_KEY=<profile-api-server-key>
export SUPABASE_URL=<supabase-project-url>
export SUPABASE_SERVICE_ROLE_KEY=<service-role-or-demo-key>
export SUPABASE_FAMILY_ID=<family-uuid>
```

GuardClaw sends Hermes a strict JSON classification request for every alert. Valid levels are `minor`, `moderate`, `major`, and `life_threatening`. The backend validates the response, retries once if invalid, and then falls back to deterministic local classification.

Routing rules:

- `life_threatening`: notify all household members.
- `major`: notify all guardians plus directly affected members.
- `moderate`: notify guardians/parents.
- `minor`: notify only the priority-1 guardian.

Members inferred as commuting receive a Hermes call request. Members at home/work/away receive Telegram through Hermes. Every request/result is logged to the timeline.
