import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getStudyPrefs, saveStudyPrefs } from '@/lib/study/prefs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ prefs: getStudyPrefs() });
}

export async function PUT(request: Request) {
  try {
    return NextResponse.json({ prefs: saveStudyPrefs(await request.json()) });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? (error.issues[0]?.message ?? 'Invalid study preferences.')
        : 'Invalid study preferences.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
