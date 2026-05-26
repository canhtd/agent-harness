#!/bin/bash
set -e

PLIST_DEST="$HOME/Library/LaunchAgents/com.agent-harness.orchestrator.plist"

# Unload — tolerate failure if agent isn't currently loaded
launchctl unload "$PLIST_DEST" 2>/dev/null || true

rm -f "$PLIST_DEST"

echo "Uninstalled com.agent-harness.orchestrator"
