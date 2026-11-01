import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { generateCorpus } from '@/lib/export/corpus';

export const runtime = 'nodejs';

const schema = z.object({
  courseId: z.number().int().positive(),
  title: z.string().trim().min(1).max(500),
  dueAt: z.iso.datetime(),
  assignmentType: z
    .enum(['ASSIGNMENT', 'QUIZ', 'EXAM', 'LAB', 'PROJECT'])
    .default('QUIZ'),
  sourceUrl: z.url().nullable().optional(),
  pointsPossible: z.number().min(0).nullable().optional(),
});

export async function POST(request: NextRequest) {
  initializeDatabase();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Course, title, and a valid due date are required.' },
      { status: 400 },
    );
  const input = parsed.data;
  const { sqlite } = getDb();
  const course = sqlite
    .prepare(`SELECT id FROM courses WHERE id=?`)
    .get(input.courseId);
  if (!course)
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 });

  const at = new Date().toISOString();
  const sourceId = `manual-${crypto.randomUUID()}`;
  const transaction = sqlite.transaction(() => {
    const assignment = sqlite
      .prepare(
        `INSERT INTO assignments (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,course_id,title,points_possible,due_at,due_at_original,assignment_type) VALUES ('gradescope',?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      )
      .get(
        sourceId,
        input.sourceUrl ?? null,
        at,
        at,
        at,
        input.courseId,
        input.title,
        input.pointsPossible ?? null,
        input.dueAt,
        input.dueAt,
        input.assignmentType,
      ) as { id: number };
    sqlite
      .prepare(
        `INSERT INTO local_task_metadata (assignment_id,workflow_status,notes,priority,created_at,updated_at) VALUES (?,'NOT_STARTED','',0,?,?)`,
      )
      .run(assignment.id, at, at);
    return assignment;
  });
  const assignment = transaction();
  generateCorpus();
  return NextResponse.json(
    { id: assignment.id, provider: 'gradescope' },
    { status: 201 },
  );
}
