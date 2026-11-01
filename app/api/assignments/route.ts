import { NextRequest, NextResponse } from 'next/server';
import { getDb, initializeDatabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export function GET(request: NextRequest) {
  initializeDatabase();
  const courseId = request.nextUrl.searchParams.get('courseId');
  const state = request.nextUrl.searchParams.get('state');
  const predicates = ['1=1']; const values: unknown[] = [];
  if (courseId) { predicates.push('a.course_id=?'); values.push(Number(courseId)); }
  if (state) { predicates.push(`COALESCE(s.provider_state,'UNSUBMITTED')=?`); values.push(state); }
  const rows = getDb().sqlite.prepare(`SELECT a.id,a.source_id AS sourceId,a.source_url AS sourceUrl,a.course_id AS courseId,COALESCE(c.local_alias,c.course_code,c.name) AS course,a.title,a.description_text AS description,a.points_possible AS pointsPossible,a.due_at AS dueAt,a.unlock_at AS unlockAt,a.lock_at AS lockAt,a.assignment_type AS assignmentType,COALESCE(s.provider_state,'UNSUBMITTED') AS providerState,s.score,s.grade,s.submitted_at AS submittedAt,COALESCE(l.workflow_status,'NOT_STARTED') AS workflowStatus,l.priority,l.personal_due_at AS personalDueAt FROM assignments a JOIN courses c ON c.id=a.course_id LEFT JOIN submissions s ON s.assignment_id=a.id LEFT JOIN local_task_metadata l ON l.assignment_id=a.id WHERE ${predicates.join(' AND ')} ORDER BY a.due_at IS NULL,a.due_at`).all(...values);
  return NextResponse.json(rows);
}
