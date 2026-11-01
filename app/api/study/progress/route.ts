import { NextResponse } from 'next/server';
import { loadStudyHub } from '@/lib/study/hub';
import {
  getAllStudyProgress,
  replaceStudyProgress,
} from '@/lib/study/progress';
import {
  buildProgressFile,
  ProgressFileError,
  progressFileName,
  readProgressFile,
} from '@/lib/study/progress-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const hubIds = () => loadStudyHub()?.courses.map((course) => course.id) ?? [];

/**
 * **Export progress**: every Study Hub course's progress as the hub's
 * progress file (`gt-study-hub-progress`), which the standalone hub and
 * **Import progress** both read. `?course=<id>` names the course it opens to.
 */
export function GET(request: Request) {
  const ids = hubIds();
  if (!ids.length)
    return NextResponse.json(
      { error: 'Import a Study Hub first.' },
      { status: 404 },
    );
  const course = new URL(request.url).searchParams.get('course');
  const now = new Date();
  const file = buildProgressFile(getAllStudyProgress(ids), {
    course: course && ids.includes(course) ? course : null,
    now,
  });
  return new NextResponse(`${JSON.stringify(file, null, 1)}\n`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${progressFileName(now)}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * **Import progress**: replaces each course the file holds (the hub's rule),
 * stamped now so it is the newest copy. Body: the progress file's JSON.
 */
export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 20_000_000)
    return NextResponse.json(
      { error: 'That file is larger than 20 MB.' },
      { status: 413 },
    );
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'That file is not valid JSON.' },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      courses: replaceStudyProgress(readProgressFile(value, hubIds())),
    });
  } catch (error) {
    if (error instanceof ProgressFileError)
      return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
}
