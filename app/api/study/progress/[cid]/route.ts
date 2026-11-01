import { NextResponse } from 'next/server';
import { getStudyCourse } from '@/lib/study/hub';
import {
  getStudyProgress,
  resetStudyProgress,
  saveStudyProgress,
} from '@/lib/study/progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ cid: string }> };

// Local-only study progress (answers, ratings, practice exams, AI grades).
export async function GET(_: Request, { params }: Context) {
  const { cid } = await params;
  if (!getStudyCourse(cid))
    return NextResponse.json(
      { error: 'Unknown study course.' },
      { status: 404 },
    );
  return NextResponse.json(getStudyProgress(cid));
}

export async function PUT(request: Request, { params }: Context) {
  const { cid } = await params;
  if (!getStudyCourse(cid))
    return NextResponse.json(
      { error: 'Unknown study course.' },
      { status: 404 },
    );
  const body = await request.text();
  if (body.length > 4_000_000)
    return NextResponse.json(
      { error: 'Progress payload is too large.' },
      { status: 413 },
    );
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Progress must be JSON.' },
      { status: 400 },
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return NextResponse.json(
      { error: 'Progress must be an object.' },
      { status: 400 },
    );
  return NextResponse.json(saveStudyProgress(cid, value));
}

export async function DELETE(_: Request, { params }: Context) {
  const { cid } = await params;
  if (!getStudyCourse(cid))
    return NextResponse.json(
      { error: 'Unknown study course.' },
      { status: 404 },
    );
  resetStudyProgress(cid);
  return NextResponse.json({ ok: true });
}
