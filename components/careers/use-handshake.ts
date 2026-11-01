'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { HandshakeStatus } from '@/lib/handshake/queries';

/**
 * One client-side view of Handshake's connection and run state, shared by
 * every Connect/Refresh control on the page so they agree while a sign-in
 * window is open or a read is in progress.
 */
type Phase = 'idle' | 'connecting' | 'syncing' | 'done' | 'error';
type Snapshot = {
  status: HandshakeStatus | null;
  phase: Phase;
  message: string;
  /** bumps when a run finishes so one subscriber refreshes server data */
  version: number;
};

let snapshot: Snapshot = {
  status: null,
  phase: 'idle',
  message: '',
  version: 0,
};
let refreshedVersion = 0;
let polling = false;
const listeners = new Set<() => void>();

function set(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

async function fetchStatus() {
  const response = await fetch('/api/handshake/status', { cache: 'no-store' });
  if (!response.ok)
    throw new Error(`Status request failed (${response.status}).`);
  return (await response.json()) as HandshakeStatus;
}

function finishedMessage(status: HandshakeStatus) {
  const run = status.latestRun;
  if (!run) return 'Handshake is up to date.';
  if (run.status === 'AUTH_REQUIRED')
    return 'Handshake needs you to sign in again.';
  if (run.status === 'FAILED')
    return run.errors[0] ?? status.lastError ?? 'Handshake could not be read.';
  const { events } = status.counts;
  const summary = `${events} upcoming ${events === 1 ? 'event' : 'events'} ready.`;
  return run.status === 'PARTIAL'
    ? `${summary} ${run.errors.length} ${run.errors.length === 1 ? 'item' : 'items'} couldn't be read.`
    : summary;
}

async function poll(startedRunId: number | null) {
  if (polling) return;
  polling = true;
  const deadline = Date.now() + 25 * 60_000;
  try {
    while (Date.now() < deadline) {
      const tick = Promise.withResolvers<void>();
      window.setTimeout(tick.resolve, 1_500);
      await tick.promise;
      const status = await fetchStatus();
      const login = status.login.state;
      if (snapshot.phase === 'connecting') {
        if (login === 'failed') {
          set({
            status,
            phase: 'error',
            message: status.login.message ?? 'Sign-in did not finish.',
          });
          return;
        }
        if (login === 'waiting') {
          set({
            status,
            message: status.login.message ?? 'Waiting for you to sign in…',
          });
          continue;
        }
        set({
          status,
          phase: 'syncing',
          message: 'Signed in. Reading Handshake…',
        });
        continue;
      }
      const newRun = status.latestRun && status.latestRun.id !== startedRunId;
      if (status.syncing || !newRun) {
        set({
          status,
          message: status.latestRun?.progressLabel ?? 'Reading Handshake…',
        });
        continue;
      }
      const failed =
        status.latestRun?.status === 'FAILED' ||
        status.latestRun?.status === 'AUTH_REQUIRED';
      set({
        status,
        phase: failed ? 'error' : 'done',
        message: finishedMessage(status),
        version: snapshot.version + 1,
      });
      return;
    }
    set({
      phase: 'error',
      message: 'Handshake is still working. Check back in a few minutes.',
    });
  } catch (error) {
    set({
      phase: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    polling = false;
  }
}

export async function connectHandshake() {
  if (snapshot.phase === 'connecting' || snapshot.phase === 'syncing') return;
  set({ phase: 'connecting', message: 'Opening a Handshake window…' });
  try {
    const runId = snapshot.status?.latestRun?.id ?? null;
    const response = await fetch('/api/handshake/auth', { method: 'POST' });
    if (!response.ok)
      throw new Error(`Could not open Handshake (${response.status}).`);
    set({
      message:
        'A Handshake window opened. Sign in with your Georgia Tech account there.',
    });
    void poll(runId);
  } catch (error) {
    set({
      phase: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function refreshHandshake() {
  if (snapshot.phase === 'connecting' || snapshot.phase === 'syncing') return;
  set({ phase: 'syncing', message: 'Starting…' });
  try {
    const before = snapshot.status ?? (await fetchStatus());
    const response = await fetch('/api/handshake/sync', { method: 'POST' });
    if (!response.ok)
      throw new Error(`Refresh request failed (${response.status}).`);
    void poll(before.syncing ? null : (before.latestRun?.id ?? null));
  } catch (error) {
    set({
      phase: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => snapshot;

/**
 * `initial` (server-rendered status) seeds the store once; if a sign-in or
 * read is already running, polling resumes so progress shows.
 */
export function useHandshake(initial?: HandshakeStatus | null) {
  const router = useRouter();
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!initial || snapshot.status) return;
    if (initial.login.state === 'waiting') {
      set({
        status: initial,
        phase: 'connecting',
        message: initial.login.message ?? '',
      });
      void poll(initial.latestRun?.id ?? null);
    } else if (initial.syncing) {
      set({
        status: initial,
        phase: 'syncing',
        message: initial.latestRun?.progressLabel ?? 'Reading Handshake…',
      });
      void poll(null);
    } else set({ status: initial });
  }, [initial]);

  useEffect(() => {
    if (current.version > refreshedVersion) {
      refreshedVersion = current.version;
      router.refresh();
    }
  }, [current.version, router]);

  const status = current.status ?? initial ?? null;
  return {
    status,
    phase: current.phase,
    message: current.message,
    busy: current.phase === 'connecting' || current.phase === 'syncing',
    connect: useCallback(() => void connectHandshake(), []),
    refresh: useCallback(() => void refreshHandshake(), []),
  };
}
