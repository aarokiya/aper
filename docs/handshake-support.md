# Handshake support

_aper reads one thing from the student's Handshake account once a day: campus events, from Handshake's relevance-ranked events list and the events Georgia Tech posts itself. They land in **Careers** (`/careers`) and in the Today page's "Campus events" section.

The integration is a read-only, authenticated DOM reader built on the same dedicated persistent Playwright profile used by Canvas and Gradescope. It never imports cookies from a personal browser, never automates SSO, Duo, or CAPTCHA, never calls private Handshake APIs, and never registers, saves, follows, messages, or RSVPs on Handshake.

## Connecting

- **Settings → Handshake → Connect Handshake** or **Careers → Connect Handshake** opens a visible Chrome window at `https://gatech.joinhandshake.com/login`. Sign in with Georgia Tech SSO and Duo in that window. _aper polls the page (not the keyboard) until a signed-in student page on `app.joinhandshake.com` shows its navigation, then saves the session cookies to `~/.academic-command-center/browser/handshake-storage-state.json` (mode `0600`) and starts the first read. The window waits up to 15 minutes.
- Terminal alternative: `pnpm handshake:login` (same flow, then a read), and `pnpm handshake:sync` for a read without signing in.

Sign-in is "connected" when the current page is on `app.joinhandshake.com` (or the school's `*.joinhandshake.com` host), is not a login/SSO path, and renders student navigation (links to `/job-search`, `/stu/…`, `/explore`, or `/inbox`; these are only used to recognize Handshake's signed-in navigation).

## Why reads open a window

Handshake sits behind Cloudflare. Its browser check ("Just a moment…", "Performing security verification") never completes in headless Chrome, so a headless read only ever sees the check page. Reads therefore open a real, visible Chrome window on the same private profile; it closes by itself when the read finishes (a few minutes for the defaults). _aper does not disguise automation or bypass the check: it waits up to 30 seconds for the check to clear on its own, and records `Handshake's browser check (Cloudflare) did not finish` if it does not. Set `HANDSHAKE_HEADLESS=1` to try headless reads where the check passes.

## Cadence

Handshake never runs as part of the hourly **Sync now** (Canvas + Gradescope), and its sign-in state never makes that sync fail.

- **Daily:** the background worker (`pnpm worker`) checks every 15 minutes and reads Handshake when the student has connected at least once, the local time is after `HANDSHAKE_DAILY_HOUR` (default 7), and the last successful read is more than 20 hours old. After a failure it retries after 2 hours; when sign-in is needed it waits 20 hours instead of probing a signed-out session.
- **On demand:** **Refresh now** on Careers or in Settings (`POST /api/handshake/sync`). Concurrent requests join the same run; `GET /api/handshake/status` reports progress (`latestRun.progressLabel`).
- The persistent Chrome profile can only be open once, so every browser task (academic sync, Handshake read, Handshake sign-in) takes a lock file next to the profile (`.aper-browser.lock`). A Handshake read that is in progress delays a manual Canvas sync by its remaining time (typically a few minutes) instead of failing it. Locks held by a dead process or older than 45 minutes are cleared.

## What a read does

All navigation is sequential with a pause (`HANDSHAKE_DELAY_MS`, default 700 ms) between pages. A read collects up to `HANDSHAKE_MAX_EVENTS` (default 30) campus events:

1. Opens the relevance-sorted list `https://app.joinhandshake.com/stu/events?collection=ALL&eventFormat=HYBRID&sort=RELEVANCE&date=ALL` (override with `HANDSHAKE_EVENTS_URL`) and the same list with `&postedBySchool=true`, interleaving the two so Georgia Tech's own fairs and sessions are not crowded out.
2. Skips events whose card already shows they are over, opens the rest at `/stu/events/:id`, and stores title, organizer, category, start/end and time zone, location, in-person/virtual/hybrid, the visible RSVP or registration state, posted-by-school, description, and image. Past events are skipped.

Organizer logos come from the event page (the employer's `assets/institutions/<employer id>/` logo, otherwise the logo whose alt names the organizer, such as a school's `assets/schools/<id>/` logo) or, for events the run only lists, the card's logo; a page logo wins over a card logo, an existing logo is never cleared, and rows without one show the organizer's initials.

## Extraction contract

Every field prefers the most stable signal available, in this order:

1. JSON-LD `Event` blocks;
2. OpenGraph `og:title`, `og:description`, `og:image`;
3. canonical links: `/stu/events/:id`, employer links `/e/:id` or `/employers/:id`;
4. semantic headings: the event's own `h1` (generic page headings such as "Events" are skipped) and `h2`/`h3` sections such as "About this event", "What you'll get out of it", "Location", read up to the next heading of the same or higher rank so a description's own `h4` subheadings stay in it;
5. the fact block Handshake renders right under an event title (organizer, when, Virtual/In-person/Hybrid, address and room, label such as "General" or "Hiring");
6. text heuristics for dates ("Fri, Oct 2 · 5 PM-7 PM EDT", "Tuesday, October 6, 2026 6:00 PM – 7:30 PM EDT"), format, category, and RSVP buttons. `time[datetime]` is used only as a last resort because Handshake fills it with a bare `MM/DD/YYYY` date.

Parsing runs on the rendered HTML (`page.content()`) in pure functions in `lib/handshake/parse.ts` and `lib/handshake/dates.ts`, covered by fixtures in `tests/unit/handshake.test.ts`. An event that cannot be read is recorded in `sync_runs.errors_json`, its HTML is kept under `data/raw/handshake/run-<id>/failed/` for diagnosis, and the run ends `PARTIAL`; cached rows are never deleted. A list page with no event links is also kept there.

## Relevance

Ranking is transparent: every point carries a reason shown under the event ("Ranked #2 by Handshake, career fair, matches software engineering, on campus."). It is computed by pure functions in `lib/handshake/relevance.ts` from a local **career profile** (Settings → Handshake → Career profile; stored in the `settings` table as `handshake-profile`):

- interests (empty by default: set them in `careers.interests` in `aper.profile.json` and run `pnpm profile:apply`, or edit them in Settings), with common synonyms for frequent interests (SWE, ML/AI, analytics…);
- leave-out phrases (empty by default; `careers.excludes` in the profile, or Settings), such as "senior" or "PhD only".

Until the student adds interests, events rank by Handshake's own rank and the event type (plus timing, format, and who posted them); interests only add matches.

Events score on category (career fair, tech talk, info session, workshop, panel, networking), on-campus or in-person, interest matches (title over description and organizer), happening within 14 days, posted by Georgia Tech, Handshake's relevance rank, the student's own registration, and leave-out phrases in the title or stated requirements. Profiles saved before events-only reads may still hold `classYear`, `jobTypes`, and `locations`; those keys are ignored when read and dropped on the next save.

Saving the profile re-ranks every cached event immediately.

## Filtering on Careers

Careers lists every upcoming event (by date, grouped by day, or by best match) under one filter bar. The predicates live in `lib/handshake/event-filters.ts` (pure, covered by `tests/unit/handshake-event-filters.test.ts`), and the filters are mirrored into the URL so reload and back keep them:

| Filter    | Query                       | Matches                                                                                                                                                                     |
| --------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search    | `q=`                        | every word appears in the title, organizer, location, kind, or description                                                                                                  |
| Kind      | `kind=` (repeatable)        | any selected kind; events without a category count as "Other". Each chip counts the events the other filters leave                                                          |
| When      | `when=today\|7d\|14d`       | takes place today, or within the 7 or 14 calendar days starting today, in the event's own time zone; an event already under way counts as today; undated events never match |
| Format    | `format=in-person\|virtual` | hybrid events count as both; events of unknown format as neither                                                                                                            |
| Posted by | `host=school\|employers`    | posted by Georgia Tech, or by anyone else                                                                                                                                   |
| Dismissed | `dismissed=1`               | dismissed events instead of the rest                                                                                                                                        |
| Sort      | `sort=match`                | best match first instead of by date                                                                                                                                         |

The bar shows "N of M events", where M is the events not dismissed (or the dismissed ones while that toggle is on). **Clear filters** resets everything but the sort.

## Adding events to Google Calendar

Each event with a start time has **Add to Google Calendar**, a link to Google's public new-event page (`https://calendar.google.com/calendar/render?action=TEMPLATE…`) built by `lib/handshake/google-calendar.ts` (covered by `tests/unit/handshake-calendar.test.ts`). It fills in the title, start and end in UTC (an hour when Handshake gives no usable end), the event's time zone (`ctz`), the location, and a description led by the organizer and the event's Handshake link, shortened at a word to keep the link under URL limits. Google Calendar opens in a new tab in whatever Google account the browser uses, and the student presses Save there; _aper holds no Google credentials and never reads or writes the calendar. Registering stays on Handshake.

## Storage

- `campus_events` table (migration `drizzle/0003_handshake_careers.sql`) with the same provenance columns as other synced tables, `relevance_score` / `relevance_reasons_json`, and a local-only `dismissed_at` flag that a read never overwrites. "New today" means first seen in the last 24 hours, excluding the very first read. Migration `drizzle/0004_sleepy_saracen.sql` drops the table earlier versions used for Handshake postings, and `drizzle/0005_aberrant_devos.sql` drops the `saved_at` flag that **Add to Google Calendar** replaced.
- Run snapshots: `data/raw/handshake/run-<id>/events.json` (`0600`), outside git and backups.
- Provider row `handshake` in `providers`; runs in `sync_runs` with `provider='handshake'`.

## API

| Route                             | Purpose                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/handshake/status`       | Connection, last read, run progress, sign-in window state, upcoming event count |
| `POST /api/handshake/auth`        | Open the visible sign-in window (returns immediately)                           |
| `POST /api/handshake/sync`        | Start or join an on-demand read                                                 |
| `GET/PUT /api/handshake/profile`  | Read or save the career profile (re-ranks)                                      |
| `PATCH /api/handshake/events/:id` | Local dismiss or restore: `{ "dismissed": boolean }`                            |
