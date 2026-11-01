/**
 * When the scheduler should read Handshake: once a day, after the morning
 * hour, only for a student who has connected, with a slower retry after
 * failures so a signed-out session isn't probed every tick.
 */
const HOUR_MS = 3_600_000;

export type HandshakeCadenceInput = {
  now: Date;
  hasSession: boolean;
  authStatus: string | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  /** local hour (0–23) before which the daily run waits */
  earliestHour?: number;
};

export function handshakeSyncDue({
  now,
  hasSession,
  authStatus,
  lastSuccessAt,
  lastAttemptAt,
  earliestHour = 7,
}: HandshakeCadenceInput) {
  if (!hasSession) return false;
  if (now.getHours() < earliestHour) return false;
  const since = (iso: string | null) =>
    iso ? now.getTime() - Date.parse(iso) : Number.POSITIVE_INFINITY;
  if (since(lastSuccessAt) < 20 * HOUR_MS) return false;
  const retryAfter =
    authStatus === 'AUTHENTICATION_REQUIRED' ? 20 * HOUR_MS : 2 * HOUR_MS;
  return since(lastAttemptAt) >= retryAfter;
}
