import { getDb, initializeDatabase } from './client';
import { PROJECT_PRIORITY, isProjectTitle } from '@/lib/tasks/priority';

export type DashboardTask = {
  id: number;
  courseId: number;
  course: string;
  courseName: string;
  title: string;
  dueAt: string | null;
  pointsPossible: number | null;
  providerState: string;
  workflowStatus: string;
  missing: boolean;
  late: boolean;
  excused: boolean;
  priority: number;
  sourceProvider: string;
  sourceUrl: string | null;
  assignmentType: string;
  localTaskId: number;
  personalDueAt: string | null;
  estimatedMinutes: number | null;
  pinned: boolean;
  notes: string;
  locked: number;
  lockExplanation: string | null;
  unlockAt: string | null;
};

export type DashboardData = {
  hasData: boolean;
  now: string;
  tasks: DashboardTask[];
  courses: Array<{
    id: number;
    code: string;
    name: string;
    grade: string | null;
    score: number | null;
    sourceUrl: string | null;
  }>;
  recentlyGraded: Array<{
    id: number;
    courseId: number;
    title: string;
    course: string;
    score: number | null;
    possible: number | null;
    gradedAt: string | null;
  }>;
  announcements: Array<{
    id: number;
    title: string;
    course: string;
    postedAt: string | null;
    message: string;
    sourceUrl: string | null;
  }>;
  changes: Array<{
    id: number;
    courseId: number | null;
    summary: string;
    detectedAt: string;
    course: string | null;
  }>;
  provider: {
    authStatus: string;
    lastSuccessAt: string | null;
    lastAttemptAt: string | null;
    lastError: string | null;
  };
};

export function getDashboardData(): DashboardData {
  initializeDatabase();
  const { sqlite } = getDb();
  const tasks = sqlite
    .prepare(
      `SELECT a.id,a.course_id AS courseId,COALESCE(c.local_alias,c.course_code,c.name) AS course,c.name AS courseName,a.title,a.due_at AS dueAt,a.points_possible AS pointsPossible,COALESCE(s.provider_state,'UNSUBMITTED') AS providerState,COALESCE(l.workflow_status,'NOT_STARTED') AS workflowStatus,COALESCE(s.missing,0) AS missing,COALESCE(s.late,0) AS late,COALESCE(s.excused,0) AS excused,COALESCE(l.priority,0) AS priority,a.source_provider AS sourceProvider,a.source_url AS sourceUrl,COALESCE(a.assignment_type,'ASSIGNMENT') AS assignmentType,l.id AS localTaskId,l.personal_due_at AS personalDueAt,l.estimated_minutes AS estimatedMinutes,COALESCE(l.pinned,0) AS pinned,COALESCE(l.notes,'') AS notes,COALESCE(json_extract(a.provider_json,'$.locked_for_user'),0) AS locked,json_extract(a.provider_json,'$.lock_explanation') AS lockExplanation,a.unlock_at AS unlockAt FROM assignments a JOIN courses c ON c.id=a.course_id LEFT JOIN submissions s ON s.assignment_id=a.id LEFT JOIN local_task_metadata l ON l.assignment_id=a.id WHERE c.is_current=1 AND (a.due_at IS NULL OR a.due_at >= datetime('now','-30 days')) ORDER BY COALESCE(l.pinned,0) DESC,COALESCE(l.priority,0) DESC,CASE WHEN COALESCE(s.provider_state,'UNSUBMITTED')='UNSUBMITTED' THEN 0 ELSE 1 END,a.due_at IS NULL,a.due_at LIMIT 250`,
    )
    .all() as DashboardTask[];
  const courses = sqlite
    .prepare(
      `SELECT id,COALESCE(local_alias,course_code,name) AS code,name,current_grade AS grade,current_score AS score,source_url AS sourceUrl FROM courses WHERE is_current=1 ORDER BY code`,
    )
    .all() as DashboardData['courses'];
  const recentlyGraded = sqlite
    .prepare(
      `SELECT a.id,a.course_id AS courseId,a.title,COALESCE(c.local_alias,c.course_code,c.name) AS course,s.score,a.points_possible AS possible,COALESCE(s.graded_at,s.posted_at) AS gradedAt FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN courses c ON c.id=a.course_id WHERE s.provider_state='GRADED' AND c.is_current=1 ORDER BY COALESCE(s.graded_at,s.posted_at) DESC LIMIT 8`,
    )
    .all() as DashboardData['recentlyGraded'];
  const announcements = sqlite
    .prepare(
      `SELECT n.id,n.title,COALESCE(c.local_alias,c.course_code,c.name) AS course,n.posted_at AS postedAt,COALESCE(n.message_text,'') AS message,n.source_url AS sourceUrl FROM announcements n JOIN courses c ON c.id=n.course_id ORDER BY n.posted_at DESC LIMIT 8`,
    )
    .all() as DashboardData['announcements'];
  const changes = sqlite
    .prepare(
      `SELECT e.id,e.course_id AS courseId,e.summary,e.detected_at AS detectedAt,COALESCE(c.local_alias,c.course_code,c.name) AS course FROM change_events e LEFT JOIN courses c ON c.id=e.course_id WHERE e.course_id IS NULL OR c.is_current=1 ORDER BY e.detected_at DESC LIMIT 8`,
    )
    .all() as DashboardData['changes'];
  const provider = sqlite
    .prepare(
      `SELECT auth_status AS authStatus,last_success_at AS lastSuccessAt,last_attempt_at AS lastAttemptAt,last_error AS lastError FROM providers WHERE key='canvas'`,
    )
    .get() as DashboardData['provider'] | undefined;
  return {
    hasData: courses.length > 0,
    now: new Date().toISOString(),
    tasks,
    courses,
    recentlyGraded,
    announcements,
    changes,
    provider: provider ?? {
      authStatus: 'AUTHENTICATION_REQUIRED',
      lastSuccessAt: null,
      lastAttemptAt: null,
      lastError: null,
    },
  };
}

export function getAssignmentDetail(
  id: number,
): (Record<string, unknown> & { subtasks: unknown[] }) | null {
  initializeDatabase();
  const row = getDb()
    .sqlite.prepare(
      `SELECT a.*,c.name AS course_name,COALESCE(c.local_alias,c.course_code,c.name) AS course_code,s.provider_state,s.submitted_at,s.attempt,s.score,s.grade,s.late,s.missing,s.excused,s.attachments_json,s.comments_json,s.rubric_assessment_json,l.id AS local_task_id,l.workflow_status,l.notes,l.priority,l.personal_due_at,l.estimated_minutes,l.pinned,COALESCE((SELECT SUM(duration_seconds) FROM timer_sessions t WHERE t.local_task_id=l.id),0) AS tracked_seconds,(SELECT started_at FROM timer_sessions t WHERE t.local_task_id=l.id AND t.ended_at IS NULL ORDER BY t.id DESC LIMIT 1) AS active_timer_started_at FROM assignments a JOIN courses c ON c.id=a.course_id LEFT JOIN submissions s ON s.assignment_id=a.id LEFT JOIN local_task_metadata l ON l.assignment_id=a.id WHERE a.id=?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    ...row,
    subtasks: row.local_task_id
      ? getDb()
          .sqlite.prepare(
            `SELECT * FROM subtasks WHERE local_task_id=? ORDER BY position,id`,
          )
          .all(row.local_task_id)
      : [],
  } as Record<string, unknown> & { subtasks: unknown[] };
}

export function getCourseDetail(id: number) {
  initializeDatabase();
  const { sqlite } = getDb();
  const course = sqlite.prepare(`SELECT * FROM courses WHERE id=?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!course) return null;
  return {
    course,
    assignments: sqlite
      .prepare(
        `SELECT a.id,a.title,a.due_at,a.unlock_at,a.points_possible,COALESCE(json_extract(a.provider_json,'$.locked_for_user'),0) AS locked,json_extract(a.provider_json,'$.lock_explanation') AS lock_explanation,COALESCE(s.provider_state,'UNSUBMITTED') AS provider_state,s.score,COALESCE(l.workflow_status,'NOT_STARTED') AS workflow_status FROM assignments a LEFT JOIN submissions s ON s.assignment_id=a.id LEFT JOIN local_task_metadata l ON l.assignment_id=a.id WHERE a.course_id=? ORDER BY a.due_at IS NULL,a.due_at`,
      )
      .all(id),
    modules: sqlite
      .prepare(
        `SELECT m.*,COUNT(mi.id) AS item_count FROM modules m LEFT JOIN module_items mi ON mi.module_id=m.id WHERE m.course_id=? GROUP BY m.id ORDER BY m.position`,
      )
      .all(id),
    announcements: sqlite
      .prepare(
        `SELECT * FROM announcements WHERE course_id=? ORDER BY posted_at DESC LIMIT 20`,
      )
      .all(id),
    files: sqlite
      .prepare(
        `SELECT * FROM course_files WHERE course_id=? ORDER BY display_name LIMIT 200`,
      )
      .all(id),
  };
}

export function getLocalOnlyTasks() {
  initializeDatabase();
  return getDb()
    .sqlite.prepare(
      `SELECT l.id,l.course_id AS courseId,l.title,l.notes,l.workflow_status AS workflowStatus,l.personal_due_at AS personalDueAt,l.priority,l.estimated_minutes AS estimatedMinutes,l.pinned,COALESCE(c.local_alias,c.course_code,c.name) AS course FROM local_task_metadata l LEFT JOIN courses c ON c.id=l.course_id WHERE l.assignment_id IS NULL ORDER BY l.pinned DESC,l.priority DESC,l.workflow_status='DONE_LOCALLY',l.personal_due_at IS NULL,l.personal_due_at,l.created_at DESC`,
    )
    .all() as Array<{
    id: number;
    courseId: number | null;
    title: string;
    notes: string;
    workflowStatus: string;
    personalDueAt: string | null;
    course: string | null;
    priority: number;
    estimatedMinutes: number | null;
    pinned: boolean;
  }>;
}

export function getAllSubtasks() {
  initializeDatabase();
  return getDb()
    .sqlite.prepare(
      `SELECT id,local_task_id AS localTaskId,title,completed,position FROM subtasks ORDER BY local_task_id,position,id`,
    )
    .all() as Array<{
    id: number;
    localTaskId: number;
    title: string;
    completed: boolean;
    position: number;
  }>;
}

export type CalendarItem = {
  id: string;
  assignmentId: number | null;
  localTaskId: number | null;
  courseId: number | null;
  title: string;
  course: string | null;
  startAt: string;
  sourceDueAt: string | null;
  eventType: string;
  sourceUrl: string | null;
  providerState: string | null;
  workflowStatus: string | null;
  priority: number;
  personalTarget: boolean;
};

export function getCalendarItems(): CalendarItem[] {
  initializeDatabase();
  const { sqlite } = getDb();
  const assignmentItems = sqlite
    .prepare(
      `SELECT 'assignment:'||a.id AS id,a.id AS assignmentId,l.id AS localTaskId,a.course_id AS courseId,a.title,COALESCE(c.local_alias,c.course_code,c.name) AS course,COALESCE(l.personal_due_at,a.due_at) AS startAt,a.due_at AS sourceDueAt,COALESCE(a.assignment_type,'ASSIGNMENT') AS eventType,a.source_url AS sourceUrl,COALESCE(s.provider_state,'UNSUBMITTED') AS providerState,COALESCE(l.workflow_status,'NOT_STARTED') AS workflowStatus,COALESCE(l.priority,0) AS priority,l.personal_due_at IS NOT NULL AS personalTarget FROM assignments a JOIN courses c ON c.id=a.course_id LEFT JOIN submissions s ON s.assignment_id=a.id LEFT JOIN local_task_metadata l ON l.assignment_id=a.id WHERE c.is_current=1 AND COALESCE(l.personal_due_at,a.due_at) IS NOT NULL`,
    )
    .all() as CalendarItem[];
  const sourceEvents = sqlite
    .prepare(
      `SELECT 'event:'||e.id AS id,NULL AS assignmentId,NULL AS localTaskId,e.course_id AS courseId,e.title,COALESCE(c.local_alias,c.course_code,c.name) AS course,e.start_at AS startAt,NULL AS sourceDueAt,COALESCE(e.event_type,'EVENT') AS eventType,e.source_url AS sourceUrl,NULL AS providerState,NULL AS workflowStatus,0 AS priority,0 AS personalTarget FROM calendar_events e LEFT JOIN courses c ON c.id=e.course_id WHERE e.start_at IS NOT NULL AND e.assignment_id IS NULL AND (e.course_id IS NULL OR c.is_current=1) AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.course_id=e.course_id AND lower(trim(a.title))=lower(trim(e.title)) AND a.due_at IS NOT NULL AND abs(julianday(a.due_at)-julianday(e.start_at)) < (2.0/1440.0))`,
    )
    .all() as CalendarItem[];
  const localItems = sqlite
    .prepare(
      `SELECT 'local:'||l.id AS id,NULL AS assignmentId,l.id AS localTaskId,l.course_id AS courseId,l.title,COALESCE(c.local_alias,c.course_code,c.name) AS course,l.personal_due_at AS startAt,NULL AS sourceDueAt,'LOCAL_TASK' AS eventType,NULL AS sourceUrl,NULL AS providerState,l.workflow_status AS workflowStatus,l.priority,1 AS personalTarget FROM local_task_metadata l LEFT JOIN courses c ON c.id=l.course_id WHERE l.assignment_id IS NULL AND l.personal_due_at IS NOT NULL`,
    )
    .all() as CalendarItem[];
  return [...assignmentItems, ...sourceEvents, ...localItems].sort((a, b) =>
    a.startAt.localeCompare(b.startAt),
  );
}

/**
 * Raises project-looking tasks to PROJECT_PRIORITY. Only touches rows still at
 * priority 0, so an explicit High/Medium choice is never downgraded.
 *
 * ponytail: a user who clears a project's priority back to 0 gets it re-raised
 * on the next sync; add a `priority_set_by_user` column if that ever bites.
 */
export function applyProjectPriorities() {
  initializeDatabase();
  const { sqlite } = getDb();
  const rows = sqlite
    .prepare(
      `SELECT l.id AS id,COALESCE(a.title,l.title) AS title FROM local_task_metadata l LEFT JOIN assignments a ON a.id=l.assignment_id WHERE l.priority=0`,
    )
    .all() as Array<{ id: number; title: string | null }>;
  const matches = rows.filter((row) => isProjectTitle(row.title));
  if (!matches.length) return 0;
  const at = new Date().toISOString();
  const update = sqlite.prepare(
    `UPDATE local_task_metadata SET priority=?,updated_at=? WHERE id=?`,
  );
  sqlite.transaction(() => {
    for (const row of matches) update.run(PROJECT_PRIORITY, at, row.id);
  })();
  return matches.length;
}

export type NewLocalTask = {
  title: string;
  courseId?: number | null;
  notes?: string;
  personalDueAt?: string | null;
  priority?: number;
  estimatedMinutes?: number | null;
  pinned?: boolean;
};

export function createLocalTask(input: NewLocalTask) {
  initializeDatabase();
  const at = new Date().toISOString();
  return getDb()
    .sqlite.prepare(
      `INSERT INTO local_task_metadata (title,course_id,workflow_status,notes,personal_due_at,priority,estimated_minutes,pinned,created_at,updated_at) VALUES (?,?,'NOT_STARTED',?,?,?,?,?,?,?) RETURNING id`,
    )
    .get(
      input.title,
      input.courseId ?? null,
      input.notes ?? '',
      input.personalDueAt ?? null,
      input.priority ?? 0,
      input.estimatedMinutes ?? null,
      Number(input.pinned ?? false),
      at,
      at,
    ) as { id: number };
}
