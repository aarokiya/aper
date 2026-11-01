import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { BrowserContext, Page } from 'playwright';
import type {
  AcademicProvider,
  AuthStatus,
  DiscoveryResult,
  SyncResult,
} from '@/lib/sync/provider';
import { dataDir, initializeDatabase, getDb } from '@/lib/db/client';
import { contentHash, nowIso } from '@/lib/sync/utils';
import { sanitizeFilename } from '@/lib/export/content';
import {
  authenticateGradescope,
  checkGradescopeAuth,
  GRADESCOPE_ORIGIN,
  openGradescopeContext,
} from '@/lib/gradescope/auth';
import { assignmentMatchKey } from '@/lib/grades/calculator';
import {
  recordGradescopeScore,
  type GradescopeObservation,
} from '@/lib/grades/gradescope-scores';

type GradescopeCourse = {
  sourceId: string;
  url: string;
  title: string;
  description: string;
  term: string | null;
};

export type GradescopeAssignment = {
  sourceId: string;
  title: string;
  sourceUrl: string;
  releaseAt: string | null;
  dueAt: string | null;
  statusText: string;
  providerState: 'UNSUBMITTED' | 'SUBMITTED' | 'GRADED';
  score: number | null;
  pointsPossible: number | null;
  assignmentType: string;
};

type SyncCounters = {
  seen: number;
  updated: number;
  warnings: string[];
  errors: string[];
  timings: Record<string, number>;
};

const json = (value: unknown) => JSON.stringify(value ?? null);
const normalizedTitle = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function gradescopeCourseKey(value: string) {
  const match = value.toUpperCase().match(/\b([A-Z]{2,5})\s*-?\s*(\d{4})\b/);
  return match ? `${match[1]}${match[2]}` : null;
}

/**
 * Gradescope rosters keep students who withdrew, so a course whose class
 * Canvas no longer lists this term (same department and number, no current
 * Canvas class) is a dropped class: the sync skips it instead of bringing it
 * back as a Gradescope-only class.
 */
export function isDroppedGradescopeCourse(
  course: Pick<GradescopeCourse, 'title' | 'description' | 'term'>,
) {
  const key = gradescopeCourseKey(`${course.title} ${course.description}`);
  if (!key || !course.term) return false;
  const classes = (
    getDb()
      .sqlite.prepare(
        `SELECT course_code AS courseCode,short_name AS shortName,local_alias AS localAlias,name,is_current AS isCurrent FROM courses WHERE source_provider='canvas' AND lower(trim(term_name))=lower(trim(?))`,
      )
      .all(course.term) as Array<{
      courseCode: string | null;
      shortName: string | null;
      localAlias: string | null;
      name: string;
      isCurrent: number;
    }>
  ).filter((row) =>
    [row.courseCode, row.shortName, row.localAlias, row.name].some(
      (value) => value && gradescopeCourseKey(value) === key,
    ),
  );
  return classes.length > 0 && classes.every((row) => !row.isCurrent);
}

export function parseGradescopeDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function gradescopeProviderState(value: string) {
  if (/graded|score|points|\d+(?:\.\d+)?\s*\/\s*\d/i.test(value))
    return 'GRADED' as const;
  if (/submitted/i.test(value) && !/no submission/i.test(value))
    return 'SUBMITTED' as const;
  return 'UNSUBMITTED' as const;
}

export function inferGradescopeAssignmentType(title: string) {
  if (/\bquiz\b/i.test(title)) return 'QUIZ';
  if (/\b(exam|midterm|final)\b/i.test(title)) return 'EXAM';
  if (/\blab\b/i.test(title)) return 'LAB';
  if (/\bproject\b/i.test(title)) return 'PROJECT';
  return 'ASSIGNMENT';
}

function scoreFromStatus(status: string) {
  const match = status.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  return match
    ? { score: Number(match[1]), pointsPossible: Number(match[2]) }
    : { score: null, pointsPossible: null };
}

function syntheticAssignmentId(courseId: string, title: string) {
  return `${courseId}-${createHash('sha256')
    .update(normalizedTitle(title))
    .digest('hex')
    .slice(0, 16)}`;
}

type CanvasCandidate = {
  id: number;
  title: string;
  dueAt: string | null;
  /** Lowercased external tool URL and name. */
  tool: string;
};

/** Canvas LTI links that launch Gradescope, including Turnitin's `launch/gs-proxy`. */
const GRADESCOPE_LTI = /gradescope|turnitin\.com\/launch\/gs(?:[-/?\s]|$)/;

/**
 * The Canvas assignment a Gradescope assignment mirrors, most certain first:
 * the same title due within five minutes (or both undated); a Canvas
 * Gradescope LTI link whose title differs only in zero padding or
 * punctuation; or, for an undated Gradescope assignment, the only Canvas
 * assignment with exactly the same title.
 */
export function matchCanvasAssignment(
  item: Pick<GradescopeAssignment, 'title' | 'dueAt'>,
  candidates: CanvasCandidate[],
) {
  const due = item.dueAt ? Date.parse(item.dueAt) : null;
  const gap = (candidate: CanvasCandidate) =>
    due != null && candidate.dueAt
      ? Math.abs(Date.parse(candidate.dueAt) - due)
      : Infinity;
  const closest = (list: CanvasCandidate[]) =>
    list.sort((a, b) => gap(a) - gap(b))[0];
  const title = item.title.trim().toLowerCase();
  const exact = candidates.filter(
    (candidate) => candidate.title.trim().toLowerCase() === title,
  );
  const onTime = exact.filter((candidate) =>
    due == null ? candidate.dueAt == null : gap(candidate) <= 5 * 60_000,
  );
  if (onTime.length) return closest(onTime);
  const key = assignmentMatchKey(item.title);
  const linked = candidates.filter(
    (candidate) =>
      GRADESCOPE_LTI.test(candidate.tool) &&
      assignmentMatchKey(candidate.title) === key,
  );
  if (linked.length) return closest(linked);
  return due == null && exact.length === 1 ? exact[0] : undefined;
}

/**
 * Records Gradescope's view of a matched Canvas assignment without overriding
 * Canvas. The observation goes to the Gradescope score ledger, which Canvas
 * sync never rewrites, and to `provider_json.gradescope` on the submission.
 * The submission score is filled from Gradescope only while Canvas has none;
 * `gradescope.filled` marks a score that came from Gradescope so a later
 * Gradescope regrade can still update it.
 */
export function mergeGradescopeIntoCanvasSubmission(
  assignmentId: number,
  item: Pick<
    GradescopeAssignment,
    'sourceId' | 'title' | 'sourceUrl' | 'score' | 'pointsPossible'
  >,
  providerState: string,
  missing: number,
  syncedAt: string,
) {
  const { sqlite } = getDb();
  const observation: GradescopeObservation = {
    score: item.score,
    possible: item.pointsPossible,
    observedAt: syncedAt,
    url: item.sourceUrl,
    title: item.title,
    gradescopeId: item.sourceId,
  };
  recordGradescopeScore(assignmentId, observation);
  const prior = sqlite
    .prepare(
      `SELECT score,COALESCE(json_extract(provider_json,'$.gradescope.filled'),0) AS filled FROM submissions WHERE assignment_id=?`,
    )
    .get(assignmentId) as { score: number | null; filled: number } | undefined;
  const canvasOwnsScore = prior?.score != null && !prior.filled;
  const fill = !canvasOwnsScore && item.score != null;
  const filled = !canvasOwnsScore && (fill || Boolean(prior?.filled));
  sqlite
    .prepare(
      `INSERT INTO submissions (assignment_id,provider_state,submission_url,score,grade,late,missing,excused,last_synced_at,provider_json) VALUES (@assignmentId,@providerState,@url,@score,@grade,0,@missing,0,@syncedAt,json_object('gradescope',json(@gradescope))) ON CONFLICT(assignment_id) DO UPDATE SET provider_state=excluded.provider_state,submission_url=COALESCE(excluded.submission_url,submissions.submission_url),score=CASE WHEN @fill THEN excluded.score ELSE submissions.score END,grade=CASE WHEN @fill THEN excluded.grade ELSE submissions.grade END,missing=excluded.missing,last_synced_at=excluded.last_synced_at,provider_json=json_set(CASE WHEN json_type(submissions.provider_json)='object' THEN submissions.provider_json ELSE '{}' END,'$.gradescope',json(@gradescope))`,
    )
    .run({
      assignmentId,
      providerState,
      url: item.sourceUrl,
      score: item.score,
      grade: item.score == null ? null : String(item.score),
      missing,
      syncedAt,
      fill: Number(fill),
      gradescope: json({ ...observation, filled }),
    });
}

export class GradescopeProvider implements AcademicProvider {
  async checkAuth(): Promise<AuthStatus> {
    const context = await openGradescopeContext(true);
    try {
      return await checkGradescopeAuth(context);
    } finally {
      await context.close();
    }
  }
  async authenticate(): Promise<void> {
    await authenticateGradescope();
  }
  async discover(): Promise<DiscoveryResult> {
    return {
      provider: 'gradescope',
      observedAt: nowIso(),
      sources: [
        {
          entity: 'student course dashboard',
          browserUrl: `${GRADESCOPE_ORIGIN}/`,
          method: 'DOM',
          reliability: 'high',
        },
        {
          entity: 'student-visible assignment list',
          browserUrl: `${GRADESCOPE_ORIGIN}/courses/:courseId`,
          method: 'DOM',
          reliability: 'high',
        },
      ],
    };
  }
  async sync(): Promise<SyncResult> {
    initializeDatabase();
    const { sqlite } = getDb();
    const startedAt = nowIso();
    const run = sqlite
      .prepare(
        `INSERT INTO sync_runs (provider,started_at,status,auth_status,errors_json,warnings_json,timings_json) VALUES ('gradescope',?,'RUNNING','UNKNOWN','[]','[]','{}') RETURNING id`,
      )
      .get(startedAt) as { id: number };
    const counters: SyncCounters = {
      seen: 0,
      updated: 0,
      warnings: [],
      errors: [],
      timings: {},
    };
    let context: BrowserContext | undefined;
    try {
      context = await openGradescopeContext(true);
      const page = context.pages()[0] ?? (await context.newPage());
      const auth = await checkGradescopeAuth(context, page);
      sqlite
        .prepare(
          `INSERT INTO providers (key,display_name,auth_status,last_attempt_at) VALUES ('gradescope','Gradescope',?,?) ON CONFLICT(key) DO UPDATE SET auth_status=excluded.auth_status,last_attempt_at=excluded.last_attempt_at,last_error=NULL`,
        )
        .run(auth.state, startedAt);
      if (auth.state !== 'CONNECTED') {
        const finishedAt = nowIso();
        const message = auth.detail ?? 'Gradescope authentication required.';
        sqlite
          .prepare(
            `UPDATE sync_runs SET status='AUTH_REQUIRED',auth_status=?,finished_at=?,errors_json=? WHERE id=?`,
          )
          .run(auth.state, finishedAt, json([message]), run.id);
        return {
          provider: 'gradescope',
          runId: run.id,
          startedAt,
          finishedAt,
          status: 'AUTH_REQUIRED',
          entitiesSeen: 0,
          entitiesUpdated: 0,
          warnings: [],
          errors: [message],
          timings: {},
        };
      }

      const rawRoot = path.join(dataDir, 'raw', 'gradescope', `run-${run.id}`);
      fs.mkdirSync(rawRoot, { recursive: true });
      const dashboardStarted = performance.now();
      const courses = await this.extractCourses(page);
      counters.timings.dashboard = Math.round(
        performance.now() - dashboardStarted,
      );
      this.writeRaw(rawRoot, 'courses.json', courses);
      counters.seen += courses.length;

      for (const [index, course] of courses.entries()) {
        if (isDroppedGradescopeCourse(course)) continue;
        sqlite
          .prepare(`UPDATE sync_runs SET progress_label=? WHERE id=?`)
          .run(
            `Syncing Gradescope… ${course.title} (${index + 1}/${courses.length})`,
            run.id,
          );
        try {
          const courseStarted = performance.now();
          await page.goto(course.url, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          });
          const assignments = await this.extractAssignments(
            page,
            course.sourceId,
          );
          counters.timings[`course-${course.sourceId}`] = Math.round(
            performance.now() - courseStarted,
          );
          const rawPath = path.join(
            rawRoot,
            `course-${sanitizeFilename(course.sourceId)}.json`,
          );
          this.writeRaw(rawRoot, path.basename(rawPath), {
            course,
            assignments,
          });
          const localCourseId = this.resolveCourse(course, startedAt);
          counters.seen += assignments.length;
          for (const assignment of assignments) {
            this.upsertAssignment(
              assignment,
              localCourseId,
              startedAt,
              path.relative(dataDir, rawPath),
              run.id,
            );
            counters.updated += 1;
          }
        } catch (error) {
          counters.errors.push(
            `${course.title}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      const finishedAt = nowIso();
      const status = counters.errors.length ? 'PARTIAL' : 'SUCCESS';
      sqlite
        .prepare(
          `UPDATE sync_runs SET finished_at=?,status=?,auth_status='CONNECTED',entities_seen=?,entities_updated=?,errors_json=?,warnings_json=?,timings_json=?,progress_label=NULL WHERE id=?`,
        )
        .run(
          finishedAt,
          status,
          counters.seen,
          counters.updated,
          json(counters.errors),
          json(counters.warnings),
          json(counters.timings),
          run.id,
        );
      sqlite
        .prepare(
          `UPDATE providers SET auth_status='CONNECTED',last_success_at=?,last_error=? WHERE key='gradescope'`,
        )
        .run(
          finishedAt,
          counters.errors.length ? counters.errors.join('; ') : null,
        );
      return {
        provider: 'gradescope',
        runId: run.id,
        startedAt,
        finishedAt,
        status,
        entitiesSeen: counters.seen,
        entitiesUpdated: counters.updated,
        warnings: counters.warnings,
        errors: counters.errors,
        timings: counters.timings,
      };
    } catch (error) {
      const finishedAt = nowIso();
      const message = error instanceof Error ? error.message : String(error);
      sqlite
        .prepare(
          `UPDATE sync_runs SET finished_at=?,status='FAILED',errors_json=?,progress_label=NULL WHERE id=?`,
        )
        .run(finishedAt, json([message]), run.id);
      sqlite
        .prepare(
          `INSERT INTO providers (key,display_name,auth_status,last_attempt_at,last_error) VALUES ('gradescope','Gradescope','ERROR',?,?) ON CONFLICT(key) DO UPDATE SET auth_status='ERROR',last_attempt_at=excluded.last_attempt_at,last_error=excluded.last_error`,
        )
        .run(finishedAt, message);
      return {
        provider: 'gradescope',
        runId: run.id,
        startedAt,
        finishedAt,
        status: 'FAILED',
        entitiesSeen: counters.seen,
        entitiesUpdated: counters.updated,
        warnings: counters.warnings,
        errors: [message],
        timings: counters.timings,
      };
    } finally {
      if (context) await context.close();
    }
  }

  private async extractCourses(page: Page): Promise<GradescopeCourse[]> {
    await page.goto(`${GRADESCOPE_ORIGIN}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    return page.locator('a[href^="/courses/"]').evaluateAll((links) => {
      const seen = new Set<string>();
      return links.flatMap((link) => {
        const href = link.getAttribute('href') ?? '';
        const match = href.match(/^\/courses\/(\d+)$/);
        if (!match || seen.has(match[1])) return [];
        seen.add(match[1]);
        const heading = link.querySelector('h3')?.textContent?.trim();
        const text = link.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const description =
          Array.from(link.querySelectorAll('[title]'))
            .map((node) => node.getAttribute('title'))
            .find(Boolean) ?? text;
        let previous: Element | null =
          link.parentElement?.previousElementSibling ?? null;
        while (previous && !/\b(20\d{2})\b/.test(previous.textContent ?? ''))
          previous = previous.previousElementSibling;
        return [
          {
            sourceId: match[1],
            url: `${location.origin}${href}`,
            title: heading || text.replace(/\d+ assignments?$/i, '').trim(),
            description,
            term: previous?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
          },
        ];
      });
    });
  }

  private async extractAssignments(
    page: Page,
    courseSourceId: string,
  ): Promise<GradescopeAssignment[]> {
    const rows = await page
      .locator('#assignments-student-table tbody tr')
      .evaluateAll((items) =>
        items.map((row) => {
          const header = row.querySelector('th');
          const link = header?.querySelector('a');
          const button = header?.querySelector('button');
          const title =
            link?.textContent?.trim() ||
            button?.textContent?.trim() ||
            header?.textContent?.trim() ||
            'Assignment';
          const href =
            link?.getAttribute('href') ||
            button?.getAttribute('data-post-url') ||
            '';
          const assignmentId =
            href.match(/\/assignments\/(\d+)/)?.[1] ||
            button?.getAttribute('data-assignment-id');
          const cells = Array.from(row.querySelectorAll('td'));
          const statusText =
            cells[0]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          const releaseAt = row
            .querySelector('time.submissionTimeChart--releaseDate')
            ?.getAttribute('datetime');
          const dueAt = row
            .querySelector('time.submissionTimeChart--dueDate')
            ?.getAttribute('datetime');
          return {
            assignmentId: assignmentId ?? null,
            title,
            href,
            releaseAt: releaseAt ?? null,
            dueAt: dueAt ?? null,
            statusText,
          };
        }),
      );

    return rows.map((row) => {
      const score = scoreFromStatus(row.statusText);
      return {
        sourceId:
          row.assignmentId ?? syntheticAssignmentId(courseSourceId, row.title),
        title: row.title,
        sourceUrl: row.href
          ? new URL(row.href, GRADESCOPE_ORIGIN).toString()
          : `${GRADESCOPE_ORIGIN}/courses/${courseSourceId}`,
        releaseAt: parseGradescopeDate(row.releaseAt),
        dueAt: parseGradescopeDate(row.dueAt),
        statusText: row.statusText,
        providerState: gradescopeProviderState(row.statusText),
        score: score.score,
        pointsPossible: score.pointsPossible,
        assignmentType: inferGradescopeAssignmentType(row.title),
      };
    });
  }

  private resolveCourse(course: GradescopeCourse, syncedAt: string) {
    const { sqlite } = getDb();
    const key = gradescopeCourseKey(`${course.title} ${course.description}`);
    const candidates = sqlite
      .prepare(
        `SELECT id,course_code AS courseCode,name,short_name AS shortName,local_alias AS localAlias FROM courses WHERE is_current=1 ORDER BY source_provider='canvas' DESC`,
      )
      .all() as Array<{
      id: number;
      courseCode: string | null;
      name: string;
      shortName: string | null;
      localAlias: string | null;
    }>;
    const matched = key
      ? candidates.find((candidate) =>
          [
            candidate.courseCode,
            candidate.shortName,
            candidate.localAlias,
            candidate.name,
          ].some((value) => value && gradescopeCourseKey(value) === key),
        )
      : undefined;
    if (matched) return matched.id;

    const code = key ? `${key.slice(0, -4)} ${key.slice(-4)}` : course.title;
    const raw = { ...course, matchedCanvasCourseId: null };
    const row = sqlite
      .prepare(
        `INSERT INTO courses (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,content_hash,name,course_code,short_name,term_name,state,enrollment_state,homepage_url,is_current,provider_json) VALUES ('gradescope',?,?,?,?,?,?,?,?,?,?,'available','active',?,1,?) ON CONFLICT(source_provider,source_id) DO UPDATE SET source_url=excluded.source_url,last_seen_at=excluded.last_seen_at,last_synced_at=excluded.last_synced_at,content_hash=excluded.content_hash,name=excluded.name,course_code=excluded.course_code,short_name=excluded.short_name,term_name=excluded.term_name,homepage_url=excluded.homepage_url,is_current=1,provider_json=excluded.provider_json RETURNING id`,
      )
      .get(
        course.sourceId,
        course.url,
        syncedAt,
        syncedAt,
        syncedAt,
        contentHash(raw),
        course.description || course.title,
        code,
        course.title,
        course.term,
        course.url,
        json(raw),
      ) as { id: number };
    return row.id;
  }

  private upsertAssignment(
    item: GradescopeAssignment,
    courseId: number,
    syncedAt: string,
    rawSnapshotPath: string,
    runId: number,
  ) {
    const { sqlite } = getDb();
    const existing = sqlite
      .prepare(
        `SELECT id,source_provider AS sourceProvider,source_id AS sourceId,due_at AS dueAt FROM assignments WHERE source_provider='gradescope' AND source_id=?`,
      )
      .get(item.sourceId) as
      | {
          id: number;
          sourceProvider: string;
          sourceId: string;
          dueAt: string | null;
        }
      | undefined;
    const canonical = matchCanvasAssignment(
      item,
      sqlite
        .prepare(
          `SELECT id,title,due_at AS dueAt,lower(COALESCE(external_tool_url,'')||' '||COALESCE(external_tool_name,'')) AS tool FROM assignments WHERE course_id=? AND source_provider='canvas'`,
        )
        .all(courseId) as CanvasCandidate[],
    );
    const duplicate =
      existing || canonical
        ? undefined
        : (sqlite
            .prepare(
              `SELECT id,source_provider AS sourceProvider,source_id AS sourceId,due_at AS dueAt FROM assignments WHERE course_id=? AND lower(trim(title))=lower(trim(?)) AND ((due_at IS NULL AND ? IS NULL) OR abs(julianday(due_at)-julianday(?)) <= (5.0/1440.0)) ORDER BY source_provider='canvas' DESC LIMIT 1`,
            )
            .get(courseId, item.title, item.dueAt, item.dueAt) as
            | {
                id: number;
                sourceProvider: string;
                sourceId: string;
                dueAt: string | null;
              }
            | undefined);
    let assignmentId: number;
    const canonicalCanvas = Boolean(canonical);
    if (canonicalCanvas) {
      assignmentId = canonical!.id;
      if (existing && existing.id !== assignmentId)
        this.mergeDuplicateAssignment(existing.id, assignmentId, syncedAt);
    } else {
      const target = existing ?? duplicate;
      const row = sqlite
        .prepare(
          `INSERT INTO assignments (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,raw_snapshot_path,content_hash,course_id,title,points_possible,due_at,due_at_original,unlock_at,published,workflow_state,assignment_type,provider_json) VALUES ('gradescope',?,?,?,?,?,?,?,?,?,?,?,?,?,1,'published',?,?) ON CONFLICT(source_provider,source_id) DO UPDATE SET source_url=excluded.source_url,last_seen_at=excluded.last_seen_at,last_synced_at=excluded.last_synced_at,raw_snapshot_path=excluded.raw_snapshot_path,content_hash=excluded.content_hash,course_id=excluded.course_id,title=excluded.title,points_possible=COALESCE(excluded.points_possible,assignments.points_possible),due_at=excluded.due_at,due_at_original=excluded.due_at_original,unlock_at=excluded.unlock_at,published=1,workflow_state='published',assignment_type=excluded.assignment_type,provider_json=excluded.provider_json RETURNING id`,
        )
        .get(
          target?.sourceProvider === 'gradescope'
            ? target.sourceId
            : item.sourceId,
          item.sourceUrl,
          syncedAt,
          syncedAt,
          syncedAt,
          rawSnapshotPath,
          contentHash(item),
          courseId,
          item.title,
          item.pointsPossible,
          item.dueAt,
          item.dueAt,
          item.releaseAt,
          item.assignmentType,
          json(item),
        ) as { id: number };
      assignmentId = row.id;
      if (!target) {
        sqlite
          .prepare(
            `INSERT INTO change_events (course_id,entity_type,entity_id,change_type,summary,current_json,detected_at,sync_run_id) VALUES (?,'assignment',?,'NEW_ASSIGNMENT',?,?,?,?)`,
          )
          .run(
            courseId,
            assignmentId,
            `New Gradescope assignment: ${item.title}`,
            json({ dueAt: item.dueAt }),
            syncedAt,
            runId,
          );
      } else if (target.dueAt !== item.dueAt) {
        sqlite
          .prepare(
            `INSERT INTO change_events (course_id,entity_type,entity_id,change_type,summary,previous_json,current_json,detected_at,sync_run_id) VALUES (?,'assignment',?,'DEADLINE_CHANGED',?,?,?,?,?)`,
          )
          .run(
            courseId,
            assignmentId,
            `${item.title} deadline changed in Gradescope`,
            json({ dueAt: target.dueAt }),
            json({ dueAt: item.dueAt }),
            syncedAt,
            runId,
          );
      }
    }

    const priorSubmission = sqlite
      .prepare(
        `SELECT provider_state AS providerState FROM submissions WHERE assignment_id=?`,
      )
      .get(assignmentId) as { providerState: string } | undefined;
    const stateRank: Record<string, number> = {
      UNSUBMITTED: 0,
      SUBMITTED: 1,
      GRADED: 2,
    };
    const providerState =
      (stateRank[priorSubmission?.providerState ?? 'UNSUBMITTED'] ?? 0) >
      stateRank[item.providerState]
        ? priorSubmission!.providerState
        : item.providerState;
    const missing = Number(
      item.providerState === 'UNSUBMITTED' &&
        Boolean(item.dueAt) &&
        new Date(item.dueAt!).getTime() < Date.now(),
    );
    if (canonicalCanvas) {
      mergeGradescopeIntoCanvasSubmission(
        assignmentId,
        item,
        providerState,
        missing,
        syncedAt,
      );
    } else {
      sqlite
        .prepare(
          `INSERT INTO submissions (assignment_id,provider_state,submission_url,score,grade,late,missing,excused,last_synced_at,provider_json) VALUES (?,?,?,?,?,0,?,0,?,?) ON CONFLICT(assignment_id) DO UPDATE SET provider_state=excluded.provider_state,submission_url=COALESCE(excluded.submission_url,submissions.submission_url),score=COALESCE(excluded.score,submissions.score),grade=COALESCE(excluded.grade,submissions.grade),missing=excluded.missing,last_synced_at=excluded.last_synced_at,provider_json=excluded.provider_json`,
        )
        .run(
          assignmentId,
          providerState,
          item.sourceUrl,
          item.score,
          item.score == null ? null : String(item.score),
          missing,
          syncedAt,
          json(item),
        );
    }
    sqlite
      .prepare(
        `INSERT INTO local_task_metadata (assignment_id,workflow_status,notes,priority,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(assignment_id) DO UPDATE SET workflow_status=CASE WHEN excluded.workflow_status IN ('SUBMITTED','GRADED') AND local_task_metadata.workflow_status!='DONE_LOCALLY' THEN excluded.workflow_status ELSE local_task_metadata.workflow_status END,updated_at=excluded.updated_at`,
      )
      .run(assignmentId, providerState, '', 0, syncedAt, syncedAt);
  }

  private mergeDuplicateAssignment(
    sourceAssignmentId: number,
    targetAssignmentId: number,
    syncedAt: string,
  ) {
    const { sqlite } = getDb();
    sqlite.transaction(() => {
      const source = sqlite
        .prepare(`SELECT * FROM local_task_metadata WHERE assignment_id=?`)
        .get(sourceAssignmentId) as Record<string, unknown> | undefined;
      const target = sqlite
        .prepare(`SELECT * FROM local_task_metadata WHERE assignment_id=?`)
        .get(targetAssignmentId) as Record<string, unknown> | undefined;
      if (source && target) {
        sqlite
          .prepare(`UPDATE subtasks SET local_task_id=? WHERE local_task_id=?`)
          .run(target.id, source.id);
        sqlite
          .prepare(
            `UPDATE timer_sessions SET local_task_id=? WHERE local_task_id=?`,
          )
          .run(target.id, source.id);
        const sourceNotes = String(source.notes ?? '').trim();
        const targetNotes = String(target.notes ?? '').trim();
        const notes =
          sourceNotes && !targetNotes.includes(sourceNotes)
            ? [targetNotes, sourceNotes].filter(Boolean).join('\n\n')
            : targetNotes;
        const workflowRank: Record<string, number> = {
          NOT_STARTED: 0,
          IN_PROGRESS: 1,
          DONE_LOCALLY: 2,
          SUBMITTED: 3,
          GRADED: 4,
        };
        const sourceWorkflow = String(source.workflow_status ?? 'NOT_STARTED');
        const targetWorkflow = String(target.workflow_status ?? 'NOT_STARTED');
        const workflowStatus =
          (workflowRank[sourceWorkflow] ?? 0) >
          (workflowRank[targetWorkflow] ?? 0)
            ? sourceWorkflow
            : targetWorkflow;
        sqlite
          .prepare(
            `UPDATE local_task_metadata SET workflow_status=?,notes=?,priority=max(priority,?),personal_due_at=COALESCE(personal_due_at,?),estimated_minutes=COALESCE(estimated_minutes,?),pinned=max(pinned,?),updated_at=? WHERE id=?`,
          )
          .run(
            workflowStatus,
            notes,
            Number(source.priority ?? 0),
            source.personal_due_at ?? null,
            source.estimated_minutes ?? null,
            Number(source.pinned ?? 0),
            syncedAt,
            target.id,
          );
        sqlite
          .prepare(`DELETE FROM local_task_metadata WHERE id=?`)
          .run(source.id);
      } else if (source) {
        sqlite
          .prepare(
            `UPDATE local_task_metadata SET assignment_id=?,updated_at=? WHERE id=?`,
          )
          .run(targetAssignmentId, syncedAt, source.id);
      }
      sqlite
        .prepare(
          `UPDATE imported_artifacts SET assignment_id=? WHERE assignment_id=?`,
        )
        .run(targetAssignmentId, sourceAssignmentId);
      sqlite
        .prepare(
          `UPDATE change_events SET entity_id=? WHERE entity_type='assignment' AND entity_id=?`,
        )
        .run(targetAssignmentId, sourceAssignmentId);
      sqlite
        .prepare(`DELETE FROM assignments WHERE id=?`)
        .run(sourceAssignmentId);
    })();
  }

  private writeRaw(root: string, filename: string, value: unknown) {
    fs.writeFileSync(
      path.join(root, filename),
      `${JSON.stringify(value, null, 2)}\n`,
      { mode: 0o600 },
    );
  }
}

export function importGradescopeArtifact(
  sourcePath: string,
  courseId?: number,
  assignmentId?: number,
) {
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) throw new Error('Import path must be a file.');
  const bytes = fs.readFileSync(sourcePath);
  return importGradescopeArtifactBytes(
    bytes,
    path.basename(sourcePath),
    undefined,
    courseId,
    assignmentId,
  );
}

export function importGradescopeArtifactBytes(
  bytes: Buffer,
  originalFilename: string,
  contentType?: string,
  courseId?: number,
  assignmentId?: number,
) {
  initializeDatabase();
  const hash = contentHash(bytes.toString('base64'));
  const targetDir = path.join(dataDir, 'raw', 'gradescope', 'imports');
  fs.mkdirSync(targetDir, { recursive: true });
  const filename = sanitizeFilename(path.basename(originalFilename));
  const target = path.join(targetDir, `${hash.slice(0, 12)}-${filename}`);
  if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, { mode: 0o600 });
  let parsed: unknown = null;
  if (filename.toLowerCase().endsWith('.json')) {
    try {
      parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
      parsed = null;
    }
  }
  const at = nowIso();
  const row = getDb()
    .sqlite.prepare(
      `INSERT INTO imported_artifacts (provider,course_id,assignment_id,filename,content_type,local_path,content_hash,imported_at,parsed_json) VALUES ('gradescope',?,?,?,?,?,?,?,?) RETURNING id`,
    )
    .get(
      courseId ?? null,
      assignmentId ?? null,
      filename,
      contentType ?? null,
      path.relative(dataDir, target),
      hash,
      at,
      parsed ? JSON.stringify(parsed) : null,
    ) as { id: number };
  return {
    id: row.id,
    localPath: target,
    contentHash: hash,
    parsed: Boolean(parsed),
  };
}
