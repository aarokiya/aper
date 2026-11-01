import fs from 'node:fs';
import { NextResponse } from 'next/server';
import {
  deleteMedia,
  getAppearance,
  listMedia,
  mediaFile,
} from '@/lib/appearance/store';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  const { id } = await params;
  const file = mediaFile(id);
  if (!file) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return new Response(fs.readFileSync(file.target), {
    headers: {
      'Content-Type': file.item.type,
      // ids are never reused, so the bytes behind one are immutable
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function DELETE(_: Request, { params }: Context) {
  const { id } = await params;
  deleteMedia(id);
  return NextResponse.json({ media: listMedia(), appearance: getAppearance() });
}
