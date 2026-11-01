/**
 * "Add to Google Calendar" for campus events: Google's public event-template
 * link, which opens Google Calendar's new-event page already filled in. It
 * runs in whatever Google account the browser is signed in to; _aper never
 * signs in to Google or touches the calendar itself. Pure and isomorphic.
 */

export type CalendarEvent = {
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  /** IANA zone the event is held in, e.g. "America/New_York" */
  timeZone: string;
  location: string | null;
  organizer: string | null;
  /** the event's Handshake page */
  url: string;
  description: string;
};

const HOUR = 60 * 60_000;

/** Keeps the whole link comfortably inside URL length limits. */
const MAX_DETAILS = 1200;

/** Google's compact UTC form: 2026-10-02T23:30:00.000Z → 20261002T233000Z. */
const stamp = (time: number) =>
  new Date(time).toISOString().replace(/[-:]|\.\d{3}/g, '');

/** Cuts at a word boundary and marks the cut. */
function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * The Google Calendar link for an event, or null when it has no start time to
 * put on a calendar. Without a usable end time the event lasts an hour.
 */
export function googleCalendarUrl(event: CalendarEvent): string | null {
  const start = event.startsAt ? Date.parse(event.startsAt) : Number.NaN;
  if (Number.isNaN(start)) return null;
  const end = event.endsAt ? Date.parse(event.endsAt) : Number.NaN;
  const intro = [event.organizer, `Handshake: ${event.url}`]
    .filter(Boolean)
    .join('\n');
  const description = event.description.trim();
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(start)}/${stamp(end > start ? end : start + HOUR)}`,
    details: description
      ? `${intro}\n\n${clip(description, MAX_DETAILS - intro.length - 2)}`
      : intro,
  });
  if (event.location) params.set('location', event.location);
  if (event.timeZone) params.set('ctz', event.timeZone);
  return `https://calendar.google.com/calendar/render?${params}`;
}
