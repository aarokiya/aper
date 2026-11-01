import { NextResponse } from 'next/server';
import { getDb, initializeDatabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export function GET() {
  initializeDatabase();
  return NextResponse.json(getDb().sqlite.prepare(`SELECT id,source_id AS sourceId,source_url AS sourceUrl,name,course_code AS courseCode,COALESCE(local_alias,short_name,course_code) AS displayCode,term_name AS termName,current_score AS currentScore,current_grade AS currentGrade,last_synced_at AS lastSyncedAt FROM courses ORDER BY is_current DESC,displayCode`).all());
}
