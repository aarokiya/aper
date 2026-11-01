import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { importGradescopeArtifactBytes } from '@/lib/gradescope/provider';

export const runtime = 'nodejs';
const MAX_BYTES = 50 * 1024 * 1024;
const allowedExtensions = new Set([
  '.pdf',
  '.json',
  '.csv',
  '.zip',
  '.txt',
  '.html',
]);

export async function GET() {
  initializeDatabase();
  return NextResponse.json({
    imports: getDb()
      .sqlite.prepare(
        `SELECT i.id,i.filename,i.content_type AS contentType,i.imported_at AS importedAt,i.content_hash AS contentHash,COALESCE(c.local_alias,c.course_code,c.name) AS course,a.title AS assignment FROM imported_artifacts i LEFT JOIN courses c ON c.id=i.course_id LEFT JOIN assignments a ON a.id=i.assignment_id WHERE i.provider='gradescope' ORDER BY i.imported_at DESC LIMIT 100`,
      )
      .all(),
  });
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File))
    return NextResponse.json(
      { error: 'Choose an artifact to import.' },
      { status: 400 },
    );
  if (file.size <= 0 || file.size > MAX_BYTES)
    return NextResponse.json(
      { error: 'Artifact must be between 1 byte and 50 MB.' },
      { status: 400 },
    );
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  if (!allowedExtensions.has(extension))
    return NextResponse.json(
      { error: 'Supported formats: PDF, JSON, CSV, ZIP, TXT, and HTML.' },
      { status: 400 },
    );
  const optionalId = (value: FormDataEntryValue | null) =>
    value ? z.coerce.number().int().positive().parse(value) : undefined;
  const courseId = optionalId(form.get('courseId'));
  const assignmentId = optionalId(form.get('assignmentId'));
  initializeDatabase();
  if (assignmentId) {
    const assignment = getDb()
      .sqlite.prepare(`SELECT course_id FROM assignments WHERE id=?`)
      .get(assignmentId) as { course_id: number } | undefined;
    if (!assignment || (courseId && assignment.course_id !== courseId))
      return NextResponse.json(
        { error: 'Assignment does not belong to the selected course.' },
        { status: 400 },
      );
  }
  const result = importGradescopeArtifactBytes(
    Buffer.from(await file.arrayBuffer()),
    file.name,
    file.type || undefined,
    courseId,
    assignmentId,
  );
  return NextResponse.json(result, { status: 201 });
}
