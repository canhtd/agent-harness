#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

USER_SHELL="${SHELL:-/bin/zsh}"
RESOLVED_PATH="$("$USER_SHELL" -lc 'echo $PATH' 2>/dev/null | tail -1)"
if [ -n "$RESOLVED_PATH" ]; then
	export PATH="$RESOLVED_PATH"
fi

cd "$REPO_DIR"

if [ -f .env ]; then
	set -a
	# shellcheck disable=SC1091
	source .env
	set +a
fi

SKILL_PATH="$REPO_DIR/.claude/skills/babysit/SKILL.md"

exec claude -p "You are a health monitor agent. Run the full babysit checklist from $SKILL_PATH and print a summary report. Check: orchestrator service, lock files, worktrees, remote branches, Linear state, and stale PRs." \
	--verbose --output-format stream-json
