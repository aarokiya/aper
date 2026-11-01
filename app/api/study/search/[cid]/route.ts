import { NextResponse } from 'next/server';
import { getStudyCourse } from '@/lib/study/hub';
import { weekMatches } from '@/lib/study/model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Week numbers whose titles, sections, and lecture notes contain every query token. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const { cid } = await params;
  const course = getStudyCourse(cid);
  if (!course)
    return NextResponse.json(
      { error: 'Unknown study course.' },
      { status: 404 },
    );
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return NextResponse.json({
    weeks: course.weeks
      .filter((week) => weekMatches(week, query))
      .map((week) => week.n),
  });
}
