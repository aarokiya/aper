import { getDb, initializeDatabase } from '@/lib/db/client';
import { courseGrade, cutoffsFor, letterFor } from '@/lib/grades/calculator';
import { getCalculatorState, loadGradeCourses } from '@/lib/grades/load';
import { isTaskComplete } from '@/lib/tasks/status';

/**
 * Canvas (and Gradescope-merged) facts shown beside Study Hub content: the
 * work due next, each class's current grade, and its latest announcement.
 * Server-only; every value is preformatted so pages render plain strings.
 */

export type DueItem = {
  id: number;
  courseId: number;
  course: string;
  title: string;
  dueAt: string;
  /** "Today, 11:59 PM", "Tomorrow, 5:00 PM", "Fri Oct 9, 11:59 PM" */
  due: string;
  /** whole local days from today (0 = today) */
  days: number;
};

export type ClassGrade = { percent: number | null; letter: string | null };

export type LatestAnnouncement = {
  title: string;
  postedAt: string | null;
  posted: string | null;
  url: string | null;
};

const DAY_MS = 864e5;

function midnight(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dueLabel(date: Date, now: Date) {
  const days = Math.round(
    (midnight(date).getTime() - midnight(now).getTime()) / DAY_MS,
  );
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const day =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : date
            .toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
            .replace(',', '');
  return { days, due: `${day}, ${time}` };
}

/** The next open (unsubmitted, not done locally) assignments in these classes, soonest first. */
export function openAssignments(
  courseIds: readonly number[],
  limit: number,
  now = new Date(),
): DueItem[] {
  if (!courseIds.length) return [];
  initializeDatabase();
  const rows = getDb()
    .sqlite.prepare(
      `SELECT a.id,a.course_id AS courseId,COALESCE(c.local_alias,c.course_code,c.name) AS course,a.title,a.due_at AS dueAt,
              COALESCE(s.provider_state,'UNSUBMITTED') AS providerState,COALESCE(l.workflow_status,'NOT_STARTED') AS workflowStatus
       FROM assignments a JOIN courses c ON c.id=a.course_id
       LEFT JOIN submissions s ON s.assignment_id=a.id
       LEFT JOIN local_task_metadata l ON l.assignment_id=a.id
       WHERE a.course_id IN (${courseIds.map(() => '?').join(',')}) AND a.due_at IS NOT NULL AND datetime(a.due_at) >= datetime(?)
       ORDER BY datetime(a.due_at), a.id LIMIT 200`,
    )
    .all(...courseIds, now.toISOString()) as Array<{
    id: number;
    courseId: number;
    course: string;
    title: string;
    dueAt: string;
    providerState: string;
    workflowStatus: string;
  }>;
  return rows
    .filter((row) => !isTaskComplete(row.providerState, row.workflowStatus))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      courseId: row.courseId,
      course: row.course,
      title: row.title,
      dueAt: row.dueAt,
      ...dueLabel(new Date(row.dueAt), now),
    }));
}

/**
 * Current grade per Canvas course id, as the grade calculator computes it
 * (merged Canvas + Gradescope, by the syllabus when the user adopted it) with
 * its letter; Canvas's own score and letter when the calculator has none.
 */
export function classGrades(): Map<number, ClassGrade> {
  initializeDatabase();
  const state = getCalculatorState();
  const canvas = new Map(
    (
      getDb()
        .sqlite.prepare(
          `SELECT id,current_grade AS letter,current_score AS score FROM courses WHERE is_current=1`,
        )
        .all() as Array<{
        id: number;
        letter: string | null;
        score: number | null;
      }>
    ).map((row) => [row.id, row]),
  );
  const out = new Map<number, ClassGrade>();
  for (const course of loadGradeCourses()) {
    const percent = courseGrade(course, 'current', state);
    const fallback = canvas.get(course.id);
    out.set(
      course.id,
      percent == null
        ? {
            percent: fallback?.score ?? null,
            letter: fallback?.letter ?? null,
          }
        : { percent, letter: letterFor(percent, cutoffsFor(course, state)) },
    );
  }
  return out;
}

/** "93.4%, A", "A", or null when Canvas has no grade yet. */
export function gradeText(grade: ClassGrade | undefined) {
  if (!grade) return null;
  const percent =
    grade.percent == null
      ? null
      : `${(Math.round(grade.percent * 10) / 10).toString()}%`;
  return [percent, grade.letter].filter(Boolean).join(', ') || null;
}

export function latestAnnouncement(
  courseId: number,
): LatestAnnouncement | null {
  initializeDatabase();
  const row = getDb()
    .sqlite.prepare(
      `SELECT title,posted_at AS postedAt,source_url AS url FROM announcements WHERE course_id=? ORDER BY posted_at IS NULL, posted_at DESC LIMIT 1`,
    )
    .get(courseId) as
    | { title: string; postedAt: string | null; url: string | null }
    | undefined;
  if (!row) return null;
  return {
    ...row,
    posted: row.postedAt
      ? new Date(row.postedAt)
          .toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
          .replace(',', '')
      : null,
  };
}
