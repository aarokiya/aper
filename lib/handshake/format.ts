/**
 * Display formatting for Careers rows. Isomorphic and deterministic: every
 * formatter takes an explicit time zone and `now`, so server-rendered text
 * matches hydration.
 */
import { HANDSHAKE_TIME_ZONE, zonedDay } from '@/lib/handshake/dates';

export const DISPLAY_TIME_ZONE = HANDSHAKE_TIME_ZONE;

const formatters = new Map<string, Intl.DateTimeFormat>();
function format(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
    formatters.set(key, formatter);
  }
  // ICU versions disagree on U+202F before AM/PM; normalize so SSR matches hydration.
  return formatter.format(new Date(iso)).replace(/\s/g, ' ');
}

/** Whole calendar days from `now` to `iso` in `timeZone` (0 = same day). */
export function calendarDaysUntil(
  iso: string,
  now: string,
  timeZone = DISPLAY_TIME_ZONE,
) {
  const a = zonedDay(new Date(now), timeZone);
  const b = zonedDay(new Date(iso), timeZone);
  return Math.round(
    (Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) /
      86_400_000,
  );
}

export function fmtShortDate(iso: string, timeZone = DISPLAY_TIME_ZONE) {
  return format(iso, timeZone, { month: 'short', day: 'numeric' });
}

export function fmtWeekday(iso: string, timeZone = DISPLAY_TIME_ZONE) {
  return format(iso, timeZone, { weekday: 'short' });
}

export function fmtLongDay(iso: string, timeZone = DISPLAY_TIME_ZONE) {
  return format(iso, timeZone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function fmtTime(iso: string, timeZone = DISPLAY_TIME_ZONE) {
  return format(iso, timeZone, { hour: 'numeric', minute: '2-digit' });
}

/** "6:00 – 7:30 PM", "11:00 AM – 1:00 PM", or "6:00 PM – Oct 7, 2:00 PM". */
export function fmtTimeRange(
  startsAt: string,
  endsAt: string | null,
  timeZone = DISPLAY_TIME_ZONE,
) {
  const start = fmtTime(startsAt, timeZone);
  if (!endsAt) return start;
  const end = fmtTime(endsAt, timeZone);
  if (calendarDaysUntil(endsAt, startsAt, timeZone) !== 0)
    return `${start} – ${fmtShortDate(endsAt, timeZone)}, ${end}`;
  const [startClock, startMeridiem] = start.split(' ');
  const [, endMeridiem] = end.split(' ');
  return startMeridiem === endMeridiem
    ? `${startClock} – ${end}`
    : `${start} – ${end}`;
}

/** "Today", "Tomorrow", a weekday within the week, otherwise "Oct 14". */
export function fmtRelativeDay(
  iso: string,
  now: string,
  timeZone = DISPLAY_TIME_ZONE,
  weekday: 'long' | 'short' = 'long',
) {
  const days = calendarDaysUntil(iso, now, timeZone);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 7) return format(iso, timeZone, { weekday });
  return fmtShortDate(iso, timeZone);
}

/** "today at 7:04 AM", "yesterday at 7:02 AM", "Sep 28 at 7:01 AM". */
export function fmtSyncedAt(iso: string, now: string) {
  const days = calendarDaysUntil(iso, now);
  const day =
    days === 0 ? 'today' : days === -1 ? 'yesterday' : fmtShortDate(iso);
  return `${day} at ${fmtTime(iso)}`;
}

const FORMAT_LABEL: Record<string, string> = {
  'in-person': 'In person',
  virtual: 'Virtual',
  hybrid: 'Hybrid',
};

export function formatLabel(value: string | null) {
  return value ? (FORMAT_LABEL[value] ?? value) : null;
}
