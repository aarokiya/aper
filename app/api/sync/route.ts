import { NextResponse } from 'next/server';
import { isSyncActive, runAcademicSync } from '@/lib/sync/run';

export const maxDuration = 900;
export async function POST() {
  if (isSyncActive())
    return NextResponse.json({ accepted: true, active: true }, { status: 202 });
  void runAcademicSync().catch((error) =>
    console.error('Manual academic sync failed', error),
  );
  return NextResponse.json({ accepted: true, active: true }, { status: 202 });
}
