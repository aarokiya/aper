import { NextResponse } from 'next/server';
import { authenticateCanvas } from '@/lib/canvas/auth';
import { runCanvasSync } from '@/lib/sync/run';

export const maxDuration = 900;
export async function POST() {
  try { const auth = await authenticateCanvas(); const sync = await runCanvasSync(); return NextResponse.json({ auth, sync }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
