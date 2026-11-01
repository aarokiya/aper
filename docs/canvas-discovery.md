# Georgia Tech Canvas discovery

Observed on 2026-08-31 against the authenticated student-facing deployment at `https://gatech.instructure.com`. No passwords, cookies, tokens, CSRF values, personal identifiers, or response bodies are recorded here.

## Authentication and application shell

- Browser URL: `https://gatech.instructure.com/`
- Authentication: Georgia Tech SSO with Duo, followed by Canvas session cookies. Duo remains entirely manual.
- CSRF: the authenticated HTML contains a `csrf-token` meta element. GET extraction does not require its value; the app does not implement Canvas mutations.
- Embedded state: Canvas emits a large `ENV` object with the account/domain context, current-user role flags, feature switches, and branding. The application treats this as fallback metadata only.
- Session check: `GET /api/v1/users/self`, requested with same-origin credentials and Canvas JSON accept headers. A non-JSON login response or non-success status means reauthentication is required.
- Reliability: high for the session check; SSO page DOM is deliberately not automated.

## Sources observed directly on the GT dashboard

Canvas server-rendered these exact same-origin prefetch calls in inline scripts:

| Information     | Endpoint                                     | Parameters / behavior                                                                    | Reliability |
| --------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------- |
| Dashboard cards | `GET /api/v1/dashboard/dashboard_cards`      | Canvas JSON string IDs; same-origin cookies                                              | High        |
| Planner items   | `GET /api/v1/planner/items`                  | `start_date`, optional `end_date`, `filter=new_activity`, `order`, `per_page`            | High        |
| Missing work    | `GET /api/v1/users/self/missing_submissions` | `include[]=planner_overrides`, `filter[]=current_grading_period`, `filter[]=submittable` | High        |

The dashboard DOM also exposes semantic links, item types, applicable displayed due dates, points, course context, and completion checkboxes. It is a useful validation surface, not the primary extractor.

## Course and assignment sources

| Information            | Browser URL                                    | Structured endpoint used                                     | Important fields                                                                                             | Pagination                 | DOM fallback                                                  |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------- |
| Active courses         | `/` and `/courses/:courseId`                   | `GET /api/v1/courses`                                        | term, teachers, enrollments, totals, syllabus                                                                | RFC 5988 `Link` header     | course tray/card links                                        |
| Assignments            | `/courses/:courseId/assignments/:assignmentId` | `GET /api/v1/courses/:courseId/assignments`                  | description, points, submission, `all_dates`, overrides, rubric assessment, submission types, LTI attributes | `Link`; `per_page=100`     | semantic assignment page                                      |
| Groups and weights     | `/courses/:courseId/assignments`               | `GET /api/v1/courses/:courseId/assignment_groups`            | weight, rules, assignment membership, submission include                                                     | `Link`                     | assignment index / grades view                                |
| Grades and submissions | `/courses/:courseId/grades`                    | assignment/submission includes plus course enrollment totals | released score/grade, workflow state, late/missing/excused, comments, rubric assessment                      | inherited from assignments | grades page is heavily client rendered and is validation-only |

Representative assignment validation showed:

- a stable course/assignment URL;
- due date, points, submission type, and availability window rendered separately;
- rich instructor text and a student-visible course file link;
- an external-tool/Gradescope submission surface in an iframe;
- a distinct late/grace-period statement in the instructions. The app therefore never substitutes `lock_at` for `due_at` and preserves source description text verbatim.

## Modules and learning content

- Browser URL: `/courses/:courseId/modules`
- Endpoint: `GET /api/v1/courses/:courseId/modules?include[]=items&include[]=content_details&per_page=100`
- Useful fields: module name/position/state/prerequisites; item type/title/position/content ID; HTML/external URL; completion requirement and content details.
- Observed DOM: semantic module headings, ordered items, item types (Page, Quiz, External URL), completion requirements, module-item URLs, and external URLs.
- Reliability: structured endpoint high; module DOM medium and centralized as a fallback.

## Announcements, pages, files, planner

| Entity           | Endpoint                                               | Notes                                                                                                       |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Announcements    | `GET /api/v1/announcements?context_codes[]=course_:id` | course-scoped; title/message/author/timestamps/attachments                                                  |
| Pages            | `GET /api/v1/courses/:id/pages`                        | index may omit full body; adapter preserves response and can fetch detail in a future incremental pass      |
| Files            | `GET /api/v1/courses/:id/files`                        | metadata, content type, size, timestamps and authorized URL; local downloader is intentionally conservative |
| Planner/calendar | `GET /api/v1/planner/items`                            | normalized against canonical assignment IDs to avoid duplicate rows                                         |

All paginated calls follow Canvas `Link` headers. The sync uses a per-request timeout, exponential retry for transient responses, and bounded course concurrency of three.

## External tools and Gradescope

The representative course navigation exposed a course-level Gradescope LTI link, and an assignment declared external-tool submission with a rendered LTI iframe. Canvas-visible LTI metadata and synchronized grades stay in the Canvas provider. The separately authenticated Gradescope provider reads student-visible course assignment tables; neither provider automates CAPTCHA/SSO nor inspects hidden Gradescope endpoints.

## Raw preservation and failure behavior

Each sync writes pretty-printed response snapshots below `data/raw/canvas/run-<id>/`, grouped per course. These files contain student-visible academic data and must remain private. Browser profiles and session state are outside the repository and never copied into snapshots.

If one course/category fails, the run becomes partial, the warning names the category and course, other categories continue, and previously valid rows remain. An authentication failure preserves the entire local database and marks the provider `AUTHENTICATION_REQUIRED`.
