import { NextResponse } from 'next/server';
import { getDb, initializeDatabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export function GET() {
  initializeDatabase();
  return NextResponse.json(getDb().sqlite.prepare(`SELECT c.id,c.name,COALESCE(c.local_alias,c.course_code,c.name) AS course,c.current_score AS currentScore,c.current_grade AS currentGrade,c.final_score AS finalScore,(SELECT json_group_array(json_object('id',g.id,'name',g.name,'weight',g.group_weight,'rules',json(g.rules_json))) FROM assignment_groups g WHERE g.course_id=c.id) AS groups FROM courses c WHERE c.is_current=1 ORDER BY course`).all());
}
