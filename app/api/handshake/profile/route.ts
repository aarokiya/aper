import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCareerProfile, saveCareerProfile } from '@/lib/handshake/profile';
import { rescoreHandshake } from '@/lib/handshake/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getCareerProfile());
}

/** Saves the local career profile and re-ranks cached campus events. */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Profile must be JSON.' },
      { status: 400 },
    );
  }
  try {
    const profile = saveCareerProfile(body);
    rescoreHandshake();
    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues.map((issue) => issue.message).join(' ') },
        { status: 400 },
      );
    throw error;
  }
}
