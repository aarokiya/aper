/**
 * Date parsing for the event times Handshake renders ("Tuesday, October 6,
 * 2026 6:00 PM – 7:30 PM EDT", "Oct 6 · 6–7:30 PM"). Pure and
 * timezone-explicit: wall times resolve in the zone the text names, else
 * the student's configured zone (APP_TIME_ZONE).
 */
import { APP_TIME_ZONE } from '@/lib/time-zone';

export const HANDSHAKE_TIME_ZONE = APP_TIME_ZONE;

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const ZONE_ABBREVIATIONS: Record<string, string> = {
  EDT: 'America/New_York',
  EST: 'America/New_York',
  ET: 'America/New_York',
  CDT: 'America/Chicago',
  CST: 'America/Chicago',
  CT: 'America/Chicago',
  MDT: 'America/Denver',
  MST: 'America/Denver',
  MT: 'America/Denver',
  PDT: 'America/Los_Angeles',
  PST: 'America/Los_Angeles',
  PT: 'America/Los_Angeles',
  UTC: 'UTC',
  GMT: 'UTC',
};

const MONTH_PATTERN =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const WEEKDAY_PATTERN =
  '(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\\.?,?\\s+';
const DATE_RE = new RegExp(
  `\\b(?:${WEEKDAY_PATTERN})?${MONTH_PATTERN}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`,
  'gi',
);
const RELATIVE_DAY_RE = /\b(today|tomorrow)\b/gi;
const CLOCK_RE =
  /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b\.?|\b(\d{1,2}):(\d{2})\b|\b(noon|midnight)\b/gi;
const ZONE_RE = new RegExp(
  `\\b(${Object.keys(ZONE_ABBREVIATIONS).join('|')})\\b`,
);

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneOffsetMs(timeZone: string, instant: number) {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    });
    offsetFormatters.set(timeZone, formatter);
  }
  const label = formatter
    .formatToParts(new Date(instant))
    .find((part) => part.type === 'timeZoneName')?.value;
  if (!label || label === 'GMT') return 0;
  const match = label.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new Error(`Unable to resolve the ${timeZone} offset`);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === '+' ? minutes : -minutes) * 60_000;
}

/** Converts a wall-clock time in `timeZone` to an ISO instant. */
export function wallTimeToIso(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) {
  const wall = Date.UTC(year, month, day, hour, minute);
  let instant = wall - zoneOffsetMs(timeZone, wall);
  instant = wall - zoneOffsetMs(timeZone, instant);
  return new Date(instant).toISOString();
}

/** The calendar date of `instant` in `timeZone`. */
export function zonedDay(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instant);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month') - 1, day: value('day') };
}

type DayMatch = {
  index: number;
  end: number;
  year: number | null;
  month: number;
  day: number;
};
type ClockMatch = {
  index: number;
  hour: number;
  minute: number;
  meridiem: 'a' | 'p' | null;
};

function findDays(text: string, now: Date, timeZone: string): DayMatch[] {
  const days: DayMatch[] = [];
  for (const match of text.matchAll(DATE_RE)) {
    const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
    const day = Number(match[2]);
    if (month === undefined || day < 1 || day > 31) continue;
    days.push({
      index: match.index,
      end: match.index + match[0].length,
      year: match[3] ? Number(match[3]) : null,
      month,
      day,
    });
  }
  for (const match of text.matchAll(RELATIVE_DAY_RE)) {
    const base = new Date(
      now.getTime() + (match[1].toLowerCase() === 'tomorrow' ? 86_400_000 : 0),
    );
    days.push({
      index: match.index,
      end: match.index + match[0].length,
      ...zonedDay(base, timeZone),
    });
  }
  return days.sort((a, b) => a.index - b.index);
}

function findClocks(text: string, skip: DayMatch[]): ClockMatch[] {
  const clocks: ClockMatch[] = [];
  for (const match of text.matchAll(CLOCK_RE)) {
    if (skip.some((day) => match.index >= day.index && match.index < day.end))
      continue;
    if (match[6]) {
      clocks.push({
        index: match.index,
        hour: match[6].toLowerCase() === 'noon' ? 12 : 0,
        minute: 0,
        meridiem: null,
      });
      continue;
    }
    const hour = Number(match[1] ?? match[4]);
    const minute = Number(match[2] ?? match[5] ?? 0);
    if (hour > 23 || minute > 59) continue;
    const meridiem = match[3] ? (match[3].toLowerCase() as 'a' | 'p') : null;
    if (meridiem && (hour < 1 || hour > 12)) continue;
    clocks.push({ index: match.index, hour, minute, meridiem });
  }
  return clocks;
}

function to24(clock: ClockMatch, meridiem: 'a' | 'p' | null) {
  if (!meridiem) return clock.hour;
  return (clock.hour % 12) + (meridiem === 'p' ? 12 : 0);
}

/** Fills in a missing year: the occurrence nearest to `now`, preferring the future. */
function resolveYear(day: DayMatch, now: Date, timeZone: string) {
  if (day.year !== null) return day.year;
  const current = zonedDay(now, timeZone);
  const candidate = Date.UTC(current.year, day.month, day.day);
  const today = Date.UTC(current.year, current.month, current.day);
  return candidate < today - 60 * 86_400_000 ? current.year + 1 : current.year;
}

function zoneOf(text: string, fallback: string) {
  const abbreviation = text.match(ZONE_RE)?.[1];
  return abbreviation ? ZONE_ABBREVIATIONS[abbreviation] : fallback;
}

export type EventWhen = {
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
  allDay: boolean;
};

/**
 * Parses an event's when-line. Handles a shared date with a time span
 * ("Tuesday, October 6, 2026 6:00 PM – 7:30 PM EDT", "Oct 6 · 6–7:30 PM"),
 * spans across dates ("Oct 6, 2026, 6:00 PM – Oct 7, 2026, 2:00 PM"),
 * date-only spans, and "Today"/"Tomorrow".
 */
export function parseEventWhen(
  value: string | null | undefined,
  options: { now?: Date; timeZone?: string } = {},
): EventWhen {
  const fallbackZone = options.timeZone ?? HANDSHAKE_TIME_ZONE;
  const empty = {
    startsAt: null,
    endsAt: null,
    timeZone: fallbackZone,
    allDay: false,
  };
  if (!value) return empty;
  // "6–7:30 PM": a bare hour directly before a dash takes part in the span.
  const text = value
    .replace(/\s+/g, ' ')
    .replace(
      /(?<![:\d])(\d{1,2})(?=\s*[–—-]\s*\d{1,2}(?::\d{2})?\s*[ap]\.?\s?m\b)/gi,
      '$1:00',
    );
  const now = options.now ?? new Date();
  const timeZone = zoneOf(text, fallbackZone);
  const days = findDays(text, now, timeZone);
  if (!days.length) return { ...empty, timeZone };
  const clocks = findClocks(text, days);
  const first = days[0];
  const second = days.find(
    (day) =>
      day.index > first.index &&
      (day.month !== first.month ||
        day.day !== first.day ||
        (day.year !== null && day.year !== first.year)),
  );
  const startYear = resolveYear(first, now, timeZone);
  const startClock = clocks.find((clock) => clock.index > first.index);
  if (!startClock) {
    const endDay = second ?? first;
    return {
      startsAt: wallTimeToIso(timeZone, startYear, first.month, first.day),
      endsAt: wallTimeToIso(
        timeZone,
        second ? resolveYear(second, now, timeZone) : startYear,
        endDay.month,
        endDay.day,
        23,
        59,
      ),
      timeZone,
      allDay: true,
    };
  }
  const endClock = clocks.find((clock) => clock.index > startClock.index);
  const endMeridiem = endClock?.meridiem ?? null;
  let startMeridiem = startClock.meridiem ?? endMeridiem;
  // "11:00 – 1:00 PM" starts in the morning.
  if (
    !startClock.meridiem &&
    endClock &&
    endMeridiem === 'p' &&
    startClock.hour < 12 &&
    startClock.hour > endClock.hour % 12
  )
    startMeridiem = 'a';
  const startHour = to24(startClock, startMeridiem);
  const startsAt = wallTimeToIso(
    timeZone,
    startYear,
    first.month,
    first.day,
    startHour,
    startClock.minute,
  );
  if (!endClock) return { startsAt, endsAt: null, timeZone, allDay: false };
  const endDay = second && second.index < endClock.index ? second : first;
  let endsAt = wallTimeToIso(
    timeZone,
    endDay === first ? startYear : resolveYear(endDay, now, timeZone),
    endDay.month,
    endDay.day,
    to24(endClock, endMeridiem),
    endClock.minute,
  );
  if (Date.parse(endsAt) <= Date.parse(startsAt) && endDay === first)
    endsAt = new Date(Date.parse(endsAt) + 86_400_000).toISOString();
  return { startsAt, endsAt, timeZone, allDay: false };
}
