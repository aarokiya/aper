import { getDb, initializeDatabase } from '@/lib/db/client';
import { deleteSetting, readSetting, writeSetting } from '@/lib/db/settings';
import type { SyllabusSource } from '@/lib/grades/calculator';
import { gradePolicySchema, type GradePolicy } from '@/lib/grades/policy';

const key = (courseId: number) => `grade-policy:${courseId}`;

/** The syllabus policy the user adopted for a course, or null (graded by Canvas's groups). */
export function getGradePolicy(courseId: number): GradePolicy | null {
  return readSetting(key(courseId), gradePolicySchema.nullable(), null);
}

export function saveGradePolicy(courseId: number, policy: GradePolicy) {
  writeSetting(key(courseId), policy);
}

export function removeGradePolicy(courseId: number) {
  deleteSetting(key(courseId));
}

/**
 * Syllabi the server can read without an upload: the Canvas syllabus page
 * when it has text, and synced course files named like a syllabus.
 */
export function syllabusSources(courseIds: readonly number[]) {
  const sources = new Map<number, SyllabusSource[]>(
    courseIds.map((id) => [id, []]),
  );
  if (!courseIds.length) return sources;
  initializeDatabase();
  const { sqlite } = getDb();
  const placeholders = courseIds.map(() => '?').join(',');
  for (const row of sqlite
    .prepare(
      `SELECT id FROM courses WHERE id IN (${placeholders}) AND length(trim(COALESCE(syllabus_text,'')))>0`,
    )
    .all(...courseIds) as Array<{ id: number }>)
    sources.get(row.id)?.push({ kind: 'canvas' });
  for (const row of sqlite
    .prepare(
      `SELECT id,course_id AS courseId,display_name AS name FROM course_files
       WHERE course_id IN (${placeholders}) AND local_path IS NOT NULL AND lower(display_name) LIKE '%syllab%'
       ORDER BY display_name`,
    )
    .all(...courseIds) as Array<{
    id: number;
    courseId: number;
    name: string;
  }>)
    sources
      .get(row.courseId)
      ?.push({ kind: 'file', id: row.id, name: row.name });
  return sources;
}
