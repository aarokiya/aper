import { NextResponse } from 'next/server';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { isHandshakeSyncActive } from '@/lib/handshake/runtime';
import { isSyncActive } from '@/lib/sync/run';

export const dynamic = 'force-dynamic';

/**
 * Status of the academic "Sync now" (Canvas + Gradescope). Handshake runs on
 * its own daily cadence and is summarized under `handshake` only, so its runs
 * and auth state never stand in for the academic sync's progress or result.
 */
export function GET() {
  initializeDatabase();
  const { sqlite } = getDb();
  return NextResponse.json({
    active: isSyncActive(),
    providers: sqlite
      .prepare(
        `SELECT key,display_name AS displayName,auth_status AS authStatus,last_attempt_at AS lastAttemptAt,last_success_at AS lastSuccessAt,last_error AS lastError FROM providers WHERE key IN ('canvas','gradescope') ORDER BY CASE key WHEN 'canvas' THEN 0 ELSE 1 END`,
      )
      .all(),
    latestRun:
      sqlite
        .prepare(
          `SELECT id,provider,started_at AS startedAt,finished_at AS finishedAt,status,entities_seen AS entitiesSeen,entities_updated AS entitiesUpdated,progress_label AS progressLabel,errors_json AS errors,warnings_json AS warnings,timings_json AS timings FROM sync_runs WHERE provider IN ('canvas','gradescope') ORDER BY id DESC LIMIT 1`,
        )
        .get() ?? null,
    handshake: {
      active: isHandshakeSyncActive(),
      ...((sqlite
        .prepare(
          `SELECT auth_status AS authStatus,last_success_at AS lastSuccessAt FROM providers WHERE key='handshake'`,
        )
        .get() as { authStatus: string; lastSuccessAt: string | null } | undefined) ?? {
        authStatus: 'NOT_CONNECTED',
        lastSuccessAt: null,
      }),
    },
  });
}
