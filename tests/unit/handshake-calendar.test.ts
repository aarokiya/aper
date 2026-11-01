import { describe, expect, it } from 'vitest';
import {
  googleCalendarUrl,
  type CalendarEvent,
} from '@/lib/handshake/google-calendar';

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  title: 'Robotics Club Info Night & Demo',
  startsAt: '2026-10-05T22:00:00.000Z',
  endsAt: '2026-10-05T23:30:00.000Z',
  timeZone: 'America/New_York',
  location: 'Student Center, Room 101',
  organizer: 'Example Robotics Club',
  url: 'https://app.joinhandshake.com/stu/events/123',
  description: 'Meet the team and try the robots.',
  ...overrides,
});

const params = (url: string | null) => {
  expect(url).not.toBeNull();
  const parsed = new URL(url!);
  expect(`${parsed.origin}${parsed.pathname}`).toBe(
    'https://calendar.google.com/calendar/render',
  );
  return parsed.searchParams;
};

describe('Google Calendar links for campus events', () => {
  it('fills in the title, UTC times, place, zone, and a way back to Handshake', () => {
    const link = params(googleCalendarUrl(event()));
    expect(link.get('action')).toBe('TEMPLATE');
    expect(link.get('text')).toBe('Robotics Club Info Night & Demo');
    expect(link.get('dates')).toBe('20261005T220000Z/20261005T233000Z');
    expect(link.get('location')).toBe('Student Center, Room 101');
    expect(link.get('ctz')).toBe('America/New_York');
    expect(link.get('details')).toBe(
      'Example Robotics Club\nHandshake: https://app.joinhandshake.com/stu/events/123\n\nMeet the team and try the robots.',
    );
  });

  it('keeps multi-day events whole', () => {
    const link = params(
      googleCalendarUrl(event({ endsAt: '2026-10-20T03:59:00.000Z' })),
    );
    expect(link.get('dates')).toBe('20261005T220000Z/20261020T035900Z');
  });

  it('gives an hour to events without a usable end time', () => {
    for (const endsAt of [null, 'not a date', '2026-10-05T21:00:00.000Z']) {
      expect(params(googleCalendarUrl(event({ endsAt }))).get('dates')).toBe(
        '20261005T220000Z/20261005T230000Z',
      );
    }
  });

  it('offers no link for an event without a start time', () => {
    expect(googleCalendarUrl(event({ startsAt: null }))).toBeNull();
    expect(googleCalendarUrl(event({ startsAt: 'TBD' }))).toBeNull();
  });

  it('leaves out a missing place and organizer', () => {
    const link = params(
      googleCalendarUrl(
        event({ location: null, organizer: null, description: '  ' }),
      ),
    );
    expect(link.has('location')).toBe(false);
    expect(link.get('details')).toBe(
      'Handshake: https://app.joinhandshake.com/stu/events/123',
    );
  });

  it('shortens a long description at a word so the link stays usable', () => {
    const description = Array.from({ length: 400 }, (_, i) => `word${i}`).join(
      ' ',
    );
    const url = googleCalendarUrl(event({ description }))!;
    const details = params(url).get('details')!;
    expect(details.length).toBeLessThanOrEqual(1200);
    expect(details.endsWith('…')).toBe(true);
    expect(details.slice(0, -1)).toMatch(/word\d+$/);
    expect(url.length).toBeLessThan(4000);
  });
});
