import { NextResponse } from 'next/server';
import { rebuildSearchIndex } from '@/lib/search/index';
import { importStudyHub, loadStudyHub, removeStudyHub } from '@/lib/study/hub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const summary = () => {
  const hub = loadStudyHub();
  return hub
    ? {
        title: hub.title,
        importedAt: hub.importedAt,
        source: hub.source,
        courses: hub.courses.map((course) => ({
          id: course.id,
          code: course.code,
          name: course.name,
          weeks: course.weeks.length,
          exams: Object.keys(course.exams).length,
        })),
      }
    : null;
};

export function GET() {
  return NextResponse.json({ hub: summary() });
}

/**
 * Import (or replace) the Study Hub from an uploaded courses JSON or hub .html; progress
 * bundled in it is merged course by course where it is newer (`seeded`).
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File))
    return NextResponse.json(
      { error: 'Choose a Study Hub .html or .json file.' },
      { status: 400 },
    );
  if (file.size > 20_000_000)
    return NextResponse.json(
      { error: 'That file is larger than 20 MB.' },
      { status: 413 },
    );
  let seeded: string[];
  try {
    seeded = importStudyHub(await file.text(), file.name).seeded;
    rebuildSearchIndex();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed.' },
      { status: 400 },
    );
  }
  return NextResponse.json({ hub: summary(), seeded });
}

export function DELETE() {
  removeStudyHub();
  rebuildSearchIndex();
  return NextResponse.json({ hub: null });
}
