#!/bin/bash
set -euo pipefail

PLIST_NAME="com.agent-harness.orchestrator.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

if [ ! -f "$PLIST_DEST" ]; then
  echo "Plist not found at $PLIST_DEST — nothing to uninstall"
  exit 0
fi

launchctl unload "$PLIST_DEST" 2>/dev/null || true
echo "Unloaded com.agent-harness.orchestrator"

rm "$PLIST_DEST"
echo "Removed $PLIST_DEST"

echo "OK — agent-harness launchd agent removed"
