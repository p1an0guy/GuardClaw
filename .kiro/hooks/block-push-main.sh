#!/bin/bash
# Block direct pushes to main/master.
EVENT=$(cat)
COMMAND=$(echo "$EVENT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

if echo "$COMMAND" | grep -qE 'git push.*(origin\s+)?(main|master)'; then
  echo "Direct push to main/master is blocked. Use a feature branch and open a PR." >&2
  exit 2
fi
exit 0
