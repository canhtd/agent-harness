#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Resolve PATH from user's login shell (handles nvm, fnm, volta, etc.)
# tail -1 strips any motd/plugin output that precedes the actual PATH
USER_SHELL="${SHELL:-/bin/zsh}"
RESOLVED_PATH="$("$USER_SHELL" -lc 'echo $PATH' 2>/dev/null | tail -1)"
if [ -n "$RESOLVED_PATH" ]; then
	export PATH="$RESOLVED_PATH"
fi

mkdir -p "$HOME/.agent-harness/logs"

cd "$REPO_DIR"
exec pnpm start
