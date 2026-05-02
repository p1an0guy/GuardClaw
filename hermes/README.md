# GuardClaw Hermes Setup

GuardClaw uses a dedicated Hermes profile named `guardclaw` so Telegram conversations can use GuardClaw's identity without overwriting the default Hermes profile.

## Setup

```bash
bash scripts/setup-hermes-guardclaw.sh
```

The script:
- Creates `guardclaw` with `--clone` if it does not exist.
- Copies `hermes/SOUL.md` into `~/.hermes/profiles/guardclaw/SOUL.md`.
- Sets the Hermes terminal working directory to this repo.
- Enables the Hermes OpenAI-compatible API server for optional backend message refinement.

## Running

Run the GuardClaw backend first:

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then run Hermes as GuardClaw:

```bash
guardclaw gateway run
```

or:

```bash
hermes -p guardclaw gateway run
```

If your existing Telegram bot token is cloned into the `guardclaw` profile, stop the default Hermes gateway first. Hermes prevents two profiles from using the same bot token at the same time.

## Backend Hermes Adapter

The backend can optionally ask Hermes to refine outbound message drafts through the Hermes API server.

Set these in the backend environment:

```bash
GUARDCLAW_USE_HERMES=true
HERMES_API_BASE_URL=http://127.0.0.1:8642/v1
HERMES_API_KEY=<value from the guardclaw profile config or .env>
```

If Hermes is not running or the key is missing, the backend falls back to deterministic local drafts.
