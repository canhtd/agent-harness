#!/bin/bash
set -e

PLIST_DEST="$HOME/Library/LaunchAgents/com.agent-harness.orchestrator.plist"
SERVICE_TARGET="gui/$(id -u)/com.agent-harness.orchestrator"

# Unload — tolerate failure if agent isn't currently loaded
launchctl bootout "$SERVICE_TARGET" 2>/dev/null || true

rm -f "$PLIST_DEST"

echo "Uninstalled com.agent-harness.orchestrator"
