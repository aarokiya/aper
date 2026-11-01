import { describe, expect, it } from 'vitest';
import {
  clearEventFilters,
  DEFAULT_EVENT_FILTERS,
  eventFiltersToParams,
  eventPool,
  filterEvents,
  isFiltered,
  kindOptions,
  matchesWindow,
  parseEventFilters,
  type EventFilters,
  type FilterableEvent,
} from '@/lib/handshake/event-filters';

const event = (
  id: string,
  overrides: Partial<FilterableEvent> = {},
): FilterableEvent & { id: string } => ({
  id,
  title: `Event ${id}`,
  organizer: null,
  location: null,
  category: 'Other',
  description: '',
  format: 'in-person',
  postedBySchool: false,
  startsAt: '2026-10-05T22:00:00.000Z',
  endsAt: null,
  timeZone: 'America/New_York',
  score: 50,
  dismissed: false,
  ...overrides,
});

const filters = (overrides: Partial<EventFilters>): EventFilters => ({
  ...DEFAULT_EVENT_FILTERS,
  ...overrides,
});

const ids = (list: Array<{ id: string }>) => list.map((item) => item.id);

describe('event date windows (America/New_York days)', () => {
  // Thu Oct 1, 11:30 PM in Atlanta; already Oct 2 in UTC.
  const lateNight = new Date('2026-10-02T03:30:00.000Z');

  it('ends "today" at local midnight, not UTC midnight', () => {
    const at = (startsAt: string) => event('x', { startsAt });
    expect(
      matchesWindow(at('2026-10-02T03:45:00.000Z'), 'today', lateNight),
    ).toBe(true);
    expect(
      matchesWindow(at('2026-10-02T04:00:00.000Z'), 'today', lateNight),
    ).toBe(false);
  });

  it('counts a multi-day event already under way as today, but not one that ended yesterday', () => {
    const now = new Date('2026-10-01T16:00:00.000Z');
    const running = event('running', {
      startsAt: '2026-09-28T13:00:00.000Z',
      endsAt: '2026-10-09T21:00:00.000Z',
    });
    const ended = event('ended', {
      startsAt: '2026-09-29T13:00:00.000Z',
      endsAt: '2026-09-30T21:00:00.000Z',
    });
    expect(matchesWindow(running, 'today', now)).toBe(true);
    expect(matchesWindow(ended, 'today', now)).toBe(false);
  });

  it('spans seven calendar days starting today for "next 7 days"', () => {
    const now = new Date('2026-10-01T16:00:00.000Z'); // Thu Oct 1, noon
    // Wed Oct 7, 11:30 PM local is in; Thu Oct 8 at midnight local is out.
    expect(
      matchesWindow(
        event('in', { startsAt: '2026-10-08T03:30:00.000Z' }),
        '7d',
        now,
      ),
    ).toBe(true);
    expect(
      matchesWindow(
        event('out', { startsAt: '2026-10-08T04:00:00.000Z' }),
        '7d',
        now,
      ),
    ).toBe(false);
  });

  it('keeps local day boundaries across the end of daylight saving', () => {
    const now = new Date('2026-10-20T16:00:00.000Z'); // Tue Oct 20, noon EDT
    // Mon Nov 2, 11:30 PM EST: within 14 days, though past 14 × 24 h from midnight EDT.
    expect(
      matchesWindow(
        event('in', { startsAt: '2026-11-03T04:30:00.000Z' }),
        '14d',
        now,
      ),
    ).toBe(true);
    expect(
      matchesWindow(
        event('out', { startsAt: '2026-11-03T05:00:00.000Z' }),
        '14d',
        now,
      ),
    ).toBe(false);
  });

  it('never puts an undated event in a window', () => {
    const now = new Date('2026-10-01T16:00:00.000Z');
    const undated = event('tbd', { startsAt: null });
    expect(matchesWindow(undated, 'today', now)).toBe(false);
    expect(matchesWindow(undated, 'any', now)).toBe(true);
  });
});

describe('event filters', () => {
  const now = new Date('2026-10-01T16:00:00.000Z');

  it('counts hybrid events as both in person and virtual, and unknown formats as neither', () => {
    const list = [
      event('room', { format: 'in-person' }),
      event('zoom', { format: 'virtual' }),
      event('both', { format: 'hybrid' }),
      event('unknown', { format: null }),
    ];
    expect(
      ids(filterEvents(list, filters({ format: 'in-person' }), now)),
    ).toEqual(['room', 'both']);
    expect(
      ids(filterEvents(list, filters({ format: 'virtual' }), now)),
    ).toEqual(['zoom', 'both']);
    expect(ids(filterEvents(list, filters({}), now))).toHaveLength(4);
  });

  it('separates Georgia Tech events from employer events', () => {
    const list = [
      event('fair', { postedBySchool: true }),
      event('talk', { postedBySchool: false }),
    ];
    expect(ids(filterEvents(list, filters({ host: 'school' }), now))).toEqual([
      'fair',
    ]);
    expect(
      ids(filterEvents(list, filters({ host: 'employers' }), now)),
    ).toEqual(['talk']);
  });

  it('keeps any selected kind, with uncategorized events under Other', () => {
    const list = [
      event('fair', { category: 'Career fair' }),
      event('talk', { category: 'Tech talk' }),
      event('none', { category: null }),
      event('other', { category: 'Other' }),
    ];
    expect(
      ids(
        filterEvents(list, filters({ kinds: ['Career fair', 'Other'] }), now),
      ),
    ).toEqual(['fair', 'none', 'other']);
  });

  it('hides dismissed events unless asked, and then shows only them', () => {
    const list = [event('plain'), event('gone', { dismissed: true })];
    expect(ids(filterEvents(list, filters({}), now))).toEqual(['plain']);
    expect(ids(filterEvents(list, filters({ dismissed: true }), now))).toEqual([
      'gone',
    ]);
    expect(ids(eventPool(list, filters({})))).toEqual(['plain']);
  });

  it('searches every word across title, organizer, location, kind, and description', () => {
    const list = [
      event('a', {
        title: 'Robotics night',
        organizer: 'RoboJackets',
        location: 'Klaus 1116',
      }),
      event('b', { category: 'Workshop', description: 'Bring a resume.' }),
    ];
    expect(
      ids(filterEvents(list, filters({ query: 'robojackets klaus' }), now)),
    ).toEqual(['a']);
    expect(
      ids(filterEvents(list, filters({ query: 'workshop RESUME' }), now)),
    ).toEqual(['b']);
  });

  it('keeps date order unless sorting by best match', () => {
    const list = [event('early', { score: 10 }), event('late', { score: 90 })];
    expect(ids(filterEvents(list, filters({}), now))).toEqual([
      'early',
      'late',
    ]);
    expect(ids(filterEvents(list, filters({ sort: 'match' }), now))).toEqual([
      'late',
      'early',
    ]);
  });

  it('counts each kind against the other filters, with Other last and selected kinds kept', () => {
    const list = [
      event('fair', { category: 'Career fair', postedBySchool: true }),
      event('talk', { category: 'Tech talk' }),
      event('none', { category: null, postedBySchool: true }),
      event('gone', { category: 'Workshop', dismissed: true }),
    ];
    expect(
      kindOptions(list, filters({ host: 'school', kinds: ['Panel'] }), now),
    ).toEqual([
      { kind: 'Career fair', count: 1 },
      { kind: 'Panel', count: 0 },
      { kind: 'Tech talk', count: 0 },
      { kind: 'Workshop', count: 0 },
      { kind: 'Other', count: 1 },
    ]);
  });
});

describe('event filters in the URL', () => {
  it('round-trips every filter and writes nothing for the defaults', () => {
    const chosen = filters({
      query: 'career fair',
      kinds: ['Career fair', 'Info session'],
      format: 'virtual',
      host: 'school',
      when: '7d',
      dismissed: true,
      sort: 'match',
    });
    const params = eventFiltersToParams(chosen);
    expect(params.toString()).toBe(
      'q=career+fair&kind=Career+fair&kind=Info+session&format=virtual&host=school&when=7d&dismissed=1&sort=match',
    );
    expect(parseEventFilters(params)).toEqual(chosen);
    expect(eventFiltersToParams(DEFAULT_EVENT_FILTERS).toString()).toBe('');
  });

  it('reads Next search params, ignoring the retired tab and saved filters and bad values', () => {
    expect(
      parseEventFilters({
        tab: 'events',
        kind: 'Workshop',
        format: 'remote',
        when: 'month',
        host: ['employers', 'school'],
        saved: '1',
      }),
    ).toEqual(filters({ kinds: ['Workshop'], host: 'employers' }));
  });

  it('treats only real filters as filtering and clears them without touching the sort', () => {
    expect(isFiltered(filters({ sort: 'match' }))).toBe(false);
    expect(isFiltered(filters({ when: 'today' }))).toBe(true);
    expect(
      clearEventFilters(filters({ kinds: ['Panel'], sort: 'match' })),
    ).toEqual(filters({ sort: 'match' }));
  });
});
