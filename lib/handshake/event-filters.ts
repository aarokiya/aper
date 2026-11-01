/**
 * Filters for the Careers campus-events list. Pure and isomorphic: the page
 * parses the URL into {@link EventFilters} on the server, the view keeps them
 * in state and mirrors them back into the URL, and both filter with the same
 * predicates. Day windows resolve in each event's own time zone.
 */
import { wallTimeToIso, zonedDay } from '@/lib/handshake/dates';

export const EVENT_FORMATS = ['any', 'in-person', 'virtual'] as const;
export const EVENT_HOSTS = ['any', 'school', 'employers'] as const;
export const EVENT_WINDOWS = ['any', 'today', '7d', '14d'] as const;
export const EVENT_SORTS = ['date', 'match'] as const;

export type EventFormatFilter = (typeof EVENT_FORMATS)[number];
export type EventHostFilter = (typeof EVENT_HOSTS)[number];
export type EventWindow = (typeof EVENT_WINDOWS)[number];
export type EventSort = (typeof EVENT_SORTS)[number];

export type EventFilters = {
  /** words that must all appear in title, organizer, location, kind, or description */
  query: string;
  /** kinds to keep (any of them); empty keeps every kind */
  kinds: string[];
  format: EventFormatFilter;
  host: EventHostFilter;
  when: EventWindow;
  /** show dismissed events instead of the rest */
  dismissed: boolean;
  sort: EventSort;
};

export const DEFAULT_EVENT_FILTERS: EventFilters = {
  query: '',
  kinds: [],
  format: 'any',
  host: 'any',
  when: 'any',
  dismissed: false,
  sort: 'date',
};

/** The event fields filtering reads; `CareerEventDetail` satisfies it. */
export type FilterableEvent = {
  title: string;
  organizer: string | null;
  location: string | null;
  category: string | null;
  description: string;
  format: 'in-person' | 'virtual' | 'hybrid' | null;
  postedBySchool: boolean;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
  score: number;
  dismissed: boolean;
};

/** Kind label used for grouping: missing and "Other" categories share "Other". */
export const OTHER_KIND = 'Other';
export const kindOf = (event: Pick<FilterableEvent, 'category'>) =>
  event.category || OTHER_KIND;

const WINDOW_DAYS: Record<Exclude<EventWindow, 'any'>, number> = {
  today: 1,
  '7d': 7,
  '14d': 14,
};

/** Search params, as Next passes them to a page or as URLSearchParams. */
type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function readAll(params: Params, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);
  const value = params[key];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

const readOne = (params: Params, key: string) => readAll(params, key)[0] ?? '';

function oneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Reads filters from the URL; unknown or malformed values fall back to defaults. */
export function parseEventFilters(params: Params): EventFilters {
  return {
    query: readOne(params, 'q').trim(),
    kinds: [
      ...new Set(
        readAll(params, 'kind')
          .map((kind) => kind.trim())
          .filter(Boolean),
      ),
    ],
    format: oneOf(readOne(params, 'format'), EVENT_FORMATS, 'any'),
    host: oneOf(readOne(params, 'host'), EVENT_HOSTS, 'any'),
    when: oneOf(readOne(params, 'when'), EVENT_WINDOWS, 'any'),
    dismissed: readOne(params, 'dismissed') === '1',
    sort: oneOf(readOne(params, 'sort'), EVENT_SORTS, 'date'),
  };
}

/** Every query key {@link eventFiltersToParams} may write. */
export const EVENT_FILTER_KEYS = [
  'q',
  'kind',
  'format',
  'host',
  'when',
  'dismissed',
  'sort',
] as const;

/** The non-default filters as URL params, the inverse of {@link parseEventFilters}. */
export function eventFiltersToParams(filters: EventFilters) {
  const params = new URLSearchParams();
  const query = filters.query.trim();
  if (query) params.set('q', query);
  for (const kind of filters.kinds) params.append('kind', kind);
  if (filters.format !== 'any') params.set('format', filters.format);
  if (filters.host !== 'any') params.set('host', filters.host);
  if (filters.when !== 'any') params.set('when', filters.when);
  if (filters.dismissed) params.set('dismissed', '1');
  if (filters.sort !== 'date') params.set('sort', filters.sort);
  return params;
}

/** True when any filter (not the sort) narrows the list. */
export function isFiltered(filters: EventFilters) {
  return (
    Boolean(filters.query.trim()) ||
    filters.kinds.length > 0 ||
    filters.format !== 'any' ||
    filters.host !== 'any' ||
    filters.when !== 'any' ||
    filters.dismissed
  );
}

/** Clears every filter, keeping the chosen sort. */
export const clearEventFilters = (filters: EventFilters): EventFilters => ({
  ...DEFAULT_EVENT_FILTERS,
  sort: filters.sort,
});

export function matchesQuery(event: FilterableEvent, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [
    event.title,
    event.organizer,
    event.location,
    kindOf(event),
    event.description,
  ]
    .join(' \n ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** Hybrid events count as both in person and virtual; unknown format as neither. */
export function matchesFormat(
  event: Pick<FilterableEvent, 'format'>,
  format: EventFormatFilter,
) {
  if (format === 'any') return true;
  return event.format === format || event.format === 'hybrid';
}

export function matchesHost(
  event: Pick<FilterableEvent, 'postedBySchool'>,
  host: EventHostFilter,
) {
  if (host === 'any') return true;
  return host === 'school' ? event.postedBySchool : !event.postedBySchool;
}

/**
 * Whether the event takes place in the first `days` calendar days starting
 * today, in the event's time zone. An event that already began and is still
 * running ("happening now") counts as today. Undated events never match.
 */
export function matchesWindow(
  event: Pick<FilterableEvent, 'startsAt' | 'endsAt' | 'timeZone'>,
  when: EventWindow,
  now: Date,
) {
  if (when === 'any') return true;
  if (!event.startsAt) return false;
  const today = zonedDay(now, event.timeZone);
  const windowStart = Date.parse(
    wallTimeToIso(event.timeZone, today.year, today.month, today.day),
  );
  const windowEnd = Date.parse(
    wallTimeToIso(
      event.timeZone,
      today.year,
      today.month,
      today.day + WINDOW_DAYS[when],
    ),
  );
  const start = Date.parse(event.startsAt);
  const end = event.endsAt ? Date.parse(event.endsAt) : start;
  return start < windowEnd && end >= windowStart;
}

/** Every predicate except the kind chips, so chip counts show what a click adds. */
function matchesAllButKind(
  event: FilterableEvent,
  filters: EventFilters,
  now: Date,
) {
  return (
    event.dismissed === filters.dismissed &&
    matchesFormat(event, filters.format) &&
    matchesHost(event, filters.host) &&
    matchesWindow(event, filters.when, now) &&
    matchesQuery(event, filters.query)
  );
}

export function matchesEvent(
  event: FilterableEvent,
  filters: EventFilters,
  now: Date,
) {
  return (
    (!filters.kinds.length || filters.kinds.includes(kindOf(event))) &&
    matchesAllButKind(event, filters, now)
  );
}

/**
 * The visible events: filtered, then by date (input order, which is date
 * order) or best match first.
 */
export function filterEvents<T extends FilterableEvent>(
  events: T[],
  filters: EventFilters,
  now: Date,
): T[] {
  const shown = events.filter((event) => matchesEvent(event, filters, now));
  return filters.sort === 'match'
    ? shown.sort((a, b) => b.score - a.score)
    : shown;
}

/**
 * Kind chips: every kind present in `events`, alphabetical with "Other" last,
 * each counted against the other active filters. Selected kinds stay listed
 * even if no event has them any more, so they can be turned off.
 */
export function kindOptions(
  events: FilterableEvent[],
  filters: EventFilters,
  now: Date,
) {
  const counts = new Map<string, number>(
    filters.kinds.map((kind) => [kind, 0]),
  );
  for (const event of events) {
    const kind = kindOf(event);
    const hit = matchesAllButKind(event, filters, now) ? 1 : 0;
    counts.set(kind, (counts.get(kind) ?? 0) + hit);
  }
  return [...counts]
    .map(([kind, count]) => ({ kind, count }))
    .sort(
      (a, b) =>
        Number(a.kind === OTHER_KIND) - Number(b.kind === OTHER_KIND) ||
        a.kind.localeCompare(b.kind),
    );
}

/** The pool the result count is "of": dismissed events, or the rest. */
export const eventPool = <T extends FilterableEvent>(
  events: T[],
  filters: Pick<EventFilters, 'dismissed'>,
) => events.filter((event) => event.dismissed === filters.dismissed);
