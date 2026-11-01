/**
 * The student's time zone (IANA name). Canvas/GT deadlines, day buckets,
 * and Handshake event times are computed in this zone on the server.
 * Set `APER_TIME_ZONE` in `.env` to override; defaults to Atlanta time.
 */
const DEFAULT_TIME_ZONE = 'America/New_York';

/** True when `zone` is an IANA time zone this runtime's Intl understands. */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function resolveTimeZone(value: string | undefined) {
  const zone = value?.trim();
  if (!zone) return DEFAULT_TIME_ZONE;
  if (isValidTimeZone(zone)) return zone;
  console.warn(`APER_TIME_ZONE "${zone}" is not a valid IANA time zone; using ${DEFAULT_TIME_ZONE}.`);
  return DEFAULT_TIME_ZONE;
}

export const APP_TIME_ZONE = resolveTimeZone(process.env.APER_TIME_ZONE);
