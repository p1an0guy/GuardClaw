# GuardClaw Hermes Setup Guide

> Complete guide to installing and configuring [Hermes Agent](https://github.com/NousResearch/hermes-agent) as the AI backbone for GuardClaw. This covers WSL installation, profile creation, platform integrations (Telegram, Discord, Email), the OpenAI-compatible API server, webhook ingestion, Cloudflare tunnel exposure, Supabase event logging hooks, and testing.
>
> **Our setup:** We run Hermes on WSL2 (Ubuntu 24.04) on a Windows machine, using a dedicated `guardclaw` profile with `gpt-5-mini` via GitHub Copilot as the LLM provider. The Hermes gateway serves an OpenAI-compatible API on port 8642 and a webhook listener on port 8644, both exposed to the internet via named Cloudflare Tunnels on our `guardclaw.app` domain (`api.guardclaw.app` and `webhook.guardclaw.app`). The GuardClaw backend — which can run on any machine — calls these endpoints to classify alerts and dispatch family notifications through Telegram, Discord, and Email. Every Hermes lifecycle event is logged to Supabase for full observability.

## Table of Contents

- [Prerequisites](#prerequisites)
- [1. WSL2 + Ubuntu Setup](#1-wsl2--ubuntu-setup)
- [2. Install Hermes Agent](#2-install-hermes-agent)
- [3. Default Profile vs GuardClaw Profile](#3-default-profile-vs-guardclaw-profile)
- [4. Create the GuardClaw Profile](#4-create-the-guardclaw-profile)
- [5. LLM Provider — GitHub Copilot](#5-llm-provider--github-copilot)
- [6. Platform Setup — Telegram](#6-platform-setup--telegram)
- [7. Platform Setup — Discord](#7-platform-setup--discord)
- [8. Platform Setup — Email (Gmail)](#8-platform-setup--email-gmail)
- [9. Platform Setup — Webhook Listener](#9-platform-setup--webhook-listener)
- [10. API Server (OpenAI-Compatible)](#10-api-server-openai-compatible)
- [11. Cloudflare Tunnels (Optional)](#11-cloudflare-tunnels-optional)
- [12. Supabase Event Logging](#12-supabase-event-logging)
- [13. Webhook Subscription — family-alert-triage](#13-webhook-subscription--family-alert-triage)
- [14. SOUL.md — Agent Identity](#14-soulmd--agent-identity)
- [15. Running the Gateway](#15-running-the-gateway)
- [16. Testing](#16-testing)
- [17. Troubleshooting](#17-troubleshooting)

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Windows 10/11 with WSL2 | `wsl --install` from PowerShell (admin) |
| Ubuntu 24.04 LTS on WSL | Default distro from Microsoft Store |
| Python 3.11+ | Ships with Ubuntu 24.04 |
| Git | `sudo apt install git` |
| curl | `sudo apt install curl` |
| openssl | For generating API keys (`sudo apt install openssl`) |
| A GitHub account with Copilot access | For the LLM provider |
| A Telegram account | For creating a bot via BotFather |
| A Discord account | For creating a bot in the Developer Portal |
| A Gmail account | Dedicated account for Hermes email platform |
| A Cloudflare account + domain (optional) | Only if you want to expose Hermes to the internet |
| A Supabase project | For event logging |

---

## 1. WSL2 + Ubuntu Setup

From an **admin PowerShell** on Windows:

```powershell
wsl --install -d Ubuntu-24.04
```

After reboot, open the Ubuntu terminal and confirm:

```bash
cat /etc/os-release | grep PRETTY_NAME
# Ubuntu 24.04.4 LTS

uname -r
# Should contain "microsoft-standard-WSL2"
```

Update packages:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl openssl python3 python3-pip python3-venv
```

---

## 2. Install Hermes Agent

Hermes provides a one-line installer. Run inside WSL:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

This installs to `~/.hermes/` and adds `hermes` to your PATH (via `.bashrc`). Reload your shell:

```bash
source ~/.bashrc
hermes --version
```

Run initial setup:

```bash
hermes setup
```

This walks you through choosing a default model and provider. For the **default** profile we used `gpt-5.5` via `openai-codex`. You can pick whatever you like — the GuardClaw profile will use its own model. You can also change the model later with:

```bash
hermes model
```

---

## 3. Default Profile vs GuardClaw Profile

Hermes supports multiple **profiles**, each with its own model, platforms, hooks, SOUL.md, and environment variables. This is critical because:

- The **default** profile is your personal Hermes assistant (whatever model/provider you prefer).
- The **guardclaw** profile is a dedicated identity for the GuardClaw app — it uses a different model, has the GuardClaw SOUL.md personality, connects to GuardClaw-specific Telegram/Discord/Email accounts, and runs the API server + webhook listener.

Key differences in our setup:

| Setting | Default Profile | GuardClaw Profile |
|---|---|---|
| Model | `gpt-5.5` | `gpt-5-mini` |
| Provider | `openai-codex` | `copilot` (GitHub Copilot — any provider works) |
| SOUL.md | Generic/blank | GuardClaw safety coordinator identity |
| Terminal CWD | `.` (home) | `/mnt/c/Users/isaac/GuardClaw` (the repo) |
| API Server | Disabled | Enabled on port 8642 |
| Webhook | Disabled | Enabled on port 8644 |
| Platforms | Personal accounts | GuardClaw-dedicated Telegram bot, Discord bot, and Gmail |
| Hooks | None | Supabase event logging on all lifecycle events |

We chose this split so the default profile stays as a personal assistant while the guardclaw profile is a fully isolated, purpose-built identity for the app.

**Important:** Both profiles share the same Hermes installation (`~/.hermes/hermes-agent/`). Only configuration and state are separate.

---

## 4. Create the GuardClaw Profile

### Automated (recommended)

The repo includes a setup script:

```bash
cd /mnt/c/Users/isaac/GuardClaw
bash scripts/setup-hermes-guardclaw.sh
```

This script:
1. Creates the `guardclaw` profile via `hermes profile create guardclaw --clone` (clones from default)
2. Copies `hermes/SOUL.md` from the repo into the profile
3. Sets `terminal.cwd` to the GuardClaw repo root
4. Enables the API server on port 8642
5. Auto-generates an `API_SERVER_KEY` via `openssl rand -hex 24`

### Manual

```bash
# Create profile (--clone copies config structure from default)
hermes profile create guardclaw --clone

# Verify it exists
hermes profile list

# Set the model and provider
hermes -p guardclaw config set model.default gpt-5-mini
hermes -p guardclaw config set model.provider copilot
hermes -p guardclaw config set model.base_url https://api.githubcopilot.com
hermes -p guardclaw config set model.api_mode chat_completions

# Set terminal working directory to the repo
hermes -p guardclaw config set terminal.cwd /mnt/c/Users/isaac/GuardClaw

# Copy the SOUL.md
cp /mnt/c/Users/isaac/GuardClaw/hermes/SOUL.md ~/.hermes/profiles/guardclaw/SOUL.md
```

The profile home directory is `~/.hermes/profiles/guardclaw/`. All profile-specific config lives there:
- `config.yaml` — profile configuration
- `.env` — secrets and environment variables
- `SOUL.md` — agent personality
- `hooks/` — event hooks
- `sessions/` — conversation history
- `logs/` — agent/gateway/error logs

---

## 5. LLM Provider — GitHub Copilot

Hermes supports a wide range of LLM providers out of the box, including OpenRouter (access to hundreds of models), Google Gemini, Ollama (local/cloud open models), OpenAI directly, Hugging Face Inference, Kimi/Moonshot, Arcee AI, MiniMax, and more. You can pick whichever provider and model fits your needs — run `hermes setup` to see the full list.

**We chose GitHub Copilot** (`gpt-5-mini` via `https://api.githubcopilot.com`) because our team already had Copilot subscriptions, making it zero additional cost. Any OpenAI-compatible provider works identically.

### Set up the model

Use the interactive model selector to pick your provider and model:

```bash
hermes -p guardclaw model
```

This lets you browse available providers and models, and saves the selection to the profile's `config.yaml`.

Alternatively, if you already have a Copilot token (prefixed `gho_`), add it directly to the profile `.env`:

```bash
nano ~/.hermes/profiles/guardclaw/.env

# Add:
COPILOT_GITHUB_TOKEN=gho_your_token_here
```

---

## 6. Platform Setup — Telegram

Telegram is the primary messaging channel for GuardClaw alerts.

### Create a Telegram Bot

1. Open Telegram and search for **@BotFather**.
2. Send `/newbot`.
3. Choose a display name (e.g., `GuardClaw Bot`).
4. Choose a username (must end in `bot`, e.g., `guardclaw_safety_bot`).
5. BotFather replies with a **bot token** like `8741115461:AAH...`.

### Get User IDs

Each allowed user needs their numeric Telegram user ID. To find it:

1. Search for **@userinfobot** on Telegram.
2. Send it any message — it replies with your user ID.
3. Repeat for each household member who should receive alerts.

### Configure in Hermes

Add to `~/.hermes/profiles/guardclaw/.env`:

```bash
TELEGRAM_BOT_TOKEN=8741115461:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_ALLOWED_USERS=111111111,222222222,333333333,444444444
TELEGRAM_HOME_CHANNEL=111111111
```

- `TELEGRAM_BOT_TOKEN` — The token from BotFather.
- `TELEGRAM_ALLOWED_USERS` — Comma-separated numeric user IDs. Only these users can interact with the bot.
- `TELEGRAM_HOME_CHANNEL` — The default chat ID for cron jobs and unsolicited messages. Usually the primary user's ID.

### Important: Bot Token Conflict

Hermes prevents two profiles from using the same Telegram bot token simultaneously. If your default profile cloned the same token, **stop the default gateway before starting guardclaw**:

```bash
# Stop default gateway
hermes gateway stop

# Then start guardclaw
hermes -p guardclaw gateway run
```

Or create a separate bot for each profile.

---

## 7. Platform Setup — Discord

### Create a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** → name it (e.g., `GuardClaw`).
3. Go to **Bot** → click **Reset Token** → copy the token.
4. Under **Privileged Gateway Intents**, enable:
   - **Message Content Intent**
   - **Server Members Intent** (if you want member info)
5. Go to **OAuth2** → **URL Generator**:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`, `Embed Links`, `Attach Files`
6. Copy the generated URL and open it to invite the bot to your server.

### Get User IDs

1. In Discord, go to **Settings → Advanced → Developer Mode** (enable it).
2. Right-click a user → **Copy User ID**.

### Get Channel ID

1. Right-click a channel → **Copy Channel ID**. This is the home channel for cron/alert delivery.

### Configure in Hermes

Add to `~/.hermes/profiles/guardclaw/.env`:

```bash
DISCORD_BOT_TOKEN=MTUwMDI2NjAyNjM2Mzc4NTI4Nw.xxxxx.xxxxxxxxxxxxxxxxxxxxxxxx
DISCORD_ALLOWED_USERS=479312507010285600,508822260836990976,611241406400299038,1115385279952474133
DISCORD_HOME_CHANNEL=1500266570306289708
```

- `DISCORD_BOT_TOKEN` — From the Developer Portal.
- `DISCORD_ALLOWED_USERS` — Comma-separated Discord user IDs.
- `DISCORD_HOME_CHANNEL` — Channel ID for default message delivery.

---

## 8. Platform Setup — Email (Gmail)

GuardClaw uses a **dedicated Gmail account** for sending/receiving email through Hermes. Do not use your personal Gmail — create a new one.

### Create a Gmail App Password

1. Create a new Gmail account (e.g., `guardclaw1@gmail.com`).
2. Enable **2-Step Verification** at [myaccount.google.com/security](https://myaccount.google.com/security).
3. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
4. Create an app password (select "Mail" or "Other"). Google gives you a 16-character password like `fagu cdqk konu rqhr`.
5. Remove the spaces — your app password is `fagucdqkkonurqhr`.

### Configure in Hermes

Add to `~/.hermes/profiles/guardclaw/.env`:

```bash
EMAIL_ADDRESS=guardclaw1@gmail.com
EMAIL_PASSWORD=fagucdqkkonurqhr
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_ALLOWED_USERS=user1@gmail.com,user2@gmail.com,user3@gmail.com
```

You can also set a home address for outbound email delivery in `config.yaml`:

```bash
hermes -p guardclaw config set EMAIL_HOME_ADDRESS user1@gmail.com
```

- `EMAIL_ADDRESS` — The dedicated GuardClaw Gmail.
- `EMAIL_PASSWORD` — The 16-char app password (not your Gmail password).
- `EMAIL_IMAP_HOST` / `EMAIL_SMTP_HOST` — Gmail's IMAP and SMTP servers. Ports default to 993 (IMAP) and 587 (SMTP).
- `EMAIL_ALLOWED_USERS` — Only emails from these addresses are processed.

---

## 9. Platform Setup — Webhook Listener

The webhook platform lets external services (like the GuardClaw backend) POST events to Hermes.

### Configure in Hermes

Add to `~/.hermes/profiles/guardclaw/.env`:

```bash
WEBHOOK_ENABLED=true
WEBHOOK_PORT=8644
WEBHOOK_SECRET=85bb4eea810321fe86e96e77b56efa261bd8c60c2ab1152c969c25e028566e05
```

Also set in `config.yaml`:

```bash
hermes -p guardclaw config set platforms.webhook.enabled true
hermes -p guardclaw config set platforms.webhook.extra.host 0.0.0.0
hermes -p guardclaw config set platforms.webhook.extra.port 8644
hermes -p guardclaw config set platforms.webhook.extra.secret YOUR_WEBHOOK_SECRET
```

Generate a secret if you don't have one:

```bash
openssl rand -hex 32
```

The webhook listener starts automatically with the gateway and listens on `http://0.0.0.0:8644`.

- `0.0.0.0` binds to all interfaces (required for Cloudflare tunnel access).
- Incoming webhooks must include a valid signature in the `X-Webhook-Signature` header (HMAC SHA-256 of the request body, signed with the secret).

---

## 10. API Server (OpenAI-Compatible)

Hermes exposes an OpenAI-compatible `/v1/chat/completions` endpoint so the GuardClaw backend can call it like any OpenAI model.

### Configure

The setup script handles this, but manually:

```bash
hermes -p guardclaw config set API_SERVER_ENABLED true
hermes -p guardclaw config set API_SERVER_HOST 127.0.0.1
hermes -p guardclaw config set API_SERVER_PORT 8642
hermes -p guardclaw config set API_SERVER_MODEL_NAME guardclaw
```

Generate and store an API key:

```bash
KEY=$(openssl rand -hex 24)
echo "API_SERVER_KEY=$KEY" >> ~/.hermes/profiles/guardclaw/.env
echo "Your API key: $KEY"
```

### Usage from the backend

The GuardClaw backend calls this endpoint to refine alert messages through the Hermes agent:

```bash
curl http://127.0.0.1:8642/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "guardclaw",
    "messages": [{"role": "user", "content": "Classify this alert..."}]
  }'
```

Set these in the GuardClaw backend `.env`:

```bash
GUARDCLAW_USE_HERMES=true
HERMES_API_BASE_URL=http://127.0.0.1:8642/v1
HERMES_API_KEY=your_api_server_key_here

# If using Cloudflare tunnels instead of localhost:
# HERMES_API_BASE_URL=https://api.yourdomain.com/v1
```

If Hermes is not running or the key is wrong, the backend falls back to deterministic local drafts.

---

## 11. Cloudflare Tunnels (Optional)

If you want to expose the local Hermes API server and webhook listener to the internet (e.g., so a remote backend or CI system can reach them), you can use Cloudflare Tunnels. **This is optional** — if everything runs on the same machine, `localhost` URLs are sufficient.

> **Without tunnels**, the API server (`localhost:8642`) and webhook listener (`localhost:8644`) are only reachable from the same machine (or WSL instance). The backend must run locally too.
>
> **With Cloudflare's free quick tunnels** (`cloudflared tunnel --url`), you get a temporary random URL like `https://random-words.trycloudflare.com`. These are free and require no account, but the URL **changes every time you restart the tunnel** — you'll need to update your backend `.env` each time. Good for testing, not for production.
>
> **With named tunnels on your own domain** (described below), you get a stable URL like `https://api.yourdomain.com`. This requires a Cloudflare account and a domain managed by Cloudflare.
>
> **How we set it up:** We registered the domain `guardclaw.app` on Cloudflare, created two named tunnels (`guardclaw-api` and `guardclaw-webhook`), and pointed `api.guardclaw.app` → `localhost:8642` and `webhook.guardclaw.app` → `localhost:8644`. This gives us permanent, stable URLs that the backend on any machine can reach — the Hermes gateway only needs to be running on the WSL instance with the tunnels active.

### Install cloudflared

```bash
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb

# Authenticate with Cloudflare (opens browser)
cloudflared tunnel login
```

### Create the tunnels

```bash
# Create API tunnel
cloudflared tunnel create my-guardclaw-api

# Create webhook tunnel
cloudflared tunnel create my-guardclaw-webhook
```

Each command creates a credentials JSON file in `~/.cloudflared/` (e.g., `c1eefc85-....json`).

### Configure DNS

Point subdomains on your own domain to the tunnels:

```bash
cloudflared tunnel route dns my-guardclaw-api api.yourdomain.com
cloudflared tunnel route dns my-guardclaw-webhook webhook.yourdomain.com
```

### Tunnel config files

Create `~/.cloudflared/api.yml`:

```yaml
tunnel: my-guardclaw-api
credentials-file: /home/YOUR_USER/.cloudflared/TUNNEL_UUID.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:8642
  - service: http_status:404
```

Create `~/.cloudflared/webhook.yml`:

```yaml
tunnel: my-guardclaw-webhook
credentials-file: /home/YOUR_USER/.cloudflared/TUNNEL_UUID.json

ingress:
  - hostname: webhook.yourdomain.com
    service: http://localhost:8644
  - service: http_status:404
```

Replace `YOUR_USER`, `TUNNEL_UUID`, and `yourdomain.com` with your actual values.

### Run the tunnels

```bash
# In separate terminals (or use tmux/screen):
cloudflared tunnel --config ~/.cloudflared/api.yml run
cloudflared tunnel --config ~/.cloudflared/webhook.yml run
```

### Result

| Tunnel | Public URL | Local Target |
|---|---|---|
| `my-guardclaw-api` | `https://api.yourdomain.com` | `http://localhost:8642` |
| `my-guardclaw-webhook` | `https://webhook.yourdomain.com` | `http://localhost:8644` |

All requests to the public URLs require the Hermes API key (`Authorization: Bearer ...`) for the API server, or a valid HMAC SHA-256 signature (`X-Webhook-Signature` header) for webhooks.

---

## 12. Supabase Event Logging

Every Hermes lifecycle event (tool calls, LLM calls, API requests, session events) is logged to a Supabase table for observability. This uses two hook mechanisms:

### 12a. Create the Supabase Table

In your Supabase project's SQL Editor, run:

```sql
create table if not exists public.hermes_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_name text not null,
  session_id text,
  tool_name text,
  cwd text,
  payload jsonb not null
);

create index if not exists hermes_events_created_at_idx
  on public.hermes_events (created_at desc);

create index if not exists hermes_events_session_id_idx
  on public.hermes_events (session_id);

create index if not exists hermes_events_event_name_idx
  on public.hermes_events (event_name);
```

### 12b. Set Supabase credentials

Add to `~/.hermes/profiles/guardclaw/.env`:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIs...your_service_role_key...
SUPABASE_TABLE=hermes_events
```

Use the **service role key** (not the anon key) so the hook can insert rows without RLS restrictions.

### 12c. Shell Hooks — `supabase_events.py`

This is a Python script that receives Hermes hook events on stdin and POSTs them to Supabase.

Create `~/.hermes/profiles/guardclaw/hooks/supabase_events.py`:

```python
#!/usr/bin/env python3
"""Send Hermes shell-hook events to Supabase."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception as exc:
        print(f"supabase hook: invalid stdin JSON: {exc}", file=sys.stderr)
        return 0

    supabase_url = _env("SUPABASE_URL").rstrip("/")
    supabase_key = _env("SUPABASE_KEY")
    table = _env("SUPABASE_TABLE") or "hermes_events"

    if not supabase_url or not supabase_key:
        print("supabase hook: SUPABASE_URL or SUPABASE_KEY missing", file=sys.stderr)
        return 0

    event_name = payload.get("hook_event_name") or ""
    row = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "event_name": event_name,
        "session_id": payload.get("session_id") or None,
        "tool_name": payload.get("tool_name") or None,
        "cwd": payload.get("cwd") or None,
        "payload": payload,
    }

    body = json.dumps(row, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}",
        data=body,
        method="POST",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            if response.status >= 300:
                print(f"supabase hook: HTTP {response.status}", file=sys.stderr)
    except urllib.error.HTTPError as exc:
        details = exc.read(500).decode("utf-8", errors="replace")
        print(f"supabase hook: HTTP {exc.code}: {details}", file=sys.stderr)
    except Exception as exc:
        print(f"supabase hook: request failed: {exc}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Make it executable:

```bash
chmod +x ~/.hermes/profiles/guardclaw/hooks/supabase_events.py
```

### 12d. Wire Shell Hooks to All Events

Register the script for every lifecycle event in `config.yaml`:

```bash
HOOK_CMD="/home/$USER/.hermes/profiles/guardclaw/hooks/supabase_events.py"

for event in pre_tool_call post_tool_call pre_llm_call post_llm_call \
             pre_api_request post_api_request on_session_start on_session_end \
             on_session_finalize on_session_reset subagent_stop \
             pre_approval_request post_approval_response; do
  hermes -p guardclaw config set "hooks.${event}[0].command" "$HOOK_CMD"
  hermes -p guardclaw config set "hooks.${event}[0].timeout" 10
done
```

Enable auto-accept so hooks run without manual approval each time:

```bash
hermes -p guardclaw config set hooks_auto_accept true
```

### 12e. Gateway Hook — `supabase-gateway/`

Gateway hooks use a different mechanism — a directory with a `HOOK.yaml` and a Python `handler.py`. These capture gateway-level events that shell hooks don't see.

Create `~/.hermes/profiles/guardclaw/hooks/supabase-gateway/HOOK.yaml`:

```yaml
name: supabase-gateway
description: Send Hermes gateway lifecycle events to Supabase
events:
  - gateway:startup
  - session:start
  - session:end
  - session:reset
  - agent:start
  - agent:step
  - agent:end
  - command:*
```

Create `~/.hermes/profiles/guardclaw/hooks/supabase-gateway/handler.py`:

```python
"""Send Hermes gateway hook events to Supabase."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def _post(row: dict) -> None:
    supabase_url = _env("SUPABASE_URL").rstrip("/")
    supabase_key = _env("SUPABASE_KEY")
    table = _env("SUPABASE_TABLE") or "hermes_events"

    if not supabase_url or not supabase_key:
        print("[supabase-gateway] SUPABASE_URL or SUPABASE_KEY missing", flush=True)
        return

    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{table}",
        data=json.dumps(row, ensure_ascii=False, default=str).encode("utf-8"),
        method="POST",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            if response.status >= 300:
                print(f"[supabase-gateway] HTTP {response.status}", flush=True)
    except urllib.error.HTTPError as exc:
        details = exc.read(500).decode("utf-8", errors="replace")
        print(f"[supabase-gateway] HTTP {exc.code}: {details}", flush=True)
    except Exception as exc:
        print(f"[supabase-gateway] request failed: {exc}", flush=True)


async def handle(event_type: str, context: dict) -> None:
    payload = {
        "hook_event_name": event_type,
        "context": context,
    }
    row = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "event_name": event_type,
        "session_id": context.get("session_id"),
        "tool_name": None,
        "cwd": None,
        "payload": payload,
    }
    _post(row)
```

### 12f. What Gets Logged

Between both hook types, every significant event is captured:

| Hook Type | Events |
|---|---|
| Shell hooks | `pre_tool_call`, `post_tool_call`, `pre_llm_call`, `post_llm_call`, `pre_api_request`, `post_api_request`, `on_session_start`, `on_session_end`, `on_session_finalize`, `on_session_reset`, `subagent_stop`, `pre_approval_request`, `post_approval_response` |
| Gateway hooks | `gateway:startup`, `session:start`, `session:end`, `session:reset`, `agent:start`, `agent:step`, `agent:end`, `command:*` |

All events land in the same `hermes_events` table with a JSONB `payload` column containing the full event context.

---

## 13. Webhook Subscription — family-alert-triage

The GuardClaw backend sends structured alert payloads to Hermes via webhook. Hermes uses a **webhook subscription** to route these to the agent with a specific prompt template.

### Create the subscription

```bash
hermes -p guardclaw webhook subscribe family-alert-triage \
  --secret "$(openssl rand -hex 32)" \
  --deliver log \
  --prompt 'You are triaging a family alert.

Only notify recipients listed in family_candidates. Never invent recipients or contact IDs.
Use send_message to dispatch via Telegram/email when appropriate.
If a candidate has an explicit telegram_chat_id, use target telegram:<telegram_chat_id>.
If a candidate has an explicit email, use target email:<email>.
You may send to a bare platform target like telegram only as a home-channel fallback when no explicit recipient channel is available or when sending a household summary is useful.
When using any home-channel fallback, explicitly disclose in the message and audit summary that it is being sent to the configured Hermes home channel, not directly to each family member, and explain why.
Return a concise audit summary listing who was notified, by which target type, and whether any home-channel fallback was used.

Packet:
{__raw__}'
```

The subscription is stored in `~/.hermes/profiles/guardclaw/webhook_subscriptions.json`.

### How the backend calls it

The backend POSTs to `http://localhost:8644/webhooks/family-alert-triage` (or your tunnel URL if configured, e.g., `https://webhook.yourdomain.com/webhooks/family-alert-triage`):

```python
import hmac, hashlib, json, httpx

payload = {
    "event_type": "weather.alert",
    "incident_id": "inc-001",
    "alert": {
        "id": "alert-001",
        "source": "NWS",
        "severity": "Extreme",
        "headline": "Tornado Warning",
        "summary": "...",
        "area_label": "Portland Metro",
    },
    "family_candidates": [
        {
            "person_id": "member-1",
            "display_name": "Isaac",
            "telegram_chat_id": "8665494750",
            "location_status": "inside_alert_area",
            "safety_status": "unknown",
        }
    ],
    "policy": {
        "allowed_channels": ["email", "telegram"],
        "max_recipients": 5,
    },
}

body = json.dumps(payload)
signature = hmac.new(
    WEBHOOK_SECRET.encode(), body.encode(), hashlib.sha256
).hexdigest()

response = httpx.post(
    "http://localhost:8644/webhooks/family-alert-triage",
    # Or use your tunnel URL: "https://webhook.yourdomain.com/webhooks/family-alert-triage"
    content=body,
    headers={
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Request-ID": "alert-001",
    },
)
```

---

## 14. SOUL.md — Agent Identity

The `SOUL.md` file defines how the Hermes agent behaves. The GuardClaw version lives in two places:

1. **Repo source of truth:** `hermes/SOUL.md` (this directory)
2. **Active copy:** `~/.hermes/profiles/guardclaw/SOUL.md`

To update the active copy after editing the repo version:

```bash
cp /mnt/c/Users/isaac/GuardClaw/hermes/SOUL.md ~/.hermes/profiles/guardclaw/SOUL.md
```

Or re-run the setup script:

```bash
bash scripts/setup-hermes-guardclaw.sh
```

The SOUL.md is loaded fresh on every message — no gateway restart needed.

Key behaviors defined in the GuardClaw SOUL.md:
- **Identity:** Calm household safety coordinator, not an emergency service.
- **Output rules:** Pure JSON for backend classification requests, plain text for chat.
- **Outbound messaging:** Treats user send requests as full authorization (no confirmation loops).
- **Boundaries:** Never invents household members, never claims official emergency dispatch.
- **Local API awareness:** Knows the backend is at `http://127.0.0.1:8000`.

---

## 15. Running the Gateway

### Start order

1. **Start Cloudflare tunnels** (only if you set them up in step 11):

```bash
# Terminal 1
cloudflared tunnel --config ~/.cloudflared/api.yml run

# Terminal 2
cloudflared tunnel --config ~/.cloudflared/webhook.yml run
```

2. **Stop the default Hermes gateway** (if it's running and shares a Telegram bot token):

```bash
hermes gateway stop
```

3. **Start the GuardClaw gateway:**

```bash
hermes -p guardclaw gateway run
```

Or use the `guardclaw` alias if you've set one up:

```bash
# Add to ~/.bashrc:
alias guardclaw='hermes -p guardclaw'

# Then:
guardclaw gateway run
```

### What starts with the gateway

When `hermes -p guardclaw gateway run` launches, it starts all configured platforms and services simultaneously:
- The **Telegram bot** (long polling)
- The **Discord bot** (websocket)
- The **Email listener** (IMAP polling every 15s)
- The **Webhook listener** on `0.0.0.0:8644`
- The **API server** on `127.0.0.1:8642`
- All **hooks** (shell + gateway)

In our deployment, this single command brings up the entire Hermes integration layer — the backend on any team member's machine can then hit the Cloudflare tunnel URLs to classify alerts and dispatch notifications across all three messaging platforms.

### Switch the active profile

```bash
hermes profile switch guardclaw
```

This makes `guardclaw` the active profile so you can omit `-p guardclaw` from commands.

---

## 16. Testing

### Test webhook health (local)

```bash
curl -fsS http://localhost:8644/health
```

### Test webhook health (tunnel — if configured)

```bash
curl -fsS https://webhook.yourdomain.com/health
```

### Test API server

```bash
curl -fsS http://localhost:8642/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"guardclaw","messages":[{"role":"user","content":"Reply with ok"}]}'
```

### Use the test script

The repo includes a test script that checks all endpoints:

```bash
bash scripts/test-webhook.sh \
  --webhook-tunnel https://webhook.yourdomain.com \
  --hermes-api-key "$HERMES_API_KEY"
```

If you're not using tunnels, omit `--webhook-tunnel` and the script will test localhost only.

### Verify Supabase logging

After running any command, check the `hermes_events` table in your Supabase dashboard. You should see rows for `on_session_start`, `pre_llm_call`, `post_llm_call`, etc.

### Send a test Telegram message

Message your bot on Telegram from an allowed user account. The bot should respond using the GuardClaw SOUL.md personality.

---

## 17. Troubleshooting

### Telegram bot token lock

```
Telegram bot token already in use. Stop the other gateway first.
```

Two profiles are trying to use the same bot token. Stop the other gateway:

```bash
hermes gateway stop          # stops default profile gateway
hermes -p guardclaw gateway run
```

### Webhook signature mismatch

The backend's `HERMES_WEBHOOK_SECRET` must match the subscription's secret in `webhook_subscriptions.json`, **not** the platform webhook secret in `.env`. These are two different secrets:

- `.env` `WEBHOOK_SECRET` — authenticates the webhook platform listener itself.
- `webhook_subscriptions.json` secret — authenticates individual subscription payloads.

### API server returns 401

Check that `HERMES_API_KEY` in the backend `.env` matches `API_SERVER_KEY` in the guardclaw profile `.env`.

### Hooks not firing

1. Check that `hooks_auto_accept` is `true` in the guardclaw `config.yaml`.
2. Check that the hook script is executable: `chmod +x ~/.hermes/profiles/guardclaw/hooks/supabase_events.py`.
3. Check `~/.hermes/profiles/guardclaw/logs/agent.log` for hook errors.
4. Verify Supabase credentials: `SUPABASE_URL` and `SUPABASE_KEY` must be set in the profile `.env`.

### Email not connecting

- Confirm 2FA is enabled on the Gmail account.
- Confirm the app password is correct (no spaces).
- Check that `EMAIL_IMAP_HOST=imap.gmail.com` and `EMAIL_SMTP_HOST=smtp.gmail.com` are set.

### Gateway logs

```bash
cat ~/.hermes/profiles/guardclaw/logs/gateway.log
cat ~/.hermes/profiles/guardclaw/logs/agent.log
cat ~/.hermes/profiles/guardclaw/logs/errors.log
```

---

## Quick Reference — All Environment Variables

These go in `~/.hermes/profiles/guardclaw/.env`:

```bash
# LLM Provider
COPILOT_GITHUB_TOKEN=gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_ALLOWED_USERS=id1,id2,id3,id4
TELEGRAM_HOME_CHANNEL=primary_user_id

# Discord
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_ALLOWED_USERS=id1,id2,id3,id4
DISCORD_HOME_CHANNEL=channel_id

# Email
EMAIL_ADDRESS=guardclaw1@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_ALLOWED_USERS=user1@gmail.com,user2@gmail.com

# Webhook Platform
WEBHOOK_ENABLED=true
WEBHOOK_PORT=8644
WEBHOOK_SECRET=your_webhook_platform_secret

# API Server
API_SERVER_KEY=your_api_server_key

# Supabase (for hooks)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your_service_role_key
SUPABASE_TABLE=hermes_events

# Misc
HERMES_MAX_ITERATIONS=90
TERMINAL_CWD=/mnt/c/Users/isaac/GuardClaw
```
