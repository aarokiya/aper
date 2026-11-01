#!/bin/zsh
set -euo pipefail
PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"
RUNTIME_DIR="$PROJECT_DIR/data/.runtime"
mkdir -p "$RUNTIME_DIR" logs

if ! command -v node >/dev/null 2>&1; then
  print -u2 "Node.js 22.13 or newer is required. Run ./setup.sh after installing Node."
  exit 1
fi
if command -v pnpm >/dev/null 2>&1; then
  PNPM=("$(command -v pnpm)")
elif command -v corepack >/dev/null 2>&1; then
  PNPM=("$(command -v corepack)" pnpm)
else
  print -u2 "pnpm is not available. Run ./setup.sh first."
  exit 1
fi

"${PNPM[@]}" db:migrate
# .env is part of the build: APER_TIME_ZONE is inlined into the client bundle.
if [[ ! -f .next/BUILD_ID ]] || find app components lib workers -type f -newer .next/BUILD_ID -print -quit | grep -q . || { [[ -f .env ]] && [[ .env -nt .next/BUILD_ID ]]; }; then "${PNPM[@]}" build; fi

SERVER_RUNNING=0
WORKER_RUNNING=0
if [[ -f "$RUNTIME_DIR/server.pid" ]] && kill -0 "$(<"$RUNTIME_DIR/server.pid")" 2>/dev/null; then SERVER_RUNNING=1; fi
if [[ -f "$RUNTIME_DIR/worker.pid" ]] && kill -0 "$(<"$RUNTIME_DIR/worker.pid")" 2>/dev/null; then WORKER_RUNNING=1; fi

if (( SERVER_RUNNING == 0 )); then
  nohup "${PNPM[@]}" start >> logs/app.log 2>&1 &
  print "$!" > "$RUNTIME_DIR/server.pid"
fi
if (( WORKER_RUNNING == 0 )); then
  nohup "${PNPM[@]}" worker >> logs/sync.log 2>&1 &
  print "$!" > "$RUNTIME_DIR/worker.pid"
fi

for _ in {1..60}; do
  if curl -fsS "http://127.0.0.1:3000/api/sync/status" >/dev/null 2>&1; then
    if command -v open >/dev/null 2>&1; then open "http://127.0.0.1:3000"; fi
    print "_aper is running at http://127.0.0.1:3000"
    exit 0
  fi
  sleep 1
done
print -u2 "The server did not become ready. See logs/app.log"
exit 1
