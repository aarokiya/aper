import { NextResponse } from 'next/server';
import { isHandshakeSyncActive } from '@/lib/handshake/runtime';
import { runHandshakeSync } from '@/lib/sync/run';

export const runtime = 'nodejs';
export const maxDuration = 900;

/** Starts (or joins) the on-demand Handshake read; poll /api/handshake/status. */
export function POST() {
  if (!isHandshakeSyncActive())
    void runHandshakeSync().catch((error) =>
      console.error('Handshake sync failed', error),
    );
  return NextResponse.json({ accepted: true, active: true }, { status: 202 });
}
