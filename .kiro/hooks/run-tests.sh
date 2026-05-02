#!/bin/bash
# Runs before git commit and gh pr create to ensure tests pass.
# Exit 2 to block the tool; exit 0 to allow it.

EVENT=$(cat)
COMMAND=$(echo "$EVENT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)

# Only intercept commit and PR creation commands
if ! echo "$COMMAND" | grep -qE '(git commit|gh pr create|glab mr create)'; then
  exit 0
fi

ROOT="$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")"

echo "Running tests before allowing: $COMMAND" >&2

# Backend tests
if [ -d "$ROOT/backend" ]; then
  echo "--- Backend (pytest) ---" >&2
  (cd "$ROOT/backend" && \
    [ -d .venv ] && source .venv/bin/activate; \
    python -m pytest tests/ -q 2>&1) >&2
  if [ $? -ne 0 ]; then
    echo "Backend tests failed. Commit/PR blocked." >&2
    exit 2
  fi
fi

# Frontend typecheck (no test suite configured)
if [ -d "$ROOT/frontend" ]; then
  echo "--- Frontend (tsc) ---" >&2
  (cd "$ROOT/frontend" && npm run typecheck 2>&1) >&2
  if [ $? -ne 0 ]; then
    echo "Frontend typecheck failed. Commit/PR blocked." >&2
    exit 2
  fi
fi

echo "All checks passed." >&2
exit 0
