import { APP_TIME_ZONE } from '@/lib/time-zone';

export function normalizeTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid timestamp: ${value}`);
  return parsed.toISOString();
}

export function applicableDeadline(input: { dueAt?: string | null; allDates?: Array<{ due_at?: string | null; base?: boolean; title?: string; set_type?: string }> | null }) {
  const explicit = input.allDates?.find((item) => !item.base && item.due_at);
  const selected = explicit?.due_at ?? input.dueAt ?? null;
  return { dueAt: normalizeTimestamp(selected), sourceTimestamp: selected, overrideApplied: Boolean(explicit) };
}

export function dateBucket(value: string | null, now = new Date(), timeZone = APP_TIME_ZONE) {
  if (!value) return 'NO_DATE' as const;
  const due = new Date(value);
  const localDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const today = localDate(now);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const key = localDate(due);
  if (due.getTime() < now.getTime()) return 'OVERDUE' as const;
  if (key === today) return 'TODAY' as const;
  if (key === localDate(tomorrow)) return 'TOMORROW' as const;
  return 'UPCOMING' as const;
}

const zoneOffsetMs = (timeZone: string, date: Date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return asUtc - date.getTime();
};

/** Turns a wall-clock string ("2026-09-07T15:00") in `timeZone` into a UTC ISO instant. */
export function zonedTimeToUtcIso(local: string, timeZone = APP_TIME_ZONE) {
  const naive = Date.parse(`${local.length === 16 ? `${local}:00` : local}Z`);
  if (Number.isNaN(naive)) return null;
  // Two passes: the offset must be read at the resulting instant, not at the
  // naive one, or an hour is lost on each side of a DST boundary.
  const first = new Date(naive - zoneOffsetMs(timeZone, new Date(naive)));
  const second = new Date(naive - zoneOffsetMs(timeZone, first));
  return second.toISOString();
}
