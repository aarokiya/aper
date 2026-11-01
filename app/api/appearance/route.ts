import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  getAppearance,
  listMedia,
  saveAppearance,
} from '@/lib/appearance/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ appearance: getAppearance(), media: listMedia() });
}

export async function PUT(request: Request) {
  try {
    return NextResponse.json({
      appearance: saveAppearance(await request.json()),
    });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? (error.issues[0]?.message ?? 'Invalid appearance.')
        : 'Invalid appearance.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
