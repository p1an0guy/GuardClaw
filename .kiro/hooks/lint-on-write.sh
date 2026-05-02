#!/bin/bash
# Auto-lint/format after file writes.
EVENT=$(cat)
FILES=$(echo "$EVENT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ops = d.get('tool_input', {}).get('operations', [])
print('\n'.join(op.get('path', '') for op in ops if op.get('path')))
" 2>/dev/null)

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$CWD")"

for FILE in $FILES; do
  case "$FILE" in
    *.py)
      (cd "$ROOT/backend" && [ -d .venv ] && source .venv/bin/activate; \
        ruff format "$FILE" 2>/dev/null; ruff check --fix "$FILE" 2>/dev/null) ;;
    *.ts|*.tsx|*.js|*.jsx)
      (cd "$ROOT/frontend" && npx prettier --write "$FILE" 2>/dev/null) ;;
  esac
done
exit 0
