#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-guardclaw}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_HOME="$HOME/.hermes/profiles/$PROFILE"

if ! command -v hermes >/dev/null 2>&1; then
  echo "Hermes CLI was not found on PATH."
  exit 1
fi

if ! hermes profile show "$PROFILE" >/dev/null 2>&1; then
  hermes profile create "$PROFILE" --clone
fi

mkdir -p "$PROFILE_HOME"
cp "$ROOT/hermes/SOUL.md" "$PROFILE_HOME/SOUL.md"
echo "Copied SOUL.md -> $PROFILE_HOME/SOUL.md"

hermes -p "$PROFILE" config set terminal.cwd "$ROOT"
hermes -p "$PROFILE" config set API_SERVER_ENABLED true
hermes -p "$PROFILE" config set API_SERVER_PORT 8642
hermes -p "$PROFILE" config set API_SERVER_HOST 127.0.0.1
hermes -p "$PROFILE" config set API_SERVER_MODEL_NAME guardclaw

if ! grep -q 'API_SERVER_KEY' "$PROFILE_HOME/.env" "$PROFILE_HOME/config.yaml" 2>/dev/null; then
  if command -v openssl >/dev/null 2>&1; then
    KEY="$(openssl rand -hex 24)"
  else
    KEY="guardclaw-local-$(date +%s)"
  fi
  printf '\nAPI_SERVER_KEY=%s\n' "$KEY" >> "$PROFILE_HOME/.env"
fi

echo "GuardClaw Hermes profile configured: $PROFILE"
echo "Profile home: $PROFILE_HOME"
echo "Run: hermes -p $PROFILE gateway run"
echo "If Telegram was cloned from the default profile, stop the default gateway before starting this one."
