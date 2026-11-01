# Gradescope support and access boundaries

The Gradescope adapter uses a persistent local browser profile to read the same student-visible course dashboard and assignment tables available in an ordinary browser session. Use **Settings → Connect Gradescope** once and complete login, SSO, Duo, or any CAPTCHA yourself. The app never stores a password or automates an authentication challenge.

Routine manual and hourly sync is intentionally low-rate and DOM-only: one dashboard page followed by one assignment-list page per enrolled course. It does not call hidden endpoints, submit work, open individual submissions, download files automatically, or attempt anti-bot evasion.

Currently populated when legitimately available:

- Gradescope course identity and source URL;
- assignment title, inferred type, release date, due date, submission state, visible score/points, and source URL;
- exact title/deadline matches folded into an existing Canvas task to avoid duplicates;
- Canvas assignment metadata, comments, and rubric assessment when Canvas exposes them;
- user-directed imported artifact metadata (filename, MIME type, hash, local path, import time, and optional course/assignment association);
- parsed JSON content when the user imports a valid JSON artifact.

The in-app importer accepts PDF, JSON, CSV, ZIP, TXT, and HTML files up to 50 MB. Imported files are written with private file permissions beneath `data/raw/gradescope/imports/` and are never uploaded by this application.

Unavailable unless present in Canvas or a user-imported artifact:

- submission history and native submission timestamps;
- question-level scores and autograder test cases;
- rubric sections/applied items not synchronized to Canvas;
- point adjustments and grader comments that Canvas does not show;
- regrade-request state or conversations;
- submission files and downloadable graded copies.

Raw DOM-derived records are retained as private JSON snapshots below `data/raw/gradescope/`. The isolated `AcademicProvider` adapter can be replaced by a sanctioned API later without changing Canvas or local productivity state.
