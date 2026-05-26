#!/bin/bash
cd "$(dirname "$0")"

# Resolve PATH for node/pnpm — supports nvm, fnm, volta, and system installs
if [ -f "$HOME/.bashrc" ]; then
  source "$HOME/.bashrc" 2>/dev/null
elif [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc" 2>/dev/null
elif [ -f "$HOME/.profile" ]; then
  source "$HOME/.profile" 2>/dev/null
fi

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
