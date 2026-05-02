# GuardClaw Project Context

GuardClaw is a hackathon MVP for a consent-based household safety coordinator. Keep changes small, typed, and demo-oriented.

## Architecture
- Backend: FastAPI in `backend/app`, SQLite persistence in `backend/data/guardclaw.db`.
- Frontend: Next.js App Router in `frontend`, TypeScript strict mode, Tailwind CSS.
- Hermes: use the dedicated `guardclaw` profile so Telegram can talk to GuardClaw without changing the global Hermes identity.
- Kiro: steering and specs live under `.kiro/`.

## Demo Rules
- Demo mode must stay explicit in APIs and UI.
- Simulated alert replay is the default path.
- Do not claim real emergency dispatch, real camera surveillance, or real outbound sends.
- Message drafts are logged to the timeline unless a future adapter explicitly implements real delivery.

## Local Commands
- Backend: `cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --reload`
- Frontend: `cd frontend && npm install && npm run dev`
- Hermes setup: `bash scripts/setup-hermes-guardclaw.sh`

