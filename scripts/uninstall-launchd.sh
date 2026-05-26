#!/bin/bash
set -euo pipefail

PLIST_NAME="com.agent-harness.orchestrator"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

DOMAIN_TARGET="gui/$(id -u)"
SERVICE_TARGET="$DOMAIN_TARGET/$PLIST_NAME"

launchctl bootout "$SERVICE_TARGET" 2>/dev/null || true

if [ -f "$PLIST_DEST" ]; then
	rm "$PLIST_DEST"
	echo "Removed $PLIST_DEST"
else
	echo "$PLIST_DEST not found, nothing to remove"
fi

echo "Uninstalled $PLIST_NAME"
