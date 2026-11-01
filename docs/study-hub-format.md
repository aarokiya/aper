# Study Hub format

The Study Hub (`/study`) is built from one JSON file of course objects. _aper doesn't make this file for you. You, or your coding agent, write it from your syllabi, lecture notes, and textbooks, then import it. This page defines the format precisely enough for an agent to generate it.

- **Schema:** `coursesSchema` in [`lib/study/hub.ts`](../lib/study/hub.ts) validates it. The field types are in [`lib/study/types.ts`](../lib/study/types.ts).
- **Example:** [`examples/study-hub/courses.json`](../examples/study-hub/courses.json) is one small fictional course with two weeks. Copy its shape.
- **Import** with `pnpm study:import <path>`, or upload it in Settings, Study Hub. The command doesn't need the server running. `<path>` can be:
  - a `.json` file holding either a course array or `{ "title": "...", "courses": [ ... ] }`;
  - a folder containing `courses.json`, plus an optional `progress.json` (a progress export, see [Progress](#progress-and-the-add-at-the-end-rule));
  - an older standalone hub folder (`src/courses.json` with `src/progress.json`) or its `.html` export (`window.COURSES = [...]`).

Importing replaces the whole hub. Saved progress is kept and matched to the new content by the keys described below.

## The top level

Either a bare array of courses, or an object:

| Field     | Type     | Notes                                                                                   |
| --------- | -------- | --------------------------------------------------------------------------------------- |
| `title`   | string   | Optional. The hub's name. A title like "Fall 2026 Study Hub" also sets the term label on `/study`. |
| `courses` | course[] | At least one.                                                                           |

## Course

**Required:** `id`, `code`, `name`, `weeks`. Every other field has a default, written here as `= value`.

| Field       | Type                                | Notes |
| ----------- | ----------------------------------- | ----- |
| `id`        | string, `^[a-z0-9-]+$`              | Stable key for saved progress, e.g. `cs1332` or `math1554`. **Never change it once you've studied with it.** |
| `code`      | string                              | Course code, e.g. `"CS 1332"`. The hub links a course to its Canvas class when the subject and number match, so use the real code. |
| `name`      | string                              | Course title. |
| `who`       | string `= ""`                       | One line: instructor, meeting time. |
| `math`      | boolean `= false`                   | When true, `$…$` TeX in this course's HTML is typeset. Turn it on for math-heavy courses. |
| `code_lang` | string, optional                    | Set to a language (e.g. `"java"`, `"python"`) for programming courses. Answers and cards then use monospace and code highlighting. |
| `labels`    | `{lecture, practice, studio}`       | Tab names. `= {"lecture":"Lecture","practice":"Practice","studio":"Studio"}`. |
| `book`      | `[title, url \| null]`              | Main textbook. `= ["Textbook", null]`. Week `secs` are shown after the book title. |
| `tutor`     | string `= ""`                       | Context for the AI tutor and grader, completing "You are a patient tutor for …". Write a phrase like `"Georgia Tech CS 1332 (Data Structures & Algorithms), Java. Textbook: …"`. The grader uses the text before the first `". "`. |
| `weeks`     | week[]                              | At least one, in order. |
| `exams`     | `{ [examId]: exam }` `= {}`         | Practice exams. Each key must equal the exam's own `id`. |
| `formulas`  | `{h, rows: [label, html][]}[]` `= []` | Formula sheet groups. Without any, the Formulas tab shows the guide page whose `id` is `cheatsheet`, if there is one. |
| `materials` | `{h, note, items: [title, url, description][]}[]` `= []` | "Where to find your materials": links to Canvas pages, notes, videos. |
| `pages`     | `{id, title, lead, html}[]` `= []`  | Guide pages: study guides, a cheatsheet, and so on. |
| `missing`   | string[] `= []`                     | Things you couldn't find (e.g. "Week 9 lecture slides"). Shown on the course page as a to-do list. |
| `grading`   | grading, optional                   | Syllabus weights for the course's Grades view. Leave it out when the syllabus doesn't give them. |

Unknown extra fields are kept and ignored.

## Week

**Required:** `n`, `label`, `start`, `end`, `title`.

| Field       | Type                   | Notes |
| ----------- | ---------------------- | ----- |
| `n`         | number                 | Week number, unique within the course. Progress keys use it. |
| `label`     | string                 | What the week is called, usually `"1"`, `"2"`, …. |
| `start`     | `YYYY-MM-DD`           | Monday (or the first class day). |
| `end`       | `YYYY-MM-DD`           | Last day of the week. The current week is the first one whose `end` is today or later. |
| `title`     | string                 | Topic, e.g. `"Heaps and priority queues"`. |
| `secs`      | string `= ""`          | Reading, e.g. `"§6.1–6.3"`. Shown after the book title. |
| `events`    | `[dateLabel, text][]` `= []` | Schedule lines, e.g. `["Fri 9/4", "Homework 2 due"]`. |
| `note`      | HTML `= ""`            | A short note at the top of the week. |
| `lectures`  | lecture[] `= []`       | |
| `refs`      | `[label, url, kind?][]` `= []` | Outside links. `kind` is `"video"`, `"notes"`, or `"free"`. |
| `practice`  | practice[] `= []`      | Answer-checked problems. |
| `studio`    | studio[] `= []`        | Worked problems you rate yourself on (got it, shaky, missed). |
| `cards`     | card[] `= []`          | Flashcards. |
| `parsons`   | parsons[] `= []`       | Put-the-lines-in-order code problems. |
| `checks`    | string[] `= []`        | "Can you do these?" self-checks, in plain text. |
| `exams`     | string[] `= []`        | Ids of exams held this week (keys of the course's `exams`). |

### Lecture

`{ title, when, sec, parts }`. `when` is a date label (`"Mon 8/24"`) and `sec` is the textbook section. Each part is `{ h, b, quiz? }`:

- `h` is a heading.
- `b` is the notes, as HTML.
- `quiz` is optional quick checks: practice items (below), whose `mc` items may also have `why`, an array of HTML explanations, one per option, shown once that option is picked.

### Practice and quick checks

| Field  | Type                                  | Notes |
| ------ | ------------------------------------- | ----- |
| `q`    | HTML                                  | The question. |
| `type` | `"mc"` \| `"num"` \| `"text"` \| `"set"` | |
| `a`    | number \| string \| string[]          | `mc`: the index of the correct option. `num`: a number, with tolerance 1e-6. `text`: accepted answers. `set`: the members, entered as a comma-separated list in any order. Text and set answers are compared ignoring case, spaces, quotes, and braces. |
| `opts` | HTML[]                                | Options. Required for `mc`. |
| `hint` | HTML, optional                        | |
| `sol`  | HTML, optional                        | Worked solution. |
| `src`  | string, optional                      | Where the problem came from, e.g. "Textbook 6.2 #4". |

### Studio, cards, Parsons

- **Studio:** `{ q, steps, tip?, hint?, title?, src? }`. `q`, `steps` (one HTML string per step), `tip`, and `hint` are HTML.
- **Card:** `{ f, b, a? }`. `f` is the front and `b` the back, both HTML. If you give `a`, a list of accepted typed answers, the card becomes a type-the-answer card.
- **Parsons:** `{ q, lines, distractors?, sol?, title? }`.
  - `lines` is the solution in order, in plain text with 4 spaces of indentation per level.
  - `distractors` are wrong lines that must be left out.

## Exam

Keyed by `id` in the course's `exams`.

| Field      | Type                        | Notes |
| ---------- | --------------------------- | ----- |
| `id`       | string                      | Same as its key. Week `exams` and grading `exam` refer to it. |
| `title`    | string                      | |
| `covers`   | string                      | E.g. `"Weeks 1–5"`. |
| `minutes`  | number                      | Timer length. |
| `date`     | `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` | Local wall time. Today's exam countdown uses it. |
| `dateEst`  | boolean, optional           | True when the date is a guess. The app then asks you to confirm it. |
| `note`     | string                      | |
| `links`    | `[label, url][]`            | |
| `sections` | `{ title, items }[]`        | |

Exam items share `{ kind, pts, q, sol? }`, where `q` and `sol` are HTML. By `kind`:

- `"mc"`: `choices` (HTML[]) and `answer`, the index of the correct choice.
- `"tf"`: `answer`, a boolean.
- `"blanks"`: `blanks: [{ label, answers: string[], pts }]`. An optional word bank `bank: [{ k, v }]` (`v` is HTML) can go with it.
- `"open"`: graded by you or by the AI grader. An optional `rubric: [{ item, pts }]` lists what earns points.

## Grading (optional)

This is the syllabus's grade breakdown, used by the course's Grades view.

```json
{
  "source": "Syllabus, page 3",
  "note": "",
  "letters": { "A": 90, "B": 80, "C": 70, "D": 60, "F": 0 },
  "groups": [
    {
      "id": "hw",
      "h": "Homework",
      "weight": 40,
      "drop": 1,
      "note": "",
      "items": [{ "id": "hw1", "t": "Homework 1", "due": "2026-09-04T23:59" }]
    },
    { "id": "exams", "h": "Exams", "weight": 60, "items": [{ "id": "e1", "exam": "e1" }] }
  ]
}
```

- `letters` maps each letter to its lowest percent, listed highest first.
- Group `weight`s are percents of the course grade and should add up to 100. `drop` removes the lowest N scores once more than N are scored.
- Item `id`s must be unique across the whole course, because they key your saved scores.
- An item can link a practice exam with `exam`. The exam's title, coverage, and date then stand in for `t`, `sec`, and `due`. `due` may be `""`, which shows "See Canvas".
- `avgLowest: [itemIds]` handles a make-up or optional item. The item doesn't count on its own: its score is averaged with the lowest of the listed items, only when that raises it.

## HTML fields

Fields marked HTML are rendered as HTML inside the app. Use simple markup: `<p>`, `<b>`, `<i>`, `<code>`, `<pre>`, `<ul>`, `<ol>`, `<table>`, `<br>`. Fields not marked HTML are plain text. When the course has `math: true`, write math as `$…$` (inline TeX). Escape backslashes in JSON (`"$\\frac{a}{b}$"`).

## Progress and the add-at-the-end rule

Your progress is saved per course, under the course `id`, and positions inside the content key it:

| Progress            | Key |
| ------------------- | --- |
| Lecture reviewed    | week `n` |
| Practice answer     | `"<n>-<index>"` in the week's `practice` |
| Studio rating       | `"<n>-<index>"` in the week's `studio` |
| Flashcard           | `"w<n>-<index>"` in the week's `cards`. Formula rows use `"f<group>-<row>"`. |
| Parsons             | `"<n>-<index>"` in the week's `parsons` |
| Self-check          | `"<n>-<index>"` in the week's `checks` |
| Quick check         | `"<n>-<hash of q and opts>"`, so editing a question's text resets it |
| Exam answers        | exam `id`, then `"<section>-<item>"` |
| Grades view scores  | grading item `id` |
| Spaced-repetition memory | the item's key with a `c:` (card), `q:` (quick check), `p:` (practice), or `z:` (Parsons) prefix |

So, when you update a hub that's already in use:

- **Add new practice, studio, card, Parsons, and check items at the end of a week's list.** Never insert, reorder, or delete in the middle: every later item would inherit the wrong saved answer or memory. To retire an item, leave it in place (or change its text) rather than removing it.
- Don't renumber weeks (`n`) or rename course, exam, or grading item ids.
- Adding weeks, exams, guide pages, formulas, or links is always safe.

`progress.json`, when present, is a file from Export progress (`"format": "gt-study-hub-progress"`). For each course, it replaces saved progress only when it is newer.

## Building a hub from a student's materials

An agent can follow these steps:

1. Make one course object per class you want in Study. Take `code` and `name` from Canvas or the syllabus, and pick a short lowercase `id` (`"isye2027"`).
2. Build `weeks` from the syllabus schedule: one entry per calendar week of the term, with real `start` and `end` dates. Fill `title`, `secs` (the assigned reading), and `events` (due dates, quizzes).
3. For each week, write lecture notes from the slides or readings as `lectures[].parts`. Then add a few `practice` problems with checkable answers, one or two `studio` worked problems, and `cards` for definitions and formulas. Cite sources in `src`.
4. Add practice `exams` from old exams or review sheets, and set `exams` on the weeks they fall in.
5. Copy the syllabus grade breakdown into `grading`, if it has one.
6. List anything you couldn't find in `missing`.
7. Write the file to a folder (e.g. `~/study-hub/courses.json`) **outside this repository**. Course material is personal; `data/` and the profile file are gitignored, the rest of the repo isn't. Then run `pnpm study:import ~/study-hub`.

Keep the content your own words and the problems original or properly cited. Don't paste copyrighted textbook pages wholesale.
