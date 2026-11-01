# Security and privacy

## Intended deployment model

_aper is a single-user localhost application. Each student clones the repository and runs an independent copy on their own computer, with their own dedicated browser profile and local database. There is no hosted or shared instance.

Do not bind the server to `0.0.0.0`, port-forward it, expose it through a tunnel, deploy it to a shared host, or hide it behind a secret URL. The local APIs assume the operating-system user is trusted and have no multi-user authentication or authorization.

## Data that must stay out of Git

Never commit, upload, or paste into an issue:

- `aper.profile.json` (your personal profile; only `aper.profile.example.json` is committed);
- `data/` databases, raw snapshots, normalized exports, documents, downloads, backups, debug bundles, the imported Study Hub (`data/study/`), uploaded backgrounds and fonts (`data/appearance/`), or runtime PID files;
- `logs/`, Playwright traces, screenshots, or reports;
- `.env*` other than `.env.example`;
- browser profiles, storage-state files, cookies, passwords, Duo responses, tokens, keys, or certificates;
- downloaded coursework, graded submissions, syllabi, Degree Works audits, resumes, or job-search artifacts.

Run `pnpm privacy:check` before every push. GitHub CI runs the same check on pull requests, but CI cannot undo a secret that has already entered Git history.

## Authentication boundaries

Canvas, Gradescope, and Handshake sign-in happens in a dedicated local Playwright profile outside this repository (`~/.academic-command-center/browser/` by default). SSO, Duo, and CAPTCHAs stay manual: the student completes them in a visible window, and _aper never reads or stores a password or Duo response. Do not point `ACADEMIC_BROWSER_DIR` at your everyday browser profile or at a path inside the repository.

Coding agents setting up a copy must not try to automate SSO, Duo, or CAPTCHA; the student does those steps themselves.

## If private data is committed

Stop before pushing if you can: remove the data from the index and history, rotate any exposed credential or session, and rerun the privacy check. If the commit was pushed (to a fork or a pull request), treat the data as disclosed: sign out of the affected sessions or revoke credentials first, then rewrite the history.

## Reporting a vulnerability

Report security issues privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** ([github.com/aarokiya/aper/security](https://github.com/aarokiya/aper/security)). Please don't open a public issue for a vulnerability.

Describe the problem and how to reproduce it with synthetic data. Don't include real logs, screenshots, raw provider responses, cookies, or account details; if a reproduction needs real data, say so and we'll work out a safe way to share it.

Supported version: the latest commit on the default branch.
