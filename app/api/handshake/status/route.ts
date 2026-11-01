import { NextResponse } from 'next/server';
import { getHandshakeStatus } from '@/lib/handshake/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getHandshakeStatus());
}
