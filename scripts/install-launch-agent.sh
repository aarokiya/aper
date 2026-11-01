#!/bin/zsh
set -euo pipefail
PROJECT_DIR="${0:A:h:h}"
TARGET="$HOME/Library/LaunchAgents/com.local.aper.plist"
mkdir -p "${TARGET:h}"
sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" "$PROJECT_DIR/launchd/com.local.aper.plist.template" > "$TARGET"
launchctl unload "$TARGET" 2>/dev/null || true
launchctl load "$TARGET"
print "Installed $TARGET"
