#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_SRC="$SCRIPT_DIR/com.agent-harness.orchestrator.plist"
PLIST_NAME="com.agent-harness.orchestrator.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"
LOG_DIR="$HOME/.agent-harness/logs"

mkdir -p "$LOG_DIR"

# Unload existing agent if loaded
if launchctl list | grep -q "com.agent-harness.orchestrator"; then
  echo "Unloading existing agent..."
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Generate plist with resolved paths
sed -e "s|__REPO_PATH__|$REPO_DIR|g" -e "s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DEST"

echo "Installed plist to $PLIST_DEST"

launchctl load "$PLIST_DEST"
echo "Loaded com.agent-harness.orchestrator"

# Verify
sleep 2
if launchctl list | grep -q "com.agent-harness.orchestrator"; then
  echo "OK — agent-harness is running"
  launchctl list | grep "com.agent-harness.orchestrator"
else
  echo "ERROR — agent not found in launchctl list" >&2
  exit 1
fi
