#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

TMP_LIST="$(mktemp)"
trap 'rm -f "$TMP_LIST"' EXIT HUP INT TERM
git ls-files --cached --others --exclude-standard > "$TMP_LIST"

fail=0
while IFS= read -r file; do
  case "$file" in
    data/*.db*|data/raw/*|data/normalized/*|data/documents/*|data/downloads/*|data/debug/*|data/backups/*|data/.runtime/*|data/e2e/*|data/study/*|data/appearance/*|logs/*|browser/*|.env|.env.*|.npmrc|*.pem|*.key|*.p12|*.db|*.db-*|*.sqlite|*.sqlite-*|*.tar.gz|*.tgz|aper.profile.json)
      case "$file" in
        .env.example|data/raw/.gitkeep|data/normalized/.gitkeep|data/documents/.gitkeep|data/downloads/.gitkeep|data/debug/.gitkeep) ;;
        *) printf 'Blocked private/generated path: %s\n' "$file" >&2; fail=1 ;;
      esac
      ;;
  esac
done < "$TMP_LIST"

if [ "$fail" -ne 0 ]; then exit 1; fi

SENSITIVE_PATTERN='[\/]Users[\/][^/[:space:]]+|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE'" KEY-----"
if xargs grep -IEn "$SENSITIVE_PATTERN" < "$TMP_LIST"; then
  printf 'Privacy check found a home-directory path, token, or private key marker.\n' >&2
  exit 1
fi

printf 'Privacy check passed for %s repository files.\n' "$(wc -l < "$TMP_LIST" | tr -d ' ')"
