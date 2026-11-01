# Contributing

Thanks for helping. _aper is a local-first app that each Georgia Tech student runs on their own computer, so the most important rule is simple: **no personal data in the repository, issues, or pull requests.**

## Development setup

You need Node.js 22.13 or newer and pnpm 11+ (or Corepack). The scripts are tested on macOS.

```bash
git clone https://github.com/aarokiya/aper
cd aper
./setup.sh      # installs deps and Playwright Chromium, migrates the database
pnpm dev        # http://127.0.0.1:3000
```

You don't need a Georgia Tech account to work on most of the code: the unit and integration tests use synthetic fixtures. To see real data, sign in with your own account (`pnpm canvas:login`, `pnpm gradescope:login`) and keep that data on your machine.

This project uses Next.js 16, which differs from older versions. Read the relevant guide in `node_modules/next/dist/docs/` before changing Next.js APIs.

## Conventions

- **Local only.** The server binds to `127.0.0.1`. Don't add hosted services, telemetry, analytics, or accounts, and don't expose endpoints beyond localhost. Optional integrations (like Groq) must stay off until the student configures them.
- **Read-only toward providers.** Never submit, post, RSVP, or change anything on Canvas, Gradescope, or Handshake, and never automate SSO, Duo, or CAPTCHA.
- **zod everywhere.** Validate stored and incoming data with zod schemas. Settings go through `readSetting`/`writeSetting` in `lib/db/settings.ts`. If you change a schema the profile uses, run `pnpm schemas` and commit the updated files in `schemas/`.
- **No per-student assumptions.** Nothing specific to one student, major, or course belongs in code or defaults. Time zones come from `APP_TIME_ZONE` in `lib/time-zone.ts`.
- **Fictional fixtures.** Tests, fixtures, examples, and screenshots use made-up courses, students, and events (for example `ABC 1234`, "Fixture Student", "Example Robotics Club"). Never use your real schedule, grades, syllabi, section codes, names, or emails.
- **Tests.** Unit tests in `tests/unit`, integration tests in `tests/integration` (vitest), browser tests in `tests/e2e` (Playwright).
- **Copy.** Plain, sentence-case UI text.
- **Docs.** Update `README.md`, `AGENTS.md`, or `docs/` when behavior or setup changes.

## Before you open a pull request

```bash
pnpm privacy:check
pnpm lint
pnpm test
pnpm build
```

Run `pnpm test:e2e` too if you changed UI flows. CI runs the same checks.

Then check `git status` and the staged file list yourself: no `aper.profile.json`, `data/`, `logs/`, `.env`, browser state, downloads, or personal absolute paths. The pull request template has a privacy checklist; fill it in.

## Issues

Use the bug report or feature request template. Redact everything personal before posting: names, GTIDs, emails, grades, course sections, assignment content, raw provider responses, logs, cookies, and screenshots of real coursework. Describe the problem with fictional data instead.

Security problems go through GitHub's private vulnerability reporting, not a public issue. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
