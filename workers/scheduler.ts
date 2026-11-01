import fs from 'node:fs';
import path from 'node:path';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { hasHandshakeSession } from '@/lib/handshake/auth';
import { handshakeSyncDue } from '@/lib/handshake/cadence';
import { isHandshakeSyncActive } from '@/lib/handshake/runtime';
import { runAcademicSync, runHandshakeSync } from '@/lib/sync/run';

const frequencyMs = Number(process.env.SYNC_INTERVAL_MS ?? 60 * 60 * 1000);
/** How often to ask whether today's Handshake read is due. */
const handshakeCheckMs = 15 * 60 * 1000;
const handshakeHour = Number(process.env.HANDSHAKE_DAILY_HOUR ?? 7);
const logFile = path.join(process.cwd(), 'logs', 'sync.log');
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const log = (value: unknown) =>
  fs.appendFileSync(
    logFile,
    `${new Date().toISOString()} ${typeof value === 'string' ? value : JSON.stringify(value)}\n`,
  );
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const run = async () => {
  try {
    log({ event: 'scheduled_sync_started' });
    const results = await runAcademicSync();
    log({ event: 'scheduled_sync_finished', results });
  } catch (error) {
    log({ event: 'scheduled_sync_failed', error: errorText(error) });
  }
};

/** Handshake: once a day after HANDSHAKE_DAILY_HOUR, independent of the hourly sync. */
const runHandshakeIfDue = async () => {
  if (isHandshakeSyncActive()) return;
  try {
    initializeDatabase();
    const provider = getDb()
      .sqlite.prepare(
        `SELECT auth_status AS authStatus,last_success_at AS lastSuccessAt,last_attempt_at AS lastAttemptAt FROM providers WHERE key='handshake'`,
      )
      .get() as
      | { authStatus: string; lastSuccessAt: string | null; lastAttemptAt: string | null }
      | undefined;
    const due = handshakeSyncDue({
      now: new Date(),
      hasSession: hasHandshakeSession(),
      authStatus: provider?.authStatus ?? null,
      lastSuccessAt: provider?.lastSuccessAt ?? null,
      lastAttemptAt: provider?.lastAttemptAt ?? null,
      earliestHour: handshakeHour,
    });
    if (!due) return;
    log({ event: 'scheduled_handshake_started' });
    const result = await runHandshakeSync();
    log({ event: 'scheduled_handshake_finished', result });
  } catch (error) {
    log({ event: 'scheduled_handshake_failed', error: errorText(error) });
  }
};

log({ event: 'scheduler_started', frequencyMs, handshakeHour });
const timer = setInterval(() => void run(), frequencyMs);
const handshakeTimer = setInterval(
  () => void runHandshakeIfDue(),
  handshakeCheckMs,
);
void runHandshakeIfDue();
process.on('SIGTERM', () => {
  clearInterval(timer);
  clearInterval(handshakeTimer);
  log({ event: 'scheduler_stopped' });
  process.exit(0);
});
await new Promise(() => undefined);
