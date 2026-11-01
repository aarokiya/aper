import { NextRequest, NextResponse } from 'next/server';
import { getDb, initializeDatabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export function GET(request: NextRequest) {
  initializeDatabase();
  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get('days') ?? 14), 1), 365);
  return NextResponse.json(getDb().sqlite.prepare(`SELECT a.id,a.title,a.due_at AS dueAt,a.points_possible AS pointsPossible,COALESCE(c.local_alias,c.course_code,c.name) AS course,COALESCE(s.provider_state,'UNSUBMITTED') AS providerState,COALESCE(l.workflow_status,'NOT_STARTED') AS workflowStatus,a.source_url AS sourceUrl FROM assignments a JOIN courses c ON c.id=a.course_id LEFT JOIN submissions s ON s.assignment_id=a.id LEFT JOIN local_task_metadata l ON l.assignment_id=a.id WHERE c.is_current=1 AND a.due_at BETWEEN datetime('now') AND datetime('now',?) ORDER BY a.due_at`).all(`+${days} days`));
}
