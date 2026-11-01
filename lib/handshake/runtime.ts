/**
 * In-process Handshake run state, shared by every route bundle via
 * globalThis. Deliberately free of Playwright imports so pages can read it.
 */
import type { SyncResult } from '@/lib/sync/provider';

export type HandshakeLoginState = {
  state: 'idle' | 'waiting' | 'connected' | 'failed';
  message: string | null;
  at: string | null;
};

type HandshakeRuntime = {
  sync: Promise<SyncResult> | null;
  login: HandshakeLoginState;
};

export const handshakeRuntime = ((
  globalThis as typeof globalThis & { __aperHandshake?: HandshakeRuntime }
).__aperHandshake ??= {
  sync: null,
  login: { state: 'idle', message: null, at: null },
});

export function isHandshakeSyncActive() {
  return Boolean(handshakeRuntime.sync);
}

export function handshakeLoginState(): HandshakeLoginState {
  return { ...handshakeRuntime.login };
}
