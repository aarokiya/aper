import { NextResponse } from 'next/server';
import { handshakeLoginState } from '@/lib/handshake/runtime';
import { startHandshakeLogin } from '@/lib/sync/run';

export const runtime = 'nodejs';

/**
 * Opens the visible Handshake sign-in window on this computer and returns at once;
 * the student completes Georgia Tech SSO/Duo there. Poll /api/handshake/status
 * for `login.state`; a successful sign-in starts a Handshake read.
 */
export function POST() {
  const started = startHandshakeLogin();
  return NextResponse.json(
    { accepted: started, login: handshakeLoginState() },
    { status: 202 },
  );
}
