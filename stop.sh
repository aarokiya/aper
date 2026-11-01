#!/bin/zsh
set -euo pipefail
PROJECT_DIR="${0:A:h}"
RUNTIME_DIR="$PROJECT_DIR/data/.runtime"
stop_tree() {
  local PID="$1"
  local CHILD
  for CHILD in $(pgrep -P "$PID" 2>/dev/null || true); do stop_tree "$CHILD"; done
  if kill -0 "$PID" 2>/dev/null; then kill "$PID"; fi
}
for NAME in server worker; do
  PID_FILE="$RUNTIME_DIR/$NAME.pid"
  if [[ -f "$PID_FILE" ]]; then
    PID="$(<"$PID_FILE")"
    if kill -0 "$PID" 2>/dev/null; then stop_tree "$PID"; fi
    rm -f "$PID_FILE"
  fi
done
print "_aper stopped."
