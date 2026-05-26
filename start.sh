#!/bin/bash
cd "$(dirname "$0")"

# Resolve PATH via user's login shell (handles nvm, fnm, volta, any version manager)
USER_SHELL="${SHELL:-/bin/zsh}"
RESOLVED_PATH="$("$USER_SHELL" -lc 'echo $PATH' 2>/dev/null | tail -1)"
[ -n "$RESOLVED_PATH" ] && export PATH="$RESOLVED_PATH"

while true; do
  git pull origin main --ff-only 2>/dev/null
  pnpm start
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo "orchestrator crashed (exit $EXIT_CODE) — restarting in 10s"
    sleep 10
  else
    echo "orchestrator exited clean — pulling and restarting"
    sleep 2
  fi
done
