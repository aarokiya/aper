# Running your own copy and keeping it private

_aper is meant to be cloned and run by each student on their own computer. Sharing the code is the whole point; sharing a running instance, a database, or a browser profile is not supported. There is no hosted version and no shared server.

## Your copy

1. Clone `https://github.com/aarokiya/aper` into a directory of your own.
2. Install Node.js 22.13 or newer, then run `./setup.sh`.
3. Sign in yourself: `pnpm canvas:login`, `pnpm gradescope:login`, and optionally `pnpm handshake:login`. Each opens a visible window where you finish Georgia Tech SSO and Duo.
4. Describe yourself in `aper.profile.json` (copy `aper.profile.example.json`), then run `pnpm sync` and `pnpm profile:apply`.
5. Start the app with `./start.sh`. It listens on `127.0.0.1:3000` only.

The repository ships no account, cookie, database, course list, job history, assignment content, or generated corpus. Everything personal is created on your computer by your own sign-ins and your own profile.

## What stays on your computer

These are gitignored and checked by `pnpm privacy:check`:

| Path | Contents |
| --- | --- |
| `aper.profile.json` | your name, major, courses, career interests, and file paths |
| `.env` | local settings and your optional Groq key |
| `data/` | the SQLite database, raw provider snapshots, corpus, downloads, imported Study Hub, uploaded backgrounds and fonts, backups |
| `logs/` | app and sync logs |
| `~/.academic-command-center/browser/` | the dedicated sign-in profile (outside the repository) |

Only `aper.profile.example.json`, `.env.example`, and the synthetic files in `examples/` and `tests/fixtures/` are committed.

## Updating your copy

Stop the app, pull, and restart:

```bash
./stop.sh
git pull --ff-only
./setup.sh
./start.sh
```

Setup reinstalls dependencies and runs database migrations without removing your synced data, study progress, or local task state. `pnpm profile:apply` is safe to rerun at any time.

## Contributing without leaking data

- Run `pnpm privacy:check` before every commit you push and before opening a pull request.
- Use fictional courses, students, and events in fixtures and screenshots (for example, `ABC 1000` or `Example Robotics Club`), never your real schedule, grades, or syllabi.
- Never paste personal data into an issue or pull request: no names, GTIDs, emails, grades, course sections, raw provider responses, logs, cookies, or screenshots with real coursework. Redact first.
- A secret that reaches a public fork or pull request is disclosed. Revoke the session or credential before cleaning up history.

## Boundaries

The application trusts the local operating-system user. It has mutation endpoints for local notes, task state, timers, aliases, imports, and sync controls, but no multi-user authentication. Never bind it to `0.0.0.0`, deploy it to a shared host, port-forward it, or expose it through a tunnel.

Canvas, Gradescope, and Handshake can change their pages or terms. Use the integrations only with your own student account, in line with each service's terms and Georgia Tech's policies, and read the provider notes in this folder.
