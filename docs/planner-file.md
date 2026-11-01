# Planner file

The course planner (`/planner`) starts from a planner file, one JSON file with two parts:

- your degree requirements, taken from your Degree Works audit and the Georgia Tech catalog;
- a starting plan: every term from your first to graduation, with the courses you've taken and the ones you plan to take.

You import the file once. After that, you edit the plan on the page, which checks it against the requirements as you go and exports it as a one-page PDF.

- **Schema:** `plannerFileSchema` in [`lib/planner/types.ts`](../lib/planner/types.ts).
- **Example:** [`examples/planner/plan.json`](../examples/planner/plan.json), a fictional Industrial Engineering student with summer terms.
- **Import** with `pnpm planner:import <file>` (the server doesn't need to be running) or the Import button on `/planner`.
  - Your edited plan is a separate copy, and it is kept when it is newer than the file's (`plan.t`). Re-importing an updated requirements file never discards your edits; raise `plan.t` to force the file's plan.
  - Both copies live in the local database, never in the repository. Keep the file itself outside the repo, or under a gitignored name.

## Top level

| Field     | Type                | Notes |
| --------- | ------------------- | ----- |
| `program` | string (≤200)       | Shown at the top of the page, e.g. `"BS Industrial Engineering, concentration: Operations Research"`, or `"BS Computer Science, threads: Intelligence and Devices"`. |
| `catalog` | string (≤40)        | Catalog year you follow, e.g. `"2025-26"`. |
| `audit`   | `YYYY-MM-DD`        | Date of the Degree Works audit the requirements came from. |
| `pairs`   | `[code, code][]` `= []` | Allowable lab-science sequences, e.g. `["PHYS 2211", "PHYS 2212"]`. Requirements with `seq: true` use them. |
| `areas`   | area[] (≤20)        | Requirement groups, in display order. |
| `plan`    | plan                | The starting plan. |

## Areas and requirements

An **area** is a block of requirements as Degree Works groups them ("Core IMPACTS", "Major Requirements", a thread or concentration, "Free Electives").

| Field   | Type                 | Notes |
| ------- | -------------------- | ----- |
| `h`     | string               | Heading. |
| `share` | boolean, optional    | Courses here also count toward other areas. Use it for areas that overlap the rest, like the Georgia Legislative Requirements or Honors. |
| `by90`  | boolean, optional    | Flags courses planned in or after the term where earned hours reach 90 (the deadline for the legislative requirements). |
| `note`  | string, optional     | |
| `reqs`  | requirement[] (1–40) | |

A **requirement**:

| Field   | Type                             | Notes |
| ------- | -------------------------------- | ----- |
| `id`    | `^[a-z0-9_]+$`                   | Unique across the file. Plan rows refer to it with `r`. |
| `label` | string                           | What Degree Works calls it, e.g. `"Probability and statistics: ISYE 2027 and 2028"`. |
| `opts`  | course codes `= []`              | Courses that count, written `"SUBJ 1234"`. Placeholder codes like `"HTS 1XXX"` work too. |
| `keys`  | lowercase phrases `= []`         | Phrases that count when they appear in a row's name, for placeholder rows like `"Social Science Elective"`. |
| `n`     | integer, optional                | Courses needed (default 1). |
| `hrs`   | number, optional                 | Hours needed, instead of a course count (e.g. 9 for "Social Sciences: 9 hours"). |
| `seq`   | boolean, optional                | Met by any allowable pair from `pairs` (a lab-science sequence). |
| `name`, `h` | string, number, optional     | The row the Add button creates (name and credit hours). |
| `note`  | string, optional                 | |

### How rows count

- A plan row counts toward a requirement when a course code in its name is in `opts`, or when its name contains one of the `keys`.
  - Codes are read from names like `"CS 4210 or 4220"`, which counts as CS 4210 and CS 4220, and `"CEE/ISYE 3770"`, which counts as ISYE 3770.
  - A row whose name matches no requirement at all counts toward the requirement in its `r` field.
- Each requirement takes its best rows: completed first, then in progress, then planned, earliest term first.
- A row counts once, except in `share` areas.
- A requirement is rated by the weakest row it counted.

## Plan

| Field   | Type          | Notes |
| ------- | ------------- | ----- |
| `t`     | number        | Version stamp in ms. Start with `1000`. The newer copy wins between the file and your saved edits. |
| `title` | string        | PDF title, e.g. `"Course Plan - AY 2026-27"`. |
| `hours` | number        | Hours required for the degree. |
| `note`  | string        | The line under the title. |
| `name`  | string        | Your name, as printed on the PDF. |
| `date`  | string        | Printed date. Blank prints the export day. |
| `by`    | string        | The "Assessment By" line, e.g. your advisor's name and email, or blank. |
| `terms` | term[] (1–24) | In time order. |
| `xfer`  | row[]         | Transfer, AP, or IB credit that counts toward the degree. |
| `extra` | row[]         | Credit that doesn't count toward the degree (it shows as surplus hours). |
| `notes` | string[]      | Degree notes, one line each. `**bold**` prints bold and URLs print in italics. |

### Terms

`{ id, label, rows }`:

- `id` is `F` (fall), `S` (spring), or `U` (summer) plus a two-digit year: `F26` is Fall 2026, `S27` Spring 2027, `U27` Summer 2027.
- `label` is what's shown, e.g. `"Fall 2026"`.
- Terms must be listed in time order. Within a calendar year that's spring, then summer, then fall: `F26, S27, U27, F27`.
- Ids must be unique.
- Summers are optional. Include one only when you plan to take or did take summer classes (or want to note an internship).

The page and the PDF group terms into academic years: a fall, the spring after it, and that summer. When a plan has any summer term, the page shows a third column per year and the PDF adds a summer band under that year's fall and spring. Plans with only fall and spring look the same as before.

The current and next terms come from approximate start dates (spring Jan 1, summer May 15, fall Aug 15). The next term is where "Next semester options" and Add point.

### Rows

`{ n, h, k?, r? }`:

- `n` is the course, e.g. `"ISYE 3133 Engineering Optimization"` or a placeholder like `"Humanities Elective"`.
- `h` is credit hours.
- `k` is the tag:
  - `C`: completed at Georgia Tech
  - `T`: transfer credit
  - `IP`: in progress
  - `R`: recommended for next semester
  - `ALT`: alternative
  - `""`: planned
- `r` is optional: the requirement id this row was added for (used when the name matches nothing).

R and ALT rows are listed under "Next semester options" on the page and in the PDF.

## Building it from a Degree Works audit

An agent can build the file from the student's own materials:

1. **Get the audit.** Have the student open Degree Works (from Buzzport, or `degreeworks.gatech.edu`) and save the worksheet as a PDF, or copy its text. Don't scrape it: the student signs in and hands over the document. From the header, take `program` (the degree, plus threads, concentration, or minors), `catalog` (the catalog year), and `audit` (the audit date).
2. **Areas from the audit blocks.** Make one area per block: Core IMPACTS, the major's requirements, each thread or concentration, free electives, the Georgia Legislative Requirements (`share: true, by90: true`), and any minor. Use the block's own wording for `label`s.
3. **Requirements from the rules.** Within each block:
   - Each "1 Class in A or B or C" rule becomes a requirement with those codes in `opts`.
   - "N credits in …" uses `hrs`.
   - Two-of-several rules use `n`.
   - Wildcard rules like "HTS 1XXX" or "Social Science Elective" use `keys` (and placeholder codes in `opts`).
   - Use the Georgia Tech catalog's degree page for the student's major and catalog year (`catalog.gatech.edu`, Programs) to fill in course lists that the audit abbreviates, such as thread pick lists and approved electives. Then add the allowable lab-science sequences to `pairs`.
4. **Taken courses.** Degree Works lists what the student has already taken:
   - Courses taken at Georgia Tech go in their term with `k: "C"`.
   - Current courses go in their term with `k: "IP"`.
   - AP, IB, and transfer credit go in `xfer` with `k: "T"`.
   - Credit the audit places in "Insufficient" or "Not counted" goes in `extra`.
5. **Plan the rest.** Fill the remaining terms through graduation with the courses still needed. Tag next semester's picks `R` and backups `ALT`, and put a placeholder row with `r` set for any requirement without a chosen course yet. Respect prerequisites and the term-by-term sample schedule on the catalog page. Keep the total near `hours`.
6. **Threads (CS) and concentrations.** For Computer Science, each of the student's two threads is its own area. List every thread pick (and its "or" options) as requirements with `opts`. Courses shared between threads count once unless the catalog says otherwise. Other majors' concentrations and minors work the same way.
7. **Validate.** Run `pnpm planner:import <file>`. It reports each problem with its JSON path: bad term ids, terms out of order, duplicate requirement ids, or rows pointing at unknown requirements. Then open `/planner` and check that the requirement statuses match the audit.

The planner is a planning aid, not an official audit. The student should confirm the plan with their advisor and Degree Works.
