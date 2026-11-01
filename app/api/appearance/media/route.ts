import { NextResponse } from 'next/server';
import { mediaMetaSchema } from '@/lib/appearance/schema';
import { listMedia, MediaError, saveMedia } from '@/lib/appearance/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ media: listMedia() });
}

/** Upload a background image or a font (multipart `file`, optional JSON `meta`). */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File))
    return NextResponse.json(
      { error: 'Choose an image or font file.' },
      { status: 400 },
    );
  let meta = {};
  const rawMeta = form?.get('meta');
  if (typeof rawMeta === 'string' && rawMeta) {
    const parsed = mediaMetaSchema.safeParse(JSON.parse(rawMeta));
    if (parsed.success) meta = parsed.data;
  }
  try {
    const item = saveMedia(
      Buffer.from(await file.arrayBuffer()),
      file.name,
      meta,
    );
    return NextResponse.json({ item, media: listMedia() });
  } catch (error) {
    const message =
      error instanceof MediaError ? error.message : 'Upload failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
