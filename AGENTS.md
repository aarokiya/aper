<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent runbook: setting up a student's copy of _aper

_aper is a single-user, localhost-only Georgia Tech dashboard (Next.js 16 + SQLite). Each student runs their own copy. Your job as a coding agent is usually one of two things: **personalize a fresh clone for the student in front of you**, or **work on the code**. Both are covered below. The README's "Set up with your coding agent" section is the student-facing version of this runbook.

## 1. Ask the student

Collect these before writing anything. Don't guess; leave a field out of the profile if the student doesn't know it.

- Name to show in the greeting.
- Major, threads or concentrations, and minors.
- Class standing (first-year, second-year, …) and catalog year.
- Current courses, by course code (for example `ABC 1234`), with credit hours. Optionally a short alias for each, and which ones they want in the Study zone.
- Career interests and anything to leave out (for ranking Handshake events). These start empty.
- Time zone, as an IANA name (`America/New_York` if they're in Atlanta).
- Optional: syllabus PDFs or text for each course, a Degree Works audit export (for the planner), the Georgia Tech catalog page for their degree, study material for a Study Hub, a preferred theme and accent, and a Groq API key for the AI features.

## 2. What only the student can do

Sign-ins. Each command opens a visible browser window; the student completes Georgia Tech SSO and Duo there. Run the command, tell the student what to expect, and wait for it to finish.

```bash
pnpm canvas:login       # required; also runs the first sync
pnpm gradescope:login   # recommended
pnpm handshake:login    # optional, for Careers
```

Never type, store, or automate passwords, Duo, or CAPTCHAs, and never copy cookies from the student's everyday browser.

## 3. Command sequence

```bash
git clone https://github.com/aarokiya/aper
cd aper
./setup.sh                      # installs deps and Playwright Chromium, migrates the database
# student signs in (section 2)
cp aper.profile.example.json aper.profile.json
# fill in aper.profile.json from section 1
pnpm sync                       # Canvas + Gradescope, so courses exist to match
pnpm profile:apply --dry-run    # preview
pnpm profile:apply              # write it
pnpm profile:show               # verify
./start.sh                      # serves http://127.0.0.1:3000
```

About the profile:

- The format is [`schemas/profile.schema.json`](schemas/profile.schema.json); `aper.profile.example.json` shows every section. Point `$schema` at the schema so editors validate it. If you change the zod schemas, regenerate with `pnpm schemas`.
- Sections: `student` (name, major, threads, minors, class standing, catalog year, time zone), `appearance` (greeting name, theme, accent, …), `careers` (`interests`, `excludes`), `study` (spaced-review and timer preferences), `planner` (a path or inline planner file), `studyHub` (a path), `courses`, and optional `groqApiKey`. Leave a section out to keep what is stored.
- `courses[]` entries are `{ code, alias?, credits?, cutoffs?: [A, B, C, D], syllabus?, studyZone? }`, matched by course code against synced Canvas courses. Unmatched entries are reported and skipped, never fatal; rerun after a later sync.
- `syllabus` is a `.pdf`, `.html`, or `.txt` path or pasted text. Pasted text must keep one grading part per line (`Homework 20%` on its own line), as the syllabus prints it. The rules are adopted only when every part of the syllabus matches Canvas work; otherwise nothing is saved and the report says why. Tell the student, and point them to the course's **Grades** panel to finish it. Once rules from a source are adopted, applying the same source again keeps them, including edits the student made under Grades.
- Profile `credits` and `cutoffs` win over the syllabus's.
- Paths in the profile are relative to the profile file.
- `student.timeZone` becomes `APER_TIME_ZONE` and `groqApiKey` becomes `GROQ_API_KEY` in `.env`. The time zone is read at startup and built into the pages, so restart with `./stop.sh && ./start.sh` after changing it.
- `profile:apply` works with the server stopped, merges (fields the profile omits keep their stored values), and is idempotent. Rerun it whenever the profile changes.

## 4. Verify

- `pnpm profile:show` prints, as JSON, the stored student profile, time zone, greeting name, career profile, each synced course's credits, cutoffs, and grading source, the planner, and the Study Hub with its Study zone. `pnpm profile:apply` exits non-zero only when the profile is missing or doesn't match the schema.
- Open http://127.0.0.1:3000: the greeting shows the student's name, the rail lists their classes, and Grades shows credits and any adopted syllabus rules. Check **Planner** and **Study** if you imported them, and **Careers** if Handshake is connected.
- Report anything `profile:apply` skipped or warned about to the student, in plain words.

## 5. Building planner and Study Hub files

- **Planner:** follow [docs/planner-file.md](docs/planner-file.md) and start from [`examples/planner/plan.json`](examples/planner/plan.json). Take requirements from the student's Degree Works audit and the catalog for their catalog year; take completed and in-progress courses from the audit. Term ids are `F26`, `S27`, `U27` (fall, spring, summer). Write it somewhere outside Git (next to `aper.profile.json` works, since paths are relative to the profile) and reference it from `planner`, or import directly with `pnpm planner:import <file>`. When the audit is ambiguous, ask instead of inventing requirements.
- **Study Hub:** follow [docs/study-hub-format.md](docs/study-hub-format.md) and start from [`examples/study-hub/`](examples/study-hub/) (`courses.json`). Build it from the student's own syllabi, notes, and course schedule. Reference it from `studyHub`, or import with `pnpm study:import <path>`. The imported copy lives in `data/study/hub.json` (gitignored).

## 6. Guardrails

- Never commit `aper.profile.json`, `data/`, `logs/`, `.env`, browser profiles, syllabi, audits, or anything else personal. Run `pnpm privacy:check` before any commit.
- Never automate SSO, Duo, CAPTCHA, or provider login challenges.
- Never bind the server beyond `127.0.0.1`, expose it through a tunnel, or deploy it. The local APIs have no authentication.
- Never submit, post, RSVP, or change anything on Canvas, Gradescope, or Handshake. The app is read-only toward providers.
- Academic integrity: don't write answers or solutions for open (ungraded, in-progress) assignments, quizzes, or exams into the Study Hub or anywhere else. Study material should come from lectures, notes, and released practice. Follow each course's collaboration and AI policy.
- Prefer the profile and the app's own stores over editing the SQLite database by hand.

## 7. Working on the code

```bash
pnpm dev              # dev server on 127.0.0.1:3000
pnpm lint             # oxlint
pnpm test             # vitest unit + integration
pnpm test:e2e         # Playwright
pnpm build            # production build
pnpm privacy:check    # blocks private files and secret markers
```

Conventions:

- Validate stored and incoming data with zod. Settings live in the SQLite `settings` table through `readSetting`/`writeSetting` in `lib/db/settings.ts`.
- Use `APP_TIME_ZONE` from `lib/time-zone.ts`; never hard-code a time zone.
- Unit tests go in `tests/unit`, integration tests in `tests/integration` (vitest). Fixtures use fictional courses, students, and events only.
- UI copy is plain and in sentence case.
- Read `node_modules/next/dist/docs/` before touching Next.js APIs (see the block above).
- Update the README and `docs/` when behavior changes. See [CONTRIBUTING.md](CONTRIBUTING.md).
