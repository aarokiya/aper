import { NextResponse } from 'next/server';
import { authenticateGradescope } from '@/lib/gradescope/auth';
import { runGradescopeSync } from '@/lib/sync/run';

export const maxDuration = 900;

export async function POST() {
  try {
    const auth = await authenticateGradescope();
    const sync = await runGradescopeSync();
    return NextResponse.json({ auth, sync });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
