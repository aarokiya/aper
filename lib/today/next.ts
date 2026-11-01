import { getDb, initializeDatabase } from '@/lib/db/client';
import { localDayKey } from '@/lib/study/model';
import { displayCode, getStudyNav } from '@/lib/study/nav';
import { isTaskComplete } from '@/lib/tasks/status';
import { todayStudy } from './study';

/** What the screensaver shows under the clock. */
export type NextUp = {
  deadline: { id: number; title: string; course: string; dueAt: string } | null;
  exam: { code: string; title: string; when: string; days: number } | null;
};

export function getNextUp(): NextUp {
  initializeDatabase();
  const rows = getDb()
    .sqlite.prepare(
      `SELECT a.id, a.title, COALESCE(c.local_alias, c.course_code, c.name) AS course,
              COALESCE(l.personal_due_at, a.due_at) AS dueAt,
              COALESCE(s.provider_state, 'UNSUBMITTED') AS providerState,
              COALESCE(l.workflow_status, 'NOT_STARTED') AS workflowStatus
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       LEFT JOIN submissions s ON s.assignment_id = a.id
       LEFT JOIN local_task_metadata l ON l.assignment_id = a.id
       WHERE c.is_current = 1 AND COALESCE(l.personal_due_at, a.due_at) >= ?
       ORDER BY COALESCE(l.personal_due_at, a.due_at)
       LIMIT 50`,
    )
    .all(new Date().toISOString()) as Array<{
    id: number;
    title: string;
    course: string;
    dueAt: string;
    providerState: string;
    workflowStatus: string;
  }>;
  const open = rows.find(
    (row) => !isTaskComplete(row.providerState, row.workflowStatus),
  );
  const exam = todayStudy(getStudyNav(), localDayKey()).exams[0];
  return {
    deadline: open
      ? {
          id: open.id,
          title: open.title,
          course: displayCode(open.course),
          dueAt: open.dueAt,
        }
      : null,
    exam: exam
      ? { code: exam.code, title: exam.title, when: exam.when, days: exam.days }
      : null,
  };
}
