import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setHandshakeFlags } from '@/lib/handshake/store';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({ dismissed: z.boolean() });

/** Local-only dismiss/restore for a campus event; Handshake itself is never changed. */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId < 1)
    return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join(' ') },
      { status: 400 },
    );
  if (!setHandshakeFlags(numericId, parsed.data))
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
