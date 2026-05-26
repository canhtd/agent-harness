#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_SRC="$SCRIPT_DIR/com.agent-harness.orchestrator.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.agent-harness.orchestrator.plist"

mkdir -p "$HOME/.agent-harness/logs"

# Unload existing agent if loaded
launchctl unload "$PLIST_DEST" 2>/dev/null || true

# Substitute placeholders and install
sed -e "s|__REPO_PATH__|$REPO_PATH|g" -e "s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DEST"

echo "Installed plist to $PLIST_DEST"

# Load the agent
launchctl load "$PLIST_DEST"
echo "Loaded com.agent-harness.orchestrator"

# Verify
if launchctl list | grep -q agent-harness; then
  echo "Verified: agent-harness is registered with launchd"
else
  echo "Warning: agent-harness not found in launchctl list" >&2
  exit 1
fi
