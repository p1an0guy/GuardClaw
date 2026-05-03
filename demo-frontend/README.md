# GuardClaw Demo Frontend

Frontend-only judge demo for GuardClaw. This app uses fixture data and does not require FastAPI, Hermes, Supabase, or any backend service.

## Local

```bash
npm install
NEXT_PUBLIC_FRONTEND_ONLY=true npm run dev
```

## Vercel

Deploy this `demo-frontend` directory as a standalone Next.js app.

Recommended settings:

```text
Framework Preset: Next.js
Root Directory: demo-frontend
Install Command: npm install
Build Command: npm run build
Output Directory: .next
```

Environment variable:

```text
NEXT_PUBLIC_FRONTEND_ONLY=true
```

If `NEXT_PUBLIC_API_BASE_URL` is unset in production, this app defaults to fixture mode.
