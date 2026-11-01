import { NextResponse } from 'next/server';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { gradePolicySchema } from '@/lib/grades/policy';
import { removeGradePolicy, saveGradePolicy } from '@/lib/grades/policy-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ courseId: string }> };

function courseExists(courseId: number) {
  initializeDatabase();
  return Boolean(
    Number.isInteger(courseId) &&
    getDb().sqlite.prepare(`SELECT 1 FROM courses WHERE id=?`).get(courseId),
  );
}

/** Adopts syllabus grading rules for a course (local only). */
export async function PUT(request: Request, { params }: Context) {
  const courseId = Number((await params).courseId);
  if (!courseExists(courseId))
    return NextResponse.json({ error: 'Unknown course.' }, { status: 404 });
  const parsed = gradePolicySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      {
        error: parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      },
      { status: 400 },
    );
  const policy = { ...parsed.data, savedAt: new Date().toISOString() };
  saveGradePolicy(courseId, policy);
  return NextResponse.json({ policy });
}

/** Goes back to grading the course by its Canvas assignment groups. */
export async function DELETE(_: Request, { params }: Context) {
  const courseId = Number((await params).courseId);
  if (!courseExists(courseId))
    return NextResponse.json({ error: 'Unknown course.' }, { status: 404 });
  removeGradePolicy(courseId);
  return NextResponse.json({ ok: true });
}
