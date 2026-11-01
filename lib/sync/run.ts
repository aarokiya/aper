import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { browserProfileDir } from '@/lib/canvas/auth';
import { CanvasProvider } from '@/lib/canvas/provider';
import { applyProjectPriorities } from '@/lib/db/queries';
import { generateCorpus } from '@/lib/export/corpus';
import { GradescopeProvider } from '@/lib/gradescope/provider';
import { authenticateHandshake } from '@/lib/handshake/auth';
import { HandshakeProvider } from '@/lib/handshake/provider';
import { handshakeRuntime } from '@/lib/handshake/runtime';
import type { AuthStatus, SyncResult } from '@/lib/sync/provider';

let activeSync: Promise<SyncResult[]> | null = null;

export function runCanvasSync() {
  return runProviders([new CanvasProvider()]).then((results) => results[0]);
}

export function runGradescopeSync() {
  return runProviders([new GradescopeProvider()]).then((results) => results[0]);
}

export function runAcademicSync() {
  return runProviders([new CanvasProvider(), new GradescopeProvider()]);
}

function runProviders(
  providers: Array<CanvasProvider | GradescopeProvider>,
): Promise<SyncResult[]> {
  if (activeSync) return activeSync;
  activeSync = withBrowserProfile('academic sync', async () => {
    const results: SyncResult[] = [];
    for (const provider of providers) results.push(await provider.sync());
    if (
      results.some(
        (result) => result.status === 'SUCCESS' || result.status === 'PARTIAL',
      )
    ) {
      applyProjectPriorities();
      generateCorpus();
    }
    return results;
  }).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

export function isSyncActive() {
  return Boolean(activeSync);
}

/*
 * The persistent Chrome profile can only be open in one process at a time,
 * and the scheduler, the web server, and CLI scripts are separate processes.
 * A lock file next to the profile serializes them, so the daily Handshake
 * read waits for an hourly Canvas sync instead of failing it (and vice versa).
 */
const lockPath = path.join(browserProfileDir, '.aper-browser.lock');
const LOCK_STALE_MS = 45 * 60_000;

function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function tryAcquireLock(owner: string) {
  fs.mkdirSync(browserProfileDir, { recursive: true });
  try {
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, owner, at: new Date().toISOString() }),
      { flag: 'wx', mode: 0o600 },
    );
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  try {
    const held = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as {
      pid: number;
      at: string;
    };
    const stale =
      !processAlive(held.pid) || Date.now() - Date.parse(held.at) > LOCK_STALE_MS;
    if (!stale) return false;
  } catch {
    // Unreadable: either mid-write by its holder (young) or torn by a crash (old).
    const age = Date.now() - (fs.statSync(lockPath, { throwIfNoEntry: false })?.mtimeMs ?? 0);
    if (age < 5_000) return false;
  }
  fs.rmSync(lockPath, { force: true });
  return false;
}

export async function withBrowserProfile<T>(
  owner: string,
  task: () => Promise<T>,
  waitMs = 20 * 60_000,
): Promise<T> {
  const deadline = Date.now() + waitMs;
  while (!tryAcquireLock(owner)) {
    if (Date.now() > deadline)
      throw new Error(
        `The browser profile stayed busy for ${Math.round(waitMs / 60_000)} minutes; ${owner} did not start.`,
      );
    await sleep(1_000);
  }
  try {
    return await task();
  } finally {
    fs.rmSync(lockPath, { force: true });
  }
}

/*
 * Handshake runs separately from the academic sync: once a day from the
 * scheduler and on demand from Careers/Settings.
 */
export function runHandshakeSync(): Promise<SyncResult> {
  handshakeRuntime.sync ??= withBrowserProfile('Handshake sync', () =>
    new HandshakeProvider().sync(),
  ).finally(() => {
    handshakeRuntime.sync = null;
  });
  return handshakeRuntime.sync;
}

/**
 * Opens the visible Handshake sign-in window (non-blocking) and reads
 * Handshake once the student finishes. Returns false if one is already open.
 */
export function startHandshakeLogin() {
  if (handshakeRuntime.login.state === 'waiting') return false;
  handshakeRuntime.login = {
    state: 'waiting',
    message: 'Sign in with your Georgia Tech account in the Handshake window.',
    at: new Date().toISOString(),
  };
  void withBrowserProfile('Handshake sign-in', () => authenticateHandshake())
    .then((status: AuthStatus) => {
      handshakeRuntime.login = {
        state: 'connected',
        message: 'Handshake is connected.',
        at: status.checkedAt,
      };
      return runHandshakeSync();
    })
    .catch((error: unknown) => {
      handshakeRuntime.login = {
        state: 'failed',
        message: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      };
    });
  return true;
}
