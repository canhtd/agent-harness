#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_NAME="com.agent-harness.orchestrator"
PLIST_TEMPLATE="$SCRIPT_DIR/$PLIST_NAME.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/.agent-harness/logs"

# Substitute placeholders and XML-escape values using python3.
# python3 str.replace() is literal — no sed metacharacter or delimiter issues.
# html.escape() covers &, <, > which is sufficient for plist <string> content.
python3 -c "
import sys, html
template = open(sys.argv[1]).read()
repo = html.escape(sys.argv[2], quote=False)
home = html.escape(sys.argv[3], quote=False)
result = template.replace('__REPO_PATH__', repo).replace('__HOME__', home)
sys.stdout.write(result)
" "$PLIST_TEMPLATE" "$REPO_PATH" "$HOME" > "$PLIST_DEST"

plutil -lint "$PLIST_DEST"

chmod +x "$SCRIPT_DIR/start.sh"

DOMAIN_TARGET="gui/$(id -u)"
SERVICE_TARGET="$DOMAIN_TARGET/$PLIST_NAME"

launchctl bootout "$SERVICE_TARGET" 2>/dev/null || true
launchctl bootstrap "$DOMAIN_TARGET" "$PLIST_DEST"

echo "Installed and loaded $PLIST_NAME"

if launchctl list "$PLIST_NAME" &>/dev/null; then
	echo "Verified: $PLIST_NAME is running"
else
	echo "Warning: $PLIST_NAME not found in launchctl list"
	exit 1
fi
