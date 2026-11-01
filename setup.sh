#!/bin/zsh
set -euo pipefail
PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

if ! command -v node >/dev/null 2>&1; then
  print -u2 "Node.js 22.13 or newer is required: https://nodejs.org/"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(`.`)[1]')"
if (( NODE_MAJOR < 22 || (NODE_MAJOR == 22 && NODE_MINOR < 13) )); then
  print -u2 "Node.js 22.13 or newer is required; found $(node --version)."
  exit 1
fi

if command -v pnpm >/dev/null 2>&1; then
  PNPM=("$(command -v pnpm)")
elif command -v corepack >/dev/null 2>&1; then
  PNPM=("$(command -v corepack)" pnpm)
else
  print -u2 "pnpm is required. Run: corepack enable"
  exit 1
fi

mkdir -p data/{raw/canvas,raw/gradescope,normalized,documents,downloads,debug} logs
"${PNPM[@]}" install --frozen-lockfile
"${PNPM[@]}" exec playwright install chromium
"${PNPM[@]}" db:migrate
"${PNPM[@]}" privacy:check

if [[ "${1:-}" == "--launch-agent" ]]; then
  "$PROJECT_DIR/scripts/install-launch-agent.sh"
fi
print "Setup complete. Run ./start.sh"
