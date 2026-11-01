import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCourseDetail } from '@/lib/db/queries';
import { getDb, initializeDatabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const value = getCourseDetail(Number(id));
  return value
    ? NextResponse.json(value)
    : NextResponse.json({ error: 'Course not found' }, { status: 404 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  initializeDatabase();
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = z
    .object({ alias: z.string().trim().max(80).nullable() })
    .safeParse(payload);
  if (!parsed.success)
    return NextResponse.json(
      { error: 'A valid alias is required' },
      { status: 400 },
    );
  const input = parsed.data;
  const result = getDb()
    .sqlite.prepare(`UPDATE courses SET local_alias=? WHERE id=?`)
    .run(input.alias || null, Number(id));
  return result.changes
    ? NextResponse.json({
        ok: true,
        id: Number(id),
        alias: input.alias || null,
      })
    : NextResponse.json({ error: 'Course not found' }, { status: 404 });
}
