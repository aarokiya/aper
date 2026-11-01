import { NextResponse } from 'next/server';
import { getNextUp } from '@/lib/today/next';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getNextUp());
}
