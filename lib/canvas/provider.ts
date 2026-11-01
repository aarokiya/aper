import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { BrowserContext } from 'playwright';
import type {
  AcademicProvider,
  AuthStatus,
  DiscoveryResult,
  SyncResult,
} from '@/lib/sync/provider';
import { contentHash, mapLimit, nowIso } from '@/lib/sync/utils';
import { getDb, initializeDatabase, dataDir } from '@/lib/db/client';
import { APP_TIME_ZONE } from '@/lib/time-zone';
import {
  authenticateCanvas,
  checkCanvasAuth,
  openCanvasContext,
  CANVAS_ORIGIN,
} from './auth';
import { CanvasApi } from './api';
import {
  canvasAssignmentSchema,
  canvasCourseSchema,
  canvasUserSchema,
  type CanvasAssignment,
  type CanvasCourse,
} from './types';
import {
  htmlToText,
  sanitizeAcademicHtml,
  sanitizeFilename,
} from '@/lib/export/content';
import { normalizeProviderState } from '@/lib/tasks/status';

type Json = Record<string, unknown>;
type SyncCounters = {
  seen: number;
  updated: number;
  warnings: string[];
  errors: string[];
  timings: Record<string, number>;
};

const json = (value: unknown) => JSON.stringify(value ?? null);
const idOf = (value: unknown) => String(value ?? '');
const time = async <T>(
  label: string,
  timings: Record<string, number>,
  fn: () => Promise<T>,
) => {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    timings[label] = Math.round(performance.now() - start);
  }
};

/**
 * Canvas lists only active enrollments, so a class missing from a complete
 * course list was dropped or has ended. It stops being current (out of the
 * rail, Today, the calendar, and Grades); its synced data is kept, and it
 * becomes current again if Canvas lists it again.
 */
export function retireUnlistedCanvasCourses(
  listedSourceIds: readonly string[],
) {
  getDb()
    .sqlite.prepare(
      `UPDATE courses SET is_current=0 WHERE source_provider='canvas' AND is_current=1 AND source_id NOT IN (SELECT value FROM json_each(?))`,
    )
    .run(JSON.stringify(listedSourceIds));
}

export class CanvasProvider implements AcademicProvider {
  async checkAuth(): Promise<AuthStatus> {
    const context = await openCanvasContext(true);
    try {
      return await checkCanvasAuth(context);
    } finally {
      await context.close();
    }
  }

  authenticate() {
    return authenticateCanvas().then(() => undefined);
  }

  async discover(): Promise<DiscoveryResult> {
    return {
      provider: 'canvas',
      observedAt: nowIso(),
      sources: [
        {
          entity: 'dashboard cards',
          browserUrl: `${CANVAS_ORIGIN}/`,
          endpoint: '/api/v1/dashboard/dashboard_cards',
          method: 'GET',
          reliability: 'high',
        },
        {
          entity: 'planner',
          browserUrl: `${CANVAS_ORIGIN}/`,
          endpoint: '/api/v1/planner/items',
          method: 'GET',
          reliability: 'high',
        },
        {
          entity: 'missing submissions',
          browserUrl: `${CANVAS_ORIGIN}/`,
          endpoint: '/api/v1/users/self/missing_submissions',
          method: 'GET',
          reliability: 'high',
        },
        {
          entity: 'assignment',
          browserUrl: `${CANVAS_ORIGIN}/courses/:courseId/assignments/:id`,
          endpoint: '/api/v1/courses/:courseId/assignments/:id',
          method: 'GET',
          reliability: 'high',
        },
        {
          entity: 'modules',
          browserUrl: `${CANVAS_ORIGIN}/courses/:courseId/modules`,
          endpoint:
            '/api/v1/courses/:courseId/modules?include[]=items&include[]=content_details',
          method: 'GET',
          reliability: 'high',
        },
        {
          entity: 'course pages',
          browserUrl: `${CANVAS_ORIGIN}/courses/:courseId/pages/:slug`,
          endpoint: '/api/v1/courses/:courseId/pages',
          method: 'GET',
          reliability: 'high',
        },
        {
          entity: 'rendered assignment fallback',
          browserUrl: `${CANVAS_ORIGIN}/courses/:courseId/assignments/:id`,
          method: 'DOM',
          reliability: 'fallback',
        },
      ],
    };
  }

  async sync(): Promise<SyncResult> {
    initializeDatabase();
    const { sqlite } = getDb();
    const startedAt = nowIso();
    const runRow = sqlite
      .prepare(
        `INSERT INTO sync_runs (provider,started_at,status,auth_status,errors_json,warnings_json,timings_json) VALUES ('canvas',?,'RUNNING','UNKNOWN','[]','[]','{}') RETURNING id`,
      )
      .get(startedAt) as { id: number };
    const runId = runRow.id;
    const counters: SyncCounters = {
      seen: 0,
      updated: 0,
      warnings: [],
      errors: [],
      timings: {},
    };
    let context: BrowserContext | undefined;
    try {
      context = await openCanvasContext(true);
      const auth = await checkCanvasAuth(context);
      sqlite
        .prepare(
          `INSERT INTO providers (key,display_name,auth_status,last_attempt_at) VALUES ('canvas','Georgia Tech Canvas',?,?) ON CONFLICT(key) DO UPDATE SET auth_status=excluded.auth_status,last_attempt_at=excluded.last_attempt_at,last_error=NULL`,
        )
        .run(auth.state, startedAt);
      if (auth.state !== 'CONNECTED') {
        const finishedAt = nowIso();
        sqlite
          .prepare(
            `UPDATE sync_runs SET status='AUTH_REQUIRED',auth_status=?,finished_at=?,errors_json=? WHERE id=?`,
          )
          .run(
            auth.state,
            finishedAt,
            json([auth.detail ?? 'Canvas authentication required.']),
            runId,
          );
        return {
          provider: 'canvas',
          runId,
          startedAt,
          finishedAt,
          status: 'AUTH_REQUIRED',
          entitiesSeen: 0,
          entitiesUpdated: 0,
          warnings: [],
          errors: [auth.detail ?? 'Authentication required'],
          timings: {},
        };
      }
      const api = new CanvasApi(context.request);
      const rawRoot = path.join(dataDir, 'raw', 'canvas', `run-${runId}`);
      fs.mkdirSync(rawRoot, { recursive: true });
      const userRaw = await time('account', counters.timings, () =>
        api.get<Json>('/api/v1/users/self'),
      );
      canvasUserSchema.parse(userRaw);
      this.writeRaw(rawRoot, 'account.json', userRaw);

      const courseRaw = await time('courses', counters.timings, () =>
        api.paginate<Json>(
          '/api/v1/courses?enrollment_state=active&state[]=available&include[]=term&include[]=teachers&include[]=total_scores&include[]=syllabus_body&per_page=100',
        ),
      );
      this.writeRaw(rawRoot, 'courses.json', courseRaw);
      const courseList = courseRaw.map((item) =>
        canvasCourseSchema.parse(item),
      );
      counters.seen += courseList.length;
      const courseMap = new Map<string, number>();
      for (const course of courseList)
        courseMap.set(
          idOf(course.id),
          this.upsertCourse(
            course,
            startedAt,
            path.relative(dataDir, path.join(rawRoot, 'courses.json')),
          ),
        );
      counters.updated += courseList.length;
      retireUnlistedCanvasCourses(courseList.map((course) => idOf(course.id)));

      await mapLimit(courseList, 3, async (course) => {
        const sourceCourseId = idOf(course.id);
        const localCourseId = courseMap.get(sourceCourseId)!;
        const courseFolder = path.join(
          rawRoot,
          `course-${sanitizeFilename(sourceCourseId)}`,
        );
        fs.mkdirSync(courseFolder, { recursive: true });
        try {
          await this.syncCourse(
            api,
            course,
            localCourseId,
            courseFolder,
            runId,
            counters,
            startedAt,
          );
        } catch (error) {
          const message = `Course ${sourceCourseId}: ${error instanceof Error ? error.message : String(error)}`;
          counters.errors.push(message);
        }
      });

      try {
        const start = new Date(Date.now() - 120 * 86_400_000).toISOString();
        const end = new Date(Date.now() + 365 * 86_400_000).toISOString();
        const planner = await time('planner', counters.timings, () =>
          api.paginate<Json>(
            `/api/v1/planner/items?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&per_page=100`,
          ),
        );
        this.writeRaw(rawRoot, 'planner.json', planner);
        this.upsertPlanner(
          planner,
          courseMap,
          startedAt,
          path.relative(dataDir, path.join(rawRoot, 'planner.json')),
        );
        counters.seen += planner.length;
        counters.updated += planner.length;
      } catch (error) {
        counters.warnings.push(
          `Planner: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const finishedAt = nowIso();
      const status = counters.errors.length
        ? counters.updated
          ? 'PARTIAL'
          : 'FAILED'
        : 'SUCCESS';
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
          runId,
        );
      if (status !== 'FAILED')
        sqlite
          .prepare(
            `UPDATE providers SET auth_status='CONNECTED',last_success_at=?,last_error=NULL WHERE key='canvas'`,
          )
          .run(finishedAt);
      else
        sqlite
          .prepare(`UPDATE providers SET last_error=? WHERE key='canvas'`)
          .run(counters.errors.join('; '));
      return {
        provider: 'canvas',
        runId,
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
          `UPDATE sync_runs SET finished_at=?,status='FAILED',errors_json=? WHERE id=?`,
        )
        .run(finishedAt, json([message]), runId);
      sqlite
        .prepare(
          `UPDATE providers SET last_error=?,last_attempt_at=? WHERE key='canvas'`,
        )
        .run(message, finishedAt);
      return {
        provider: 'canvas',
        runId,
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

  private writeRaw(root: string, filename: string, value: unknown) {
    fs.writeFileSync(
      path.join(root, filename),
      `${JSON.stringify(value, null, 2)}\n`,
      { mode: 0o600 },
    );
  }

  private upsertCourse(
    course: CanvasCourse,
    syncedAt: string,
    rawSnapshotPath: string,
  ) {
    const { sqlite } = getDb();
    const enrollment = Array.isArray(course.enrollments)
      ? (course.enrollments[0] as Json | undefined)
      : undefined;
    const score =
      typeof enrollment?.computed_current_score === 'number'
        ? enrollment.computed_current_score
        : null;
    const grade =
      typeof enrollment?.computed_current_grade === 'string'
        ? enrollment.computed_current_grade
        : null;
    const finalScore =
      typeof enrollment?.computed_final_score === 'number'
        ? enrollment.computed_final_score
        : null;
    const hash = contentHash(course);
    const row = sqlite
      .prepare(`INSERT INTO courses (source_provider,source_id,source_url,first_seen_at,last_seen_at,source_updated_at,last_synced_at,raw_snapshot_path,content_hash,name,course_code,short_name,term_name,state,enrollment_state,start_at,end_at,time_zone,syllabus_url,syllabus_html,syllabus_text,homepage_url,image_url,current_score,current_grade,final_score,is_current,provider_json)
      VALUES ('canvas',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
      ON CONFLICT(source_provider,source_id) DO UPDATE SET source_url=excluded.source_url,last_seen_at=excluded.last_seen_at,last_synced_at=excluded.last_synced_at,raw_snapshot_path=excluded.raw_snapshot_path,content_hash=excluded.content_hash,name=excluded.name,course_code=excluded.course_code,term_name=excluded.term_name,state=excluded.state,enrollment_state=excluded.enrollment_state,start_at=excluded.start_at,end_at=excluded.end_at,time_zone=excluded.time_zone,syllabus_html=excluded.syllabus_html,syllabus_text=excluded.syllabus_text,current_score=excluded.current_score,current_grade=excluded.current_grade,final_score=excluded.final_score,is_current=1,provider_json=excluded.provider_json RETURNING id`)
      .get(
        idOf(course.id),
        `${CANVAS_ORIGIN}/courses/${idOf(course.id)}`,
        syncedAt,
        syncedAt,
        null,
        syncedAt,
        rawSnapshotPath,
        hash,
        course.name,
        course.course_code ?? null,
        course.course_code ?? null,
        course.term?.name ?? null,
        course.workflow_state ?? null,
        course.enrollment_state ?? null,
        course.start_at ?? null,
        course.end_at ?? null,
        course.time_zone ?? APP_TIME_ZONE,
        `${CANVAS_ORIGIN}/courses/${idOf(course.id)}/assignments/syllabus`,
        course.syllabus_body ?? null,
        htmlToText(course.syllabus_body),
        `${CANVAS_ORIGIN}/courses/${idOf(course.id)}`,
        typeof course.image_download_url === 'string'
          ? course.image_download_url
          : null,
        score,
        grade,
        finalScore,
        json(course),
      ) as { id: number };
    sqlite.prepare(`DELETE FROM course_people WHERE course_id=?`).run(row.id);
    for (const teacher of course.teachers ?? [])
      sqlite
        .prepare(
          `INSERT INTO course_people (course_id,source_id,name,role,avatar_url) VALUES (?,?,?,?,?)`,
        )
        .run(
          row.id,
          teacher.id ? idOf(teacher.id) : null,
          teacher.display_name ?? 'Instructor',
          'INSTRUCTOR',
          teacher.avatar_image_url ?? null,
        );
    if (score !== null || grade !== null)
      sqlite
        .prepare(
          `INSERT INTO grade_snapshots (course_id,captured_at,current_score,current_grade,final_score,source_json) VALUES (?,?,?,?,?,?)`,
        )
        .run(row.id, syncedAt, score, grade, finalScore, json(enrollment));
    return row.id;
  }

  private async syncCourse(
    api: CanvasApi,
    course: CanvasCourse,
    localCourseId: number,
    folder: string,
    runId: number,
    counters: SyncCounters,
    syncedAt: string,
  ) {
    const sourceCourseId = idOf(course.id);
    const { sqlite } = getDb();
    sqlite
      .prepare(`UPDATE sync_runs SET progress_label=? WHERE id=?`)
      .run(`Syncing Canvas… ${course.course_code ?? course.name}`, runId);
    const groups = await api
      .paginate<Json>(
        `/api/v1/courses/${sourceCourseId}/assignment_groups?include[]=assignments&include[]=submission&per_page=100`,
      )
      .catch((error) => {
        counters.warnings.push(
          `Assignment groups ${sourceCourseId}: ${error.message}`,
        );
        return [];
      });
    this.writeRaw(folder, 'assignment-groups.json', groups);
    const groupMap = new Map<string, number>();
    for (const group of groups) {
      const row = sqlite
        .prepare(
          `INSERT INTO assignment_groups (course_id,source_id,name,position,group_weight,rules_json) VALUES (?,?,?,?,?,?) ON CONFLICT(course_id,source_id) DO UPDATE SET name=excluded.name,position=excluded.position,group_weight=excluded.group_weight,rules_json=excluded.rules_json RETURNING id`,
        )
        .get(
          localCourseId,
          idOf(group.id),
          String(group.name ?? 'Assignments'),
          group.position ?? null,
          group.group_weight ?? null,
          json(group.rules),
        ) as { id: number };
      groupMap.set(idOf(group.id), row.id);
    }

    const assignmentsRaw = await api.paginate<Json>(
      `/api/v1/courses/${sourceCourseId}/assignments?include[]=submission&include[]=rubric_assessment&include[]=all_dates&include[]=overrides&per_page=100`,
    );
    this.writeRaw(folder, 'assignments.json', assignmentsRaw);
    for (const item of assignmentsRaw)
      this.upsertAssignment(
        canvasAssignmentSchema.parse(item),
        localCourseId,
        groupMap,
        syncedAt,
        path.relative(dataDir, path.join(folder, 'assignments.json')),
        runId,
      );
    counters.seen += assignmentsRaw.length;
    counters.updated += assignmentsRaw.length;

    const pagesStarted = performance.now();
    try {
      const pageIndex = await api.paginate<Json>(
        `/api/v1/courses/${sourceCourseId}/pages?per_page=100`,
      );
      const pages = await mapLimit(pageIndex, 4, async (item) => {
        if (typeof item.body === 'string') return item;
        const slug = typeof item.url === 'string' ? item.url : null;
        if (!slug) return item;
        try {
          return await api.get<Json>(
            `/api/v1/courses/${sourceCourseId}/pages/${encodeURIComponent(slug)}`,
          );
        } catch (error) {
          counters.warnings.push(
            `page ${sourceCourseId}/${slug}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return item;
        }
      });
      this.writeRaw(folder, 'pages.json', pages);
      this.upsertPages(
        pages,
        localCourseId,
        syncedAt,
        path.relative(dataDir, path.join(folder, 'pages.json')),
      );
      counters.seen += pages.length;
      counters.updated += pages.length;
    } catch (error) {
      counters.warnings.push(
        `pages ${sourceCourseId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      counters.timings[`pages:${sourceCourseId}`] = Math.round(
        performance.now() - pagesStarted,
      );
    }

    const filesStarted = performance.now();
    try {
      const files = await api.paginate<Json>(
        `/api/v1/courses/${sourceCourseId}/files?per_page=100`,
      );
      this.writeRaw(folder, 'files.json', files);
      this.upsertFiles(
        files,
        localCourseId,
        sourceCourseId,
        syncedAt,
        path.relative(dataDir, path.join(folder, 'files.json')),
      );
      await this.downloadUsefulFiles(
        api,
        files,
        String(course.course_code ?? course.name),
        counters,
      );
      counters.seen += files.length;
      counters.updated += files.length;
    } catch (error) {
      counters.warnings.push(
        `files ${sourceCourseId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      counters.timings[`files:${sourceCourseId}`] = Math.round(
        performance.now() - filesStarted,
      );
    }

    const categoryCalls: Array<[string, string, (items: Json[]) => void]> = [
      [
        'modules',
        `/api/v1/courses/${sourceCourseId}/modules?include[]=items&include[]=content_details&per_page=100`,
        (items) =>
          this.upsertModules(
            items,
            localCourseId,
            sourceCourseId,
            syncedAt,
            path.relative(dataDir, path.join(folder, 'modules.json')),
          ),
      ],
      [
        'announcements',
        `/api/v1/announcements?context_codes[]=course_${sourceCourseId}&active_only=false&latest_only=false&per_page=100`,
        (items) =>
          this.upsertAnnouncements(
            items,
            localCourseId,
            syncedAt,
            path.relative(dataDir, path.join(folder, 'announcements.json')),
          ),
      ],
    ];
    await Promise.all(
      categoryCalls.map(async ([label, endpoint, persist]) => {
        const started = performance.now();
        try {
          const items = await api.paginate<Json>(endpoint);
          this.writeRaw(folder, `${label}.json`, items);
          persist(items);
          counters.seen += items.length;
          counters.updated += items.length;
        } catch (error) {
          counters.warnings.push(
            `${label} ${sourceCourseId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          counters.timings[`${label}:${sourceCourseId}`] = Math.round(
            performance.now() - started,
          );
        }
      }),
    );
  }

  private upsertAssignment(
    item: CanvasAssignment,
    courseId: number,
    groupMap: Map<string, number>,
    syncedAt: string,
    rawSnapshotPath: string,
    runId: number,
  ) {
    const { sqlite } = getDb();
    const sourceId = idOf(item.id);
    const prior = sqlite
      .prepare(
        `SELECT id,due_at,points_possible,content_hash FROM assignments WHERE source_provider='canvas' AND source_id=?`,
      )
      .get(sourceId) as
      | {
          id: number;
          due_at: string | null;
          points_possible: number | null;
          content_hash: string | null;
        }
      | undefined;
    const hash = contentHash(item);
    const html = item.description ?? '';
    const submission = item.submission as Json | null | undefined;
    const external =
      Array.isArray(item.submission_types) &&
      item.submission_types.includes('external_tool');
    const externalData = item.external_tool_tag_attributes as Json | undefined;
    const row = sqlite
      .prepare(`INSERT INTO assignments (source_provider,source_id,source_url,first_seen_at,last_seen_at,source_updated_at,last_synced_at,raw_snapshot_path,content_hash,course_id,assignment_group_id,title,description_html,sanitized_html,description_text,points_possible,grading_type,submission_types_json,due_at,due_at_original,unlock_at,lock_at,published,workflow_state,allowed_attempts,attempts_used,rubric_json,rubric_settings_json,all_dates_json,external_tool_name,external_tool_url,quiz_id,discussion_id,assignment_type,provider_json)
      VALUES ('canvas',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(source_provider,source_id) DO UPDATE SET source_url=excluded.source_url,last_seen_at=excluded.last_seen_at,source_updated_at=excluded.source_updated_at,last_synced_at=excluded.last_synced_at,raw_snapshot_path=excluded.raw_snapshot_path,content_hash=excluded.content_hash,course_id=excluded.course_id,assignment_group_id=excluded.assignment_group_id,title=excluded.title,description_html=excluded.description_html,sanitized_html=excluded.sanitized_html,description_text=excluded.description_text,points_possible=excluded.points_possible,grading_type=excluded.grading_type,submission_types_json=excluded.submission_types_json,due_at=excluded.due_at,due_at_original=excluded.due_at_original,unlock_at=excluded.unlock_at,lock_at=excluded.lock_at,published=excluded.published,workflow_state=excluded.workflow_state,allowed_attempts=excluded.allowed_attempts,attempts_used=excluded.attempts_used,rubric_json=excluded.rubric_json,rubric_settings_json=excluded.rubric_settings_json,all_dates_json=excluded.all_dates_json,external_tool_name=excluded.external_tool_name,external_tool_url=excluded.external_tool_url,quiz_id=excluded.quiz_id,discussion_id=excluded.discussion_id,assignment_type=excluded.assignment_type,provider_json=excluded.provider_json RETURNING id`)
      .get(
        sourceId,
        item.html_url ??
          `${CANVAS_ORIGIN}/courses/${courseId}/assignments/${sourceId}`,
        syncedAt,
        syncedAt,
        typeof item.updated_at === 'string' ? item.updated_at : null,
        syncedAt,
        rawSnapshotPath,
        hash,
        courseId,
        item.assignment_group_id
          ? (groupMap.get(idOf(item.assignment_group_id)) ?? null)
          : null,
        item.name,
        html,
        sanitizeAcademicHtml(html),
        htmlToText(html),
        item.points_possible ?? null,
        typeof item.grading_type === 'string' ? item.grading_type : null,
        json(item.submission_types),
        item.due_at ?? null,
        item.due_at ?? null,
        item.unlock_at ?? null,
        item.lock_at ?? null,
        typeof item.published === 'boolean' ? Number(item.published) : null,
        typeof item.workflow_state === 'string' ? item.workflow_state : null,
        typeof item.allowed_attempts === 'number'
          ? item.allowed_attempts
          : null,
        typeof submission?.attempt === 'number' ? submission.attempt : null,
        json(item.rubric),
        json(item.rubric_settings),
        json(item.all_dates),
        external
          ? typeof externalData?.tool_name === 'string'
            ? externalData.tool_name
            : 'External tool'
          : null,
        external
          ? typeof externalData?.url === 'string'
            ? externalData.url
            : (item.html_url ?? null)
          : null,
        item.quiz_id ? idOf(item.quiz_id) : null,
        item.discussion_topic ? idOf((item.discussion_topic as Json).id) : null,
        this.inferAssignmentType(item),
        json(item),
      ) as { id: number };
    if (submission) this.upsertSubmission(row.id, submission, syncedAt);
    sqlite
      .prepare(
        `INSERT INTO local_task_metadata (assignment_id,workflow_status,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(assignment_id) DO NOTHING`,
      )
      .run(
        row.id,
        normalizeProviderState({
          workflowState:
            typeof submission?.workflow_state === 'string'
              ? submission.workflow_state
              : null,
          submittedAt:
            typeof submission?.submitted_at === 'string'
              ? submission.submitted_at
              : null,
          gradedAt:
            typeof submission?.graded_at === 'string'
              ? submission.graded_at
              : null,
          excused: Boolean(submission?.excused),
        }),
        syncedAt,
        syncedAt,
      );
    if (prior && prior.due_at !== (item.due_at ?? null))
      this.recordChange(
        courseId,
        row.id,
        'assignment',
        'DEADLINE_CHANGED',
        `${item.name} deadline changed`,
        { dueAt: prior.due_at },
        { dueAt: item.due_at ?? null },
        syncedAt,
        runId,
      );
    if (prior && prior.points_possible !== (item.points_possible ?? null))
      this.recordChange(
        courseId,
        row.id,
        'assignment',
        'POINTS_CHANGED',
        `${item.name} points changed`,
        { points: prior.points_possible },
        { points: item.points_possible ?? null },
        syncedAt,
        runId,
      );
    if (!prior)
      this.recordChange(
        courseId,
        row.id,
        'assignment',
        'NEW_ASSIGNMENT',
        `New assignment: ${item.name}`,
        null,
        { dueAt: item.due_at ?? null },
        syncedAt,
        runId,
      );
  }

  private upsertSubmission(
    assignmentId: number,
    submission: Json,
    syncedAt: string,
  ) {
    const { sqlite } = getDb();
    const state = normalizeProviderState({
      workflowState:
        typeof submission.workflow_state === 'string'
          ? submission.workflow_state
          : null,
      submittedAt:
        typeof submission.submitted_at === 'string'
          ? submission.submitted_at
          : null,
      gradedAt:
        typeof submission.graded_at === 'string' ? submission.graded_at : null,
      missing: Boolean(submission.missing),
      late: Boolean(submission.late),
      excused: Boolean(submission.excused),
    });
    sqlite
      .prepare(`INSERT INTO submissions (assignment_id,provider_state,submitted_at,attempt,submission_type,submission_url,score,grade,entered_grade,late,missing,excused,graded_at,posted_at,seconds_late,attachments_json,comments_json,rubric_assessment_json,history_json,last_synced_at,provider_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(assignment_id) DO UPDATE SET provider_state=excluded.provider_state,submitted_at=excluded.submitted_at,attempt=excluded.attempt,submission_type=excluded.submission_type,submission_url=excluded.submission_url,score=excluded.score,grade=excluded.grade,entered_grade=excluded.entered_grade,late=excluded.late,missing=excluded.missing,excused=excluded.excused,graded_at=excluded.graded_at,posted_at=excluded.posted_at,seconds_late=excluded.seconds_late,attachments_json=excluded.attachments_json,comments_json=excluded.comments_json,rubric_assessment_json=excluded.rubric_assessment_json,history_json=excluded.history_json,last_synced_at=excluded.last_synced_at,provider_json=excluded.provider_json`)
      .run(
        assignmentId,
        state,
        submission.submitted_at ?? null,
        submission.attempt ?? null,
        submission.submission_type ?? null,
        submission.url ?? null,
        submission.score ?? null,
        submission.grade ?? null,
        submission.entered_grade ?? null,
        Number(Boolean(submission.late)),
        Number(Boolean(submission.missing)),
        Number(Boolean(submission.excused)),
        submission.graded_at ?? null,
        submission.posted_at ?? null,
        submission.seconds_late ?? null,
        json(submission.attachments),
        json(submission.submission_comments),
        json(submission.rubric_assessment),
        json(submission.submission_history),
        syncedAt,
        json(submission),
      );
    if (state === 'SUBMITTED' || state === 'GRADED')
      sqlite
        .prepare(
          `UPDATE local_task_metadata SET workflow_status=?,updated_at=? WHERE assignment_id=? AND workflow_status NOT IN ('DONE_LOCALLY')`,
        )
        .run(state, syncedAt, assignmentId);
  }

  private upsertModules(
    items: Json[],
    courseId: number,
    sourceCourseId: string,
    syncedAt: string,
    rawPath: string,
  ) {
    const { sqlite } = getDb();
    for (const item of items) {
      const sourceId = idOf(item.id);
      const row = sqlite
        .prepare(
          `INSERT INTO modules (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,raw_snapshot_path,content_hash,course_id,title,position,state,unlock_at,prerequisite_module_ids_json,completion_requirements_json,provider_json) VALUES ('canvas',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_provider,source_id) DO UPDATE SET source_url=excluded.source_url,last_seen_at=excluded.last_seen_at,last_synced_at=excluded.last_synced_at,content_hash=excluded.content_hash,title=excluded.title,position=excluded.position,state=excluded.state,unlock_at=excluded.unlock_at,prerequisite_module_ids_json=excluded.prerequisite_module_ids_json,completion_requirements_json=excluded.completion_requirements_json,provider_json=excluded.provider_json RETURNING id`,
        )
        .get(
          sourceId,
          `${CANVAS_ORIGIN}/courses/${sourceCourseId}/modules#module_${sourceId}`,
          syncedAt,
          syncedAt,
          syncedAt,
          rawPath,
          contentHash(item),
          courseId,
          String(item.name ?? 'Module'),
          item.position ?? null,
          item.state ?? null,
          item.unlock_at ?? null,
          json(item.prerequisite_module_ids),
          json(item.requirement_count),
          json(item),
        ) as { id: number };
      sqlite.prepare(`DELETE FROM module_items WHERE module_id=?`).run(row.id);
      for (const moduleItem of Array.isArray(item.items)
        ? (item.items as Json[])
        : [])
        sqlite
          .prepare(
            `INSERT INTO module_items (module_id,source_id,title,type,position,content_id,html_url,external_url,completion_requirement_json,content_details_json) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            row.id,
            idOf(moduleItem.id),
            String(moduleItem.title ?? 'Module item'),
            moduleItem.type ?? null,
            moduleItem.position ?? null,
            moduleItem.content_id ? idOf(moduleItem.content_id) : null,
            moduleItem.html_url ?? null,
            moduleItem.external_url ?? null,
            json(moduleItem.completion_requirement),
            json(moduleItem.content_details),
          );
    }
  }

  private upsertPages(
    items: Json[],
    courseId: number,
    syncedAt: string,
    rawPath: string,
  ) {
    const { sqlite } = getDb();
    for (const item of items) {
      const sourceId = idOf(item.page_id ?? item.url);
      const body = typeof item.body === 'string' ? item.body : '';
      sqlite
        .prepare(
          `INSERT INTO pages (source_provider,source_id,source_url,first_seen_at,last_seen_at,source_updated_at,last_synced_at,raw_snapshot_path,content_hash,course_id,title,slug,body_html,body_text,provider_json) VALUES ('canvas',?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_provider,source_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,source_updated_at=excluded.source_updated_at,last_synced_at=excluded.last_synced_at,content_hash=excluded.content_hash,title=excluded.title,slug=excluded.slug,body_html=excluded.body_html,body_text=excluded.body_text,provider_json=excluded.provider_json`,
        )
        .run(
          sourceId,
          item.html_url ?? null,
          syncedAt,
          syncedAt,
          item.updated_at ?? null,
          syncedAt,
          rawPath,
          contentHash(item),
          courseId,
          String(item.title ?? 'Page'),
          item.url ?? null,
          body,
          htmlToText(body),
          json(item),
        );
    }
  }

  private upsertFiles(
    items: Json[],
    courseId: number,
    sourceCourseId: string,
    syncedAt: string,
    rawPath: string,
  ) {
    const { sqlite } = getDb();
    for (const item of items)
      sqlite
        .prepare(
          `INSERT INTO course_files (source_provider,source_id,source_url,first_seen_at,last_seen_at,source_updated_at,last_synced_at,raw_snapshot_path,content_hash,course_id,folder_id,display_name,filename,content_type,size,download_url) VALUES ('canvas',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_provider,source_id) DO UPDATE SET source_url=excluded.source_url,last_seen_at=excluded.last_seen_at,source_updated_at=excluded.source_updated_at,last_synced_at=excluded.last_synced_at,content_hash=excluded.content_hash,folder_id=excluded.folder_id,display_name=excluded.display_name,filename=excluded.filename,content_type=excluded.content_type,size=excluded.size,download_url=excluded.download_url`,
        )
        .run(
          idOf(item.id),
          `${CANVAS_ORIGIN}/courses/${sourceCourseId}/files/${idOf(item.id)}`,
          syncedAt,
          syncedAt,
          item.updated_at ?? null,
          syncedAt,
          rawPath,
          contentHash(item),
          courseId,
          item.folder_id ? idOf(item.folder_id) : null,
          String(item.display_name ?? item.filename ?? 'File'),
          sanitizeFilename(
            String(item.filename ?? item.display_name ?? 'file'),
          ),
          item['content-type'] ?? item.content_type ?? null,
          item.size ?? null,
          item.url ?? null,
        );
  }

  private async downloadUsefulFiles(
    api: CanvasApi,
    items: Json[],
    courseLabel: string,
    counters: SyncCounters,
  ) {
    const eligible = items
      .filter((item) => {
        const contentType = String(
          item['content-type'] ?? item.content_type ?? '',
        ).toLowerCase();
        const size =
          typeof item.size === 'number' ? item.size : Number(item.size ?? 0);
        return (
          Boolean(item.url) &&
          size > 0 &&
          size <= 10 * 1024 * 1024 &&
          (contentType.startsWith('text/') ||
            /pdf|word|officedocument|powerpoint|presentation/.test(contentType))
        );
      })
      .slice(0, 25);
    const courseDir = path.join(
      dataDir,
      'downloads',
      sanitizeFilename(courseLabel),
    );
    fs.mkdirSync(courseDir, { recursive: true });
    await mapLimit(eligible, 3, async (item) => {
      const sourceId = idOf(item.id);
      const filename = `${sanitizeFilename(sourceId)}-${sanitizeFilename(String(item.filename ?? item.display_name ?? 'file'))}`;
      const target = path.join(courseDir, filename);
      const sourceUpdatedAt =
        typeof item.updated_at === 'string' ? Date.parse(item.updated_at) : 0;
      if (
        fs.existsSync(target) &&
        (!sourceUpdatedAt || fs.statSync(target).mtimeMs >= sourceUpdatedAt)
      ) {
        getDb()
          .sqlite.prepare(
            `UPDATE course_files SET local_path=? WHERE source_provider='canvas' AND source_id=?`,
          )
          .run(path.relative(dataDir, target), sourceId);
        return;
      }
      try {
        const response = await api.response(String(item.url));
        const bytes = await response.body();
        const hash = createHash('sha256').update(bytes).digest('hex');
        fs.writeFileSync(target, bytes, { mode: 0o600 });
        const updatedAt =
          typeof item.updated_at === 'string'
            ? new Date(item.updated_at)
            : null;
        if (updatedAt && !Number.isNaN(updatedAt.getTime()))
          fs.utimesSync(target, updatedAt, updatedAt);
        getDb()
          .sqlite.prepare(
            `UPDATE course_files SET local_path=?,file_hash=? WHERE source_provider='canvas' AND source_id=?`,
          )
          .run(path.relative(dataDir, target), hash, sourceId);
      } catch (error) {
        counters.warnings.push(
          `file ${sourceId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  private upsertAnnouncements(
    items: Json[],
    courseId: number,
    syncedAt: string,
    rawPath: string,
  ) {
    const { sqlite } = getDb();
    for (const item of items) {
      const html = typeof item.message === 'string' ? item.message : '';
      sqlite
        .prepare(
          `INSERT INTO announcements (source_provider,source_id,source_url,first_seen_at,last_seen_at,source_updated_at,last_synced_at,raw_snapshot_path,content_hash,course_id,title,message_html,message_text,author_name,posted_at,edited_at,read_state,attachments_json,provider_json) VALUES ('canvas',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_provider,source_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,source_updated_at=excluded.source_updated_at,last_synced_at=excluded.last_synced_at,content_hash=excluded.content_hash,title=excluded.title,message_html=excluded.message_html,message_text=excluded.message_text,author_name=excluded.author_name,posted_at=excluded.posted_at,edited_at=excluded.edited_at,read_state=excluded.read_state,attachments_json=excluded.attachments_json,provider_json=excluded.provider_json`,
        )
        .run(
          idOf(item.id),
          item.html_url ?? null,
          syncedAt,
          syncedAt,
          item.edited_at ?? null,
          syncedAt,
          rawPath,
          contentHash(item),
          courseId,
          String(item.title ?? 'Announcement'),
          html,
          htmlToText(html),
          (item.author as Json | undefined)?.display_name ?? null,
          item.posted_at ?? item.created_at ?? null,
          item.edited_at ?? null,
          item.read_state ?? null,
          json(item.attachments),
          json(item),
        );
    }
  }

  private upsertPlanner(
    items: Json[],
    courseMap: Map<string, number>,
    syncedAt: string,
    rawPath: string,
  ) {
    const { sqlite } = getDb();
    for (const item of items) {
      const plannable = (item.plannable as Json | undefined) ?? {};
      const contextCode = String(
        item.context_type === 'Course'
          ? (item.course_id ?? '')
          : (item.context_code ?? ''),
      );
      const sourceCourseId = contextCode.replace(/^course_/, '');
      const localCourseId = courseMap.get(sourceCourseId) ?? null;
      const sourceId = idOf(item.plannable_id ?? item.id);
      const assignment = sqlite
        .prepare(
          `SELECT id FROM assignments WHERE source_provider='canvas' AND source_id=?`,
        )
        .get(sourceId) as { id: number } | undefined;
      sqlite
        .prepare(
          `INSERT INTO calendar_events (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,raw_snapshot_path,content_hash,course_id,assignment_id,title,description,start_at,end_at,all_day,event_type) VALUES ('canvas',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_provider,source_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,last_synced_at=excluded.last_synced_at,content_hash=excluded.content_hash,course_id=excluded.course_id,assignment_id=excluded.assignment_id,title=excluded.title,description=excluded.description,start_at=excluded.start_at,end_at=excluded.end_at,all_day=excluded.all_day,event_type=excluded.event_type`,
        )
        .run(
          sourceId,
          item.html_url ?? plannable.html_url ?? null,
          syncedAt,
          syncedAt,
          syncedAt,
          rawPath,
          contentHash(item),
          localCourseId,
          assignment?.id ?? null,
          String(plannable.title ?? item.plannable_type ?? 'Calendar item'),
          typeof plannable.description === 'string'
            ? htmlToText(plannable.description)
            : null,
          item.plannable_date ?? plannable.start_at ?? plannable.due_at ?? null,
          plannable.end_at ?? null,
          Number(Boolean(plannable.all_day)),
          item.plannable_type ?? null,
        );
    }
  }

  private recordChange(
    courseId: number,
    entityId: number,
    entityType: string,
    changeType: string,
    summary: string,
    previous: unknown,
    current: unknown,
    at: string,
    syncRunId: number,
  ) {
    getDb()
      .sqlite.prepare(
        `INSERT INTO change_events (course_id,entity_type,entity_id,change_type,summary,previous_json,current_json,detected_at,sync_run_id) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        courseId,
        entityType,
        entityId,
        changeType,
        summary,
        json(previous),
        json(current),
        at,
        syncRunId,
      );
  }

  private inferAssignmentType(item: CanvasAssignment) {
    const name = item.name.toLowerCase();
    if (item.quiz_id || /\bquiz\b/.test(name)) return 'QUIZ';
    if (/\b(exam|midterm|final)\b/.test(name)) return 'EXAM';
    if (/\blab\b/.test(name)) return 'LAB';
    if (/\b(project|milestone)\b/.test(name)) return 'PROJECT';
    if (/\bdiscussion\b/.test(name)) return 'DISCUSSION';
    return 'ASSIGNMENT';
  }
}
