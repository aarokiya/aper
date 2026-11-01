import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadStudyHub } from '@/lib/study/hub';
import { localDayKey } from '@/lib/study/model';
import { getClassWork, saveStudyZone } from '@/lib/study/nav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What the rail's class dots need now: the local day and each class's open work. */
export function GET() {
  return NextResponse.json({ today: localDayKey(), work: getClassWork() });
}

const bodySchema = z.object({
  studyZone: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(100),
});

/** Which Study Hub courses sit in the rail's Study zone, in order (local only). */
export async function PUT(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Send studyZone as a list of Study Hub course ids.' },
      { status: 400 },
    );
  if (!loadStudyHub())
    return NextResponse.json(
      { error: 'Import a Study Hub first.' },
      { status: 409 },
    );
  return NextResponse.json({ studyZone: saveStudyZone(parsed.data.studyZone) });
}
