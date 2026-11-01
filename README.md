# _aper

A local-first Georgia Tech coursework dashboard. It normalizes Canvas and Gradescope into SQLite on your own computer, adds a Study Hub for your courses, grades each class by its syllabus, plans your degree, reads Handshake campus events once a day, and writes deterministic Markdown/JSON files that coding agents can read directly.

**Run your own copy; nothing is shared.** There is no hosted version and no account with us. You clone the repository, sign in to your own Georgia Tech accounts in a dedicated local browser, and everything (database, sessions, study material, profile) stays on your machine.

The interface uses an ink-on-paper look throughout: a quiet rail on the left, serif headings and reading text, hairline rows, pill buttons, and light/dark themes that follow the system unless you pick one.

## Set up with your coding agent

The fastest way to a personalized copy is to hand this repository to a coding agent (Claude Code, Codex, Cursor, and so on) along with a few details about yourself. [AGENTS.md](AGENTS.md) is the agent's runbook; the short version:

1. **Clone and install.**

   ```bash
   git clone https://github.com/aarokiya/aper
   cd aper
   ./setup.sh
   ```

2. **Sign in yourself.** Only you can do this step: each command opens a visible browser window where you finish Georgia Tech SSO and Duo. The agent must not automate it.

   ```bash
   pnpm canvas:login
   pnpm gradescope:login
   pnpm handshake:login   # optional, for Careers
   ```

3. **Tell the agent about yourself:** name, major, threads or concentrations, minors, class standing, catalog year, current courses and their credit hours, career interests, and time zone. Optionally hand over syllabus PDFs, a Degree Works audit export, and a [Groq](https://console.groq.com/) API key.

4. **The agent writes `aper.profile.json`** by copying [`aper.profile.example.json`](aper.profile.example.json) and filling it in. The format is described by [`schemas/profile.schema.json`](schemas/profile.schema.json) (regenerate it with `pnpm schemas`). The file is gitignored.

5. **Sync, apply, verify, start.**

   ```bash
   pnpm sync            # first Canvas + Gradescope sync, so courses exist to match
   pnpm profile:apply   # writes the profile into the local stores
   pnpm profile:show    # prints what is now configured
   ./start.sh           # opens http://127.0.0.1:3000
   ```

`pnpm profile:apply [file]` (default `./aper.profile.json`; add `--dry-run` to preview) works with the server stopped, is safe to rerun, and merges: anything the profile leaves out keeps its current value. Paths inside the profile are relative to the profile file. Course entries are matched by course code (such as `"ABC 1234"`) after a sync; any that don't match a synced Canvas course are reported and skipped, so rerun it after a later sync to pick them up. `APER_TIME_ZONE` is read when the app starts and built into the pages, so after changing the time zone run `./stop.sh && ./start.sh` (`start.sh` rebuilds when `.env` changed).

What the profile can set:

- **You:** greeting name, theme, accent, and the rest of the appearance settings.
- **Courses:** a display alias, credit hours, letter cutoffs `[A, B, C, D]`, a syllabus (`courses[].syllabus`, a file path or pasted text, used to grade the class by its syllabus), and whether the class starts in the Study zone.
- **Careers:** interests and phrases to leave out when ranking Handshake events. Both start empty.
- **Study:** spaced-review and focus-timer preferences.
- **Planner:** a planner file with your degree requirements and a starting plan. The format is in [docs/planner-file.md](docs/planner-file.md), with a complete example at [`examples/planner/plan.json`](examples/planner/plan.json). An agent can build one from your Degree Works audit and the catalog.
- **Study Hub:** a path to your course study material. The format is in [docs/study-hub-format.md](docs/study-hub-format.md), with an example in [`examples/study-hub/`](examples/study-hub/). An agent can write one from your syllabi and course notes.
- **Time zone:** `student.timeZone` is written to `.env` as `APER_TIME_ZONE` (an IANA name such as `America/Los_Angeles`; default `America/New_York`). Deadlines, day boundaries, and event times use it.
- **Groq key:** optional; written to `.env` for the AI features.

You can change all of it later in the app (Customize, Settings, Grades, Planner) without touching the profile.

## What works

- Persistent real-browser Canvas authentication without a PAT; SSO and Duo stay manual.
- API-first Canvas sync for courses, assignments, submissions, assignment groups/weights, modules/items, announcements, pages, files, syllabus content, planner items, totals, and released feedback/rubrics when Canvas exposes them.
- Authenticated, low-rate Gradescope browser sync for student-visible courses, assignment tables, release/due dates, submission state, visible scores, and source links, plus user-directed artifact import.
- The Study Hub (lectures, practice, studio problems, flashcards, practice exams, formula sheets, guides) as the rail's Study zone, with progress saved locally, and a red/yellow/green status dot on every class in the rail.
- Today: a full-width hero with your photo, slideshow, or a generative scene, a live clock and greeting, and the day's work, exams, study, and campus events below it. A screensaver mode, and a customizer for background, fonts, accent, theme, text size, greeting, and section order.
- A grade calculator that merges Canvas and Gradescope per assignment and can grade each class by its syllabus.
- A course planner: a four-year plan (fall, spring, and summer terms) you edit and drag around, checked against your degree requirements and current Canvas classes, exported as a one-page PDF.
- Files filterable by class, then by module, including files Canvas only posts inside modules.
- Careers: Handshake campus events, read once a day, ranked against an editable career profile, filterable by kind, date, format, and host, and one click from Google Calendar.
- Raw response preservation plus typed normalized SQLite tables and provenance; local workflow state, notes, priority, personal target dates, estimates, pinning, local tasks, subtasks, course aliases, timer sessions, change detection, FTS5 search (including Study Hub weeks and guides), Markdown corpus, normalized JSON, backup, hourly scheduler, and optional LaunchAgent.

## The Study Hub

The rail's Study zone is the Study Hub: your own course study material (lectures, practice, studio problems, flashcards, practice exams, formula sheets, guides), imported from a JSON file described in [docs/study-hub-format.md](docs/study-hub-format.md) and extended for spaced review. **Overview** lists every current class, **Daily review** mixes every course's due items into one session, and each Study Hub course opens its own sub-navigation (next exam countdown, course search with `/`, course home, this week, **Behind** or **Caught up**, proof grader, review queue, flashcards, formula sheet, guides, semester at a glance, **Grades** for a course whose hub data has syllabus grading, and the week list with progress bars, status dots, and Complete ✓ / Behind tags). Every other class sits below it under **Classes** and opens its Canvas course page.

- Routes: `/study` (overview: Daily review summary, coming-up exams, catch up, this week, Canvas due-soon, other classes, materials), `/study/daily` (Daily review), `/study/<id>` (course home with its catch-up status and a "From Canvas" block: current grade, next assignments, latest announcement), `/study/<id>/week/<n>?tab=lecture|practice|studio|cards|parsons|x-<examId>`, plus `/behind`, `/grader`, `/review`, `/cards?tab=review|browse|mine|stats` (Flashcards), `/formulas` (falls back to the course's `cheatsheet` guide), `/semester`, `/guides`, `/guides/<pageId>`, and `/grades` (404 for a course without `grading`). `/courses` redirects to `/study`. A week link without `?tab=` opens the course's default week tab.
- **Complete and behind.** A week is complete when its lecture is marked reviewed and every checklist item, practice question (answered correctly), studio problem (rated Got it), and card (known) is done; practice exams and quick checks don't count. A week that has ended without being complete is behind: its page says what is left with a link to each tab, the course home and the overview list the weeks to catch up, `/study/<id>/behind` lists them with the lectures they covered, and the semester timeline marks weeks green (complete) or red (behind).
- **Quick checks** are short quizzes a lecture part can carry (`quiz` in the hub data). They appear under that part's notes and are checked like practice questions. Each wrong choice gets its own explanation, and **Show answer** gives the full solution. The Lecture tab counts correct answers, and **Clear my quick-check answers** resets a week's answers so you can retake it. Answers are keyed by the question's text (`lq` in progress).
- **Grades** is the hub's own syllabus tracker (`grading` in the hub data, optional): every quiz, homework, and exam on the syllabus, past and upcoming, as a blank for its score (`17/20`, `85`, or `85%`), with the syllabus weights, its drop rule, and `avgLowest` items (averaged into the lowest of the items they list, only when that raises it, as with a final that replaces the lowest midterm). It shows the grade so far, truncated rather than rounded. Scores are typed by hand and saved with study progress (`gb`); the app-wide **Grades** calculator, which reads Canvas and Gradescope, is separate.
- **Progress** (practice answers, quick-check answers, studio ratings, flashcards, checks, practice-exam answers and points, AI grades, real exam dates, the scores typed into Grades, spaced-review memory and daily review counts, Arrange results, and your own cards) is saved in the local database (`settings` key `study-progress:<id>`), never touched by sync. Each change is also kept in the browser until the database has it, and whichever copy is newer wins when a page loads, so a reload or a failed save can't lose work. The rail foot has **Export progress** (downloads `study-hub-progress-<date>.json` in the `gt-study-hub-progress` format), **Import progress** (after you confirm, replaces the progress of every course in the file), and **Reset this course**. `pnpm backup` includes it.
- **Hide sidebar** in the rail foot, or F, hides the rail for a full-width study view and asks for full screen; the **Sidebar** button, F, or Esc brings it back. It only applies on study pages.
- Math is typeset with KaTeX using `$…$` and `$$…$$` delimiters in the hub data.
- Keyboard: ← / → change week outside fields; arrow keys move between tabs; Space or Enter flips a flashcard; 1–4 rate a card or review item; U undoes the last review rating; Enter checks a practice answer; `/` focuses the course search; F hides or shows the sidebar; Esc shows it again.
- The content is personal course material, so it lives in `data/study/hub.json` (gitignored). Import or replace it with `pnpm study:import <path>` (a hub `.json` file, a folder containing `courses.json` and an optional `progress.json`, or a hub `.html`), through `studyHub` in `aper.profile.json`, or in **Settings → Study Hub**. Start from [`examples/study-hub/`](examples/study-hub/). Progress bundled with the hub is merged per course, and the newer copy wins, so saved work is never replaced by an older snapshot. Removing the hub keeps saved progress.

### Spaced review, Key ideas, and Arrange

The study side is retrieval-first: testing yourself and spacing that practice out beat rereading (Dunlosky et al., 2013), and for programming, tracing code and ordering given lines (Parsons problems) build the skills that code writing rests on.

- **Spaced review** schedules every card, quick check, practice question, Arrange problem, and your own cards with FSRS, the scheduler Anki offers (implemented here with `ts-fsrs`). **Daily review** (`/study/daily`, also on the overview, course home, Today, and the command palette) mixes due items from every course, adds a limited number of new items per course, and shows Again / Hard / Good / Easy with the time until each would come back (keys 1–4; Space or Enter shows the answer; U undoes). Typed cards and questions are checked first and suggest a grade. A first answer anywhere (Notes quick checks, Quiz, Cards, Arrange) starts an item's schedule. Later reviews only move the schedule, so a lapse never reopens a completed week. Items answered before spaced review existed start out as reviews from their week's end.
- **Flashcards** (`/study/<id>/cards`) has four tabs. **Review** starts the course's own queue or a **custom session**: courses, a week range or "Up to <exam>", item kinds, due / new / weak / everything / review-ahead, size, mixed or by-week order, and whether ratings move the schedule; sessions can be saved as presets. **Browse** filters every item by week, kind, and state and shows due date, stability, and predicted recall, with Open, Suspend, and Reset. **My cards** writes your own cards (plain text with `code` and ``` blocks, optional typed answers, week, and tags) and imports or exports TSV/CSV. **Stats** shows today, streak, recall rate, 30 days of reviews, and a 14-day forecast.
- **Key ideas** (the Notes tab's default for long notes) shows each section's plain-English and Remember boxes and its first example, puts warnings under **Watch out**, collapses orientation, worked-example, and exam-trap sections to one line, and keeps every quick check visible. **Full notes** or **Show full section** restores the complete text. Courses with short notes are unchanged.
- **Arrange** is a week tab of Parsons problems: put the lines in order (click, drag, or Alt+↑/↓) and leave out the lines that don't belong; Check points at the first misplaced line.
- **Settings → Study** (`settings` key `study-prefs`) sets the retention target, maximum interval, learning steps, daily limits, when a new day starts, new-item order, mixing, answer shuffling, which item kinds are reviewed, and, per course: Daily review on or off, notes mode, default week tab, and hidden tabs. It also manages saved sessions and the **focus timer** (rail foot): focus and break lengths, long-break cycle, auto-start, and sound.

### Study zone, classes, and status dots

Classes with Study Hub materials start in the Study zone. Move one between Study and Classes with the arrow that appears when you hover it (always shown on touch screens) or by dragging it to the other list; in Classes it opens its Canvas page instead. The choice is saved locally (`settings` key `rail-study-zone`).

Each class has a dot right after its code: **red** when you're behind, **yellow** when something is open today, **green** when you're caught up. Hover a class for the reason. **Overview** shows the worst dot of the Study zone.

- Every class counts its open Canvas and Gradescope work the way Today does (your target date wins over the due date; work you marked done, submitted, graded, or excused doesn't count): anything past due in the last 30 days is behind, anything due later today is yellow.
- Study zone classes also follow the Study Hub's lights: any ended week that isn't complete is behind; while the current week is under way and not yet complete, the dot is yellow (hover for today's events from its schedule). The dot updates as you study.
- Behind wins over due today. Dots re-read open work on every page change, when the window regains focus, and right after you change a task.

## Course planner

**Planner** in the rail is a four-year plan modeled on a Georgia Tech advisor's thread plan worksheet: next semester options, a grid of fall, spring, and summer terms for each year with hours and tags, the credit you already have, degree notes, and hour totals.

- Edit any course name, hours, or tag in place: **T** transfer credit, **C** completed, **IP** in progress, **R** recommended next semester (listed under Next semester options), **ALT** alternative. Drag a course by its handle to another semester, or click the handle and choose **Move here** (Esc cancels). Removing a course offers **Undo**.
- **Requirements** checks the plan against your degree requirements: each line says Done, In progress, the semester it's planned for, or Not in the plan with an **Add** button. A course counts by its code ("CS 4210 or 4220" counts as either), by a phrase for placeholders like "Social Science Elective", or by the requirement it was added for. Georgia's legislative requirements turn red when they're planned in or after the term where you reach 90 hours.
- The current term is checked against your Canvas classes; a class missing from the plan gets an **Add** button.
- **Export PDF** downloads a one-page Letter PDF laid out like that worksheet. It uses the PDF standard Helvetica fonts, so nothing is embedded.
- Start by importing a planner file: JSON with your requirements (from Degree Works and the catalog) and a starting plan. The format is documented in [docs/planner-file.md](docs/planner-file.md), and [`examples/planner/plan.json`](examples/planner/plan.json) is a complete example. Use the button on the Planner page, `pnpm planner:import <file>`, or `planner` in `aper.profile.json`. Importing again keeps your plan when it's newer than the file's, and **Reset plan** puts the file's starting plan back.
- The file and your plan are stored locally (`settings` keys `planner-file` and `planner-plan`), never touched by sync, and backed up with the database. As with study progress, each change is kept in the browser until the database has it, and the newer copy wins when the page loads.

## Today, appearance, and the screensaver

Today opens with a hero sized by you: an uploaded photo (or a slideshow of several, with an optional slow pan) or one of five generative scenes (Aurora, Dusk, Contours, Constellation, Paper). Over it sit the date, a live clock, "Good morning/afternoon/evening" with your name, a one-sentence summary of the day, and an optional line of your own. Below are Needs attention, Tomorrow, Coming up (Study Hub exams), This week in study, Next 2 weeks, Campus events, Recently graded, and Recent changes, in the order you choose.

**Customize** (the rail, the hero, Settings, or the command palette) changes everything live:

- Background: upload photos (resized in the browser to at most 3840px), pick the focal point, slideshow and interval, dim, blur, hero height, motion; or a scene.
- Type: display/reading, interface, and code fonts from a self-hosted catalog (STIX Two, Newsreader, Fraunces, Instrument Serif, Cormorant, Playfair, EB Garamond, Literata, IBM Plex, Inter, Geist, Manrope, Figtree, Source Sans, Atkinson Hyperlegible, Bricolage, Space Grotesk, JetBrains Mono, Geist Mono, Fira Code), or upload your own `.woff2/.woff/.otf/.ttf`; text size.
- Color: System/Light/Dark and an accent (Ink keeps the Study Hub's monochrome).
- Greeting, Today section order and visibility, and the screensaver.

The **screensaver** starts after the idle time you set, from the hero's Screensaver button, or with ⌥Z: a full-screen clock, date, greeting, next deadline, and next exam over your background, drifting slowly to avoid burn-in. Any key or deliberate pointer move ends it. Preferences are stored in the `settings` table; uploads in `data/appearance/media/` (gitignored, included in backups).

## Grades

The grade calculator merges Canvas and Gradescope per assignment. Canvas's score counts whenever Canvas has one; otherwise Gradescope's score counts, scaled to the Canvas assignment's points. Assignments that exist only on Gradescope count too: each is placed in the Canvas category its title suggests (falling back to a "Gradescope" bucket that pools points in unweighted courses and waits for your choice in weighted ones), and you can change it with **Counts toward** or leave it out. Ungraded Gradescope-only work counts as remaining work in projections. Every item shows where its score came from, and disagreements are spelled out.

Syncing never replaces a Canvas score with Gradescope's: Gradescope fills a submission's score only while Canvas has none, and its own observation is kept under the `gradescope-scores` setting and `submissions.provider_json.gradescope`. Each course shows its current grade (released scores only), its projected grade (what-ifs plus an adjustable assumption for blank work), and the score needed on the remaining work for an A or B, using the syllabus's rules when you adopted them and otherwise Canvas category weights and drop rules, and skipping unpublished, omitted, and excused items. A Canvas submission still pending review (a quiz awaiting manual grading) counts as ungraded, not as its partial auto-score, which is what Canvas's own total does. Credit hours and letter cutoffs (the syllabus's when it states them, otherwise 3 and 90/80/70/60), what-ifs, and category choices are saved locally.

**Grading by the syllabus.** Open a class and read its syllabus: upload the PDF (or an HTML or text file), read the Canvas syllabus page, read a synced syllabus file, or paste the grading section. _aper finds the weights, drop rules, ranked exams ("best midterm 25%, next 20%, lowest 15%"), point pools with a cap and either/or sources ("points out of 70; WeBWorK or MyMathLab at 0.2 each"), the letter scale, and credit hours, maps each part to the Canvas groups or assignments that hold its scores, and shows the proposal before anything changes. **Use these rules** saves it (`settings` key `grade-policy:<courseId>`); **Edit rules** changes any part, **Read a new syllabus** replaces it, and **Use Canvas's weights** removes it. Assignments the syllabus doesn't count are listed apart, and rules it states but the calculator can't apply (bonuses, penalties, attendance deductions) are listed as notes. Today, course pages, and the Study Hub show the same grade.

To set this up without the UI, give a course a `syllabus` in `aper.profile.json` (a `.pdf`, `.html`, or `.txt` path, or the pasted grading section with one part per line) and run `pnpm profile:apply`. It adopts the rules directly when every part of the syllabus matches Canvas work; otherwise it saves nothing and reports why (no grading breakdown found, or which parts didn't match), and you can finish the job in **Grades**. Applying the same syllabus again keeps the adopted rules, including any edits you made in **Grades**. Credit hours and cutoffs set in the profile win over the syllabus's.

Each class's current letter is a large colored tile (A green, B blue, C amber, D orange, F red), and its whole row takes that letter's tint; the projected letter is a smaller pill in the same colors.

## Files

`/files` lists every Canvas file you can reach, including files your classes only post inside modules (the Canvas Files tab is blocked for many courses). Filter by class, then by module (or "Not in a module"), by type (PDF, Slides, Docs, Other), and by search text; filters live in the URL so a filtered view can be linked. Files saved on this device open locally through `/api/files/<id>`; everything else opens its Canvas page.

## Careers (Handshake)

Campus events from Handshake, on `/careers` and on Today: Handshake's relevance-ranked events list plus the events Georgia Tech posts itself. Connect once in **Settings → Handshake** (or `pnpm handshake:login`): a visible window opens at Georgia Tech's Handshake login and you finish SSO/Duo yourself. After that the worker reads Handshake once a day after 7 AM (`HANDSHAKE_DAILY_HOUR`), separately from the hourly Canvas + Gradescope sync, and **Refresh now** reads on demand. Because Handshake's Cloudflare check never completes headless, reads open a real Chrome window for a few minutes and close it when done.

Careers lists every upcoming event by date (grouped by day) or by best match, under one filter bar: search, kind chips with counts, when (today, next 7 or 14 days, in the event's time zone), format (hybrid counts as both in person and virtual), posted by Georgia Tech or employers, and dismissed, with "N of M events" and **Clear filters**. Filters live in the URL, so reload and back keep them.

Every event shows its organizer's logo from Handshake (an initials tile when Handshake has none) and why it ranked ("Ranked #2 by Handshake, career fair, matches software engineering, on campus"), computed from a career profile of interests and phrases to leave out. The profile starts empty; set it with `careers` in `aper.profile.json` or in **Settings → Handshake**. **Add to Google Calendar** opens Google Calendar's new-event page in a new tab with the title, time, place, organizer, description, and Handshake link filled in, in whatever Google account your browser is signed in to; press Save there. _aper never signs in to Google. Registering still happens on Handshake (**Open in Handshake**), since _aper never RSVPs for you. Dismiss is local only. Details are in [docs/handshake-support.md](docs/handshake-support.md).

## AI (optional)

With your own Groq key (Settings → Groq API key, `groqApiKey` in `aper.profile.json`, or `GROQ_API_KEY` in `.env`) you get command-palette capture, the Study Hub tutor ("Ask a tutor" and the tutor buttons beside problems), and **Grade my work** (write on screen, upload photos, or type). Optional: `GROQ_MODEL` (default `qwen/qwen3.8-27b`), `GROQ_VISION_MODEL` (must accept images), and `GROQ_BASE_URL` (any OpenAI-compatible server, such as a local model). Without a key every AI button stays hidden.

Nothing goes to Groq unless you press Send or Grade it. The tutor sends the course's tutor rules, the attached problem text, and the last 12 turns; the grader sends the problem, the reference solution, and your work (text, or up to 3 images, 12 MB total, shrunk in the browser first). Grades stay in local SQLite with the rest of your study progress. The key stays on the server in `.env` (mode 0600) and is never echoed.

## Architecture

```text
Dedicated Playwright profile
        │ student-authorized reads
        ▼
Canvas · Gradescope providers (hourly)      Handshake provider (daily, visible window)
        │                                            │
        ├── private raw snapshots ───────────────────┤
        ▼                                            ▼
SQLite + Drizzle ── FTS5 ── localhost API ── Next.js UI (rail · Study Hub · Today · Careers)
        │                         ▲
        ├── Markdown/JSON corpus  │
        ├── local task/timer/study/appearance state (never overwritten by sync)
        └── data/study/hub.json (imported Study Hub)
```

The providers, normalization, product UI, local productivity state, and exports are kept separate. Common provider facts are first-class columns; provider-specific edge fields remain inspectable in JSON and raw snapshots. Every browser task takes a lock file next to the profile, so the hourly sync, the daily Handshake read, and sign-in windows never collide.

## Requirements

- macOS: tested on Apple Silicon. `setup.sh`, `start.sh`, `stop.sh`, and the optional LaunchAgent are zsh/macOS scripts.
- Linux: likely works if you run the `pnpm` commands directly (`pnpm install`, `pnpm exec playwright install chromium`, `pnpm db:migrate`, `pnpm build`, then `pnpm start` and `pnpm worker`), but it is untested.
- Windows: untested; WSL is the most likely path.
- Node.js 22.13 or newer
- pnpm 11+ (or Corepack)
- Google Chrome, or the Playwright Chromium installed by setup

## Manual setup

If you aren't using a coding agent:

```bash
git clone https://github.com/aarokiya/aper
cd aper
./setup.sh
./start.sh
```

Open **Settings → Reauthenticate Canvas**, or run:

```bash
pnpm canvas:login
```

A visible dedicated browser window opens. Complete Georgia Tech SSO and Duo yourself. The app polls only the Canvas session-check endpoint, closes the window after success, stores the resulting session in `~/.academic-command-center/browser/`, performs the first sync, and generates the local corpus. It does not read or save your password or Duo response.

Then connect Gradescope from Settings or with `pnpm gradescope:login`, optionally connect Handshake from Settings or with `pnpm handshake:login`, and import your Study Hub with `pnpm study:import <path>` or in Settings. Set your greeting name in **Customize**, career interests in **Settings → Handshake**, and syllabi, credits, and cutoffs in **Grades**. Or write `aper.profile.json` yourself and run `pnpm profile:apply`, as in [Set up with your coding agent](#set-up-with-your-coding-agent).

Your copy gets its own database and browser profile; the repository supplies no account or academic data. If you aren't on Eastern time, set `APER_TIME_ZONE` in `.env` (see `.env.example`) or `student.timeZone` in the profile.

Normal startup is `./start.sh`; stop with `./stop.sh`. The server binds to `127.0.0.1:3000` only.

## Sync behavior

- **Sync now** (rail foot or command palette) queues Canvas followed by the low-rate Gradescope browser sync, reports live progress, and refreshes the current view when both finish. Handshake's sign-in state never affects it.
- `workers/scheduler.ts` performs an hourly full sync while `./start.sh` is running, and the daily Handshake read.
- Calls use bounded concurrency, timeouts, pagination, and exponential retry for transient server responses.
- A failed category/course produces a partial run and does not erase cached data.
- A class Canvas stops listing (dropped or ended) stops being current: it leaves the rail, Today, the calendar, upcoming work, and Grades, and Gradescope, whose rosters keep withdrawn students, skips that term's copy of it. Its synced data stays, and it comes back if Canvas lists it again.
- Expired authentication marks the provider as requiring login and leaves every cached object available.
- Every object retains last-seen/last-synced/source timestamps. The rail reports the last successful sync.

## Data locations

```text
data/academic.db                 normalized SQLite database
data/raw/canvas/run-*/           pretty raw Canvas responses (private)
data/raw/handshake/run-*/        Handshake read snapshots (private)
data/raw/gradescope/imports/     user-imported artifacts
data/study/hub.json              imported Study Hub content (private)
data/appearance/media/           uploaded backgrounds and fonts (private)
data/documents/                  deterministic Markdown corpus
data/normalized/                 pretty normalized JSON
data/downloads/                  conservative cache of useful PDFs/text/Office files
data/debug/                      validation reports/debug bundles
logs/app.log                     application log
logs/sync.log                    scheduler/sync log
~/.academic-command-center/browser/  session profile (never backed up)
```

`data/documents/INDEX.md` links current courses and upcoming work. Each assignment document includes YAML provenance, source timestamps/URL, exact extracted description, submission state, released feedback/rubric, and local notes. Ingestion never asks an LLM to rewrite academic text.

## Local API

Read-only source-backed endpoints:

- `GET /api/courses` and `/api/courses/:id`
- `GET /api/assignments`, `/api/assignments/upcoming`, `/api/assignments/:id`
- `GET /api/grades`
- `GET /api/announcements`
- `GET /api/search?q=malloc`
- `GET /api/sync/status`, `GET /api/handshake/status`
- `GET /api/study/hub`, `GET /api/study/search/:id?q=`

Local-only mutation endpoints update task metadata, timers, grade calculator what-ifs (`PUT /api/grades/calculator`), syllabus grading rules (`POST /api/grades/syllabus/:courseId` with a `file` upload, `{ "source": "canvas" }`, `{ "source": "file", "fileId": 67 }`, or `{ "text": "…" }` proposes rules without saving; `PUT /api/grades/policy/:courseId` adopts them and `DELETE` returns to Canvas's groups), study progress (`GET/PUT/DELETE /api/study/progress/:id`; `GET /api/study/progress` exports every course's progress as a progress file and `POST` imports one), study preferences (`GET/PUT /api/study/prefs`; the `PUT` body is the bare prefs object, such as `{ "retention": 0.9, … }`, not wrapped in `{ "prefs": … }`), the Study Hub import (`POST/DELETE /api/study/hub`), the rail's Study zone (`PUT /api/rail` with `{ "studyZone": ["abc1000", …] }`, using the hub's course ids; `GET /api/rail` returns each class's open work for the dots), appearance (`GET/PUT /api/appearance`, `POST /api/appearance/media`, `DELETE /api/appearance/media/:id`), the career profile (`GET/PUT /api/handshake/profile`), and dismissing campus events (`PATCH /api/handshake/events/:id` with `{ "dismissed": true }`). There are no Canvas, Gradescope, or Handshake mutation endpoints.

Most `PUT` endpoints replace the whole stored value, so a partial body resets the fields it leaves out. To change a few fields, `GET` first and send back the merged object, or put the change in `aper.profile.json` and run `pnpm profile:apply`, which merges.

The course planner has `GET /api/planner` (the planner file and your plan), `PUT /api/planner` (save your plan), `POST /api/planner` (import a planner file), and `DELETE /api/planner` (back to the file's starting plan).

The calendar merges assignments, Canvas planner/calendar entries, and dated local tasks. Assignment-linked events and title/time-equivalent planner duplicates are shown only once. A personal target date changes the task's planning date without changing the Canvas due date.

## Common commands

```bash
pnpm dev                 development server
pnpm build               production build
pnpm lint                oxlint
pnpm test                unit/integration tests
pnpm test:e2e            browser-level application tests
pnpm privacy:check       block private/generated files and secret markers
pnpm sync                manual CLI sync (Canvas + Gradescope)
pnpm canvas:login        sign in to Canvas (you finish SSO/Duo), then sync
pnpm gradescope:login    sign in to Gradescope
pnpm handshake:login     connect Handshake, then read it
pnpm handshake:sync      read Handshake now
pnpm profile:apply [file]   apply aper.profile.json (or another file); --dry-run reports without writing
pnpm profile:show        print what is configured in every local store
pnpm schemas             regenerate the JSON Schemas in schemas/
pnpm study:import <path>    import or replace the Study Hub (hub .json, a folder with courses.json, or a hub .html)
pnpm planner:import <file>  import or replace the course planner file (requirements and a starting plan)
pnpm corpus              regenerate Markdown, JSON and search index
pnpm validate:canvas     data-integrity and count report
pnpm backup              timestamped backup archive
BACKUP_DOWNLOADS=1 pnpm backup
```

Backups include SQLite, local task/timer/study/appearance state, the imported Study Hub, uploaded backgrounds and fonts, corpus, normalized exports, and optionally downloaded files. They exclude browser cookies/profile, credentials, logs, and caches.

## Automatic startup

Run `./setup.sh --launch-agent` to install `~/Library/LaunchAgents/com.local.aper.plist`. It starts the app at login. The scheduler runs only while the application process is running.

## Troubleshooting

**Canvas says authentication required:** use Settings → Reauthenticate or `pnpm canvas:login`; finish SSO/Duo manually. Old data remains available.

**Canvas changed:** inspect `/debug`, `logs/sync.log`, and `data/debug/canvas-validation.json`. Structured endpoints are centralized in `lib/canvas`; rendered-page fallback contracts are documented in `docs/canvas-discovery.md`.

**Handshake shows nothing or a read failed:** Settings → Handshake shows the last problem. If it says sign-in is needed, reconnect. If an item could not be read, its page is kept under `data/raw/handshake/run-<id>/failed/` so the selectors in `lib/handshake/parse.ts` can be adjusted.

**The rail has no Study zone, only Classes:** no Study Hub is imported yet; use Settings → Study Hub.

**A Study zone class stays red:** hover it. "Weeks 1–5 not complete" means those weeks have ended with work left; open **Behind** in the course's sub-navigation to see exactly what is left in each, or move the class to Classes to track only its Canvas work.

**Search is stale:** run `pnpm corpus` or click **Regenerate corpus** in Settings.

**Database backup/restore:** stop the app, make a backup with `pnpm backup`, and restore `academic.db` plus desired `documents`/`normalized`/`study`/`appearance` folders into `data/`.

## Privacy model

The app is single-user, localhost-only, and cloud-free by default. Raw snapshots, the imported Study Hub, uploaded media, and the database contain private student information and are ignored by Git. The debug view/export excludes cookies, passwords, tokens, and browser profiles. No OpenAI, Anthropic, embedding, analytics, or telemetry service is required; the optional Groq key sends only what you explicitly ask the tutor or grader about.

Each student clones and runs their own copy; there is no shared instance. This is not a multi-user web service: its localhost APIs intentionally have no account system, so do not bind it to `0.0.0.0`, deploy it to a shared server, expose it through a tunnel, or port-forward it. Your `aper.profile.json`, `.env`, `data/`, and `logs/` are gitignored. Run `pnpm privacy:check` before every push and read [SECURITY.md](SECURITY.md) plus [docs/sharing-and-privacy.md](docs/sharing-and-privacy.md).

## Gradescope browser sync

Use **Settings → Connect Gradescope** (or `pnpm gradescope:login`) once. Authentication happens visibly in the same private persistent browser profile as Canvas; passwords, SSO, Duo, and CAPTCHAs are never automated or copied. Routine sync is DOM-only and deliberately low-rate: one dashboard load plus one assignment-table load per enrolled course. See `docs/gradescope-support.md` for field-level coverage.

## What this deliberately does not do

- submit assignments, quizzes, discussion posts, or grades;
- apply, save, follow, message, or RSVP on Handshake;
- bypass authorization, access another student, infer unpublished grades, or seek instructor-only data;
- automate Duo, CAPTCHA, or SSO credentials;
- automate Gradescope or Handshake login challenges, use hidden endpoints, evade anti-bot controls, or recursively scrape LTI platforms;
- expose the app beyond localhost;
- require cloud hosting, Docker, Redis, a PAT, or an AI key.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, use fictional data in fixtures and reports, and never paste personal academic data into an issue.

## Disclaimer

_aper is an independent student project. It is not affiliated with or endorsed by the Georgia Institute of Technology, Instructure (Canvas), Gradescope or Turnitin, or Handshake. Use it only with your own accounts and in line with each service's terms and Georgia Tech's policies. The Groq integration is optional; nothing is sent to Groq unless you add a key and ask.

## Credits

Built by @aarokiya, Ravindra Lakkireddy (@rlakki08), and Subham Dash.

## License

[MIT](LICENSE)
