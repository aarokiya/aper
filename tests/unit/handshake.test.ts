import { describe, expect, it } from 'vitest';
import { parseEventWhen } from '@/lib/handshake/dates';
import {
  categorizeEvent,
  parseEventDetail,
  parseListing,
} from '@/lib/handshake/parse';

const NOW = new Date('2026-10-01T16:00:00.000Z'); // Thu Oct 1, 12:00 PM in Atlanta

const NAV = `<nav><a href="/explore">Home</a><a href="/job-search">Jobs</a><a href="/stu/events?collection=ALL">Events</a><a href="/inbox">Inbox</a></nav>`;

const TECH_TALK = `<!doctype html><html><body>${NAV}
<main>
  <h1>Datadog Tech Talk: Building Observability at Scale</h1>
  <a href="/e/55555" aria-label="Datadog"><img alt="Datadog logo" src="https://cdn.example/datadog.png"></a>
  <span class="style__tag___3x">Tech talk</span>
  <div>Tuesday, October 6, 2026 6:00 PM – 7:30 PM EDT</div>
  <div>In person</div>
  <div>Klaus Advanced Computing Building, Room 1116, Atlanta, GA 30332</div>
  <button>RSVP</button>
  <div>134 students are going</div>
  <h2>About this event</h2>
  <p>Engineers from Datadog walk through how they ingest trillions of data points a day.</p>
  <p>Pizza provided. Open to all majors and class years.</p>
</main></body></html>`;

const CAREER_FAIR = `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Fall 2026 All-Majors Career Fair","startDate":"2026-10-14T10:00:00-04:00","endDate":"2026-10-14T15:00:00-04:00","eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode","location":{"@type":"Place","name":"McCamish Pavilion","address":{"@type":"PostalAddress","streetAddress":"965 Fowler St NW","addressLocality":"Atlanta","addressRegion":"GA"}},"organizer":{"@type":"Organization","name":"Georgia Tech Career Center"},"image":"https://cdn.example/fair.jpg","description":"<p>Meet more than 200 employers.</p><p>Bring your BuzzCard.</p>"}</script>
</head><body>${NAV}<main><h1>Fall 2026 All-Majors Career Fair</h1><div>Posted by Georgia Institute of Technology</div><button>Cancel RSVP</button></main></body></html>`;

const VIRTUAL_SESSION = `<!doctype html><html><body>${NAV}
<main>
  <h1>Seekr: Virtual Info Session for Interns</h1>
  <a href="/employers/777">Seekr</a>
  <p><time datetime="2026-10-08T21:00:00Z">Thu, Oct 8</time> <time datetime="2026-10-08T22:00:00Z">5:00 – 6:00 PM</time></p>
  <div>Virtual event</div>
  <div>Join on Zoom</div>
  <button>Join waitlist</button>
</main></body></html>`;

describe('Handshake dates', () => {
  it('parses event spans with a shared date, a shared meridiem, and an explicit zone', () => {
    expect(
      parseEventWhen('Tuesday, October 6, 2026 6:00 PM – 7:30 PM EDT'),
    ).toEqual({
      startsAt: '2026-10-06T22:00:00.000Z',
      endsAt: '2026-10-06T23:30:00.000Z',
      timeZone: 'America/New_York',
      allDay: false,
    });
    expect(
      parseEventWhen('Thu, Oct 8 · 6–7:30 PM', { now: NOW }),
    ).toMatchObject({
      startsAt: '2026-10-08T22:00:00.000Z',
      endsAt: '2026-10-08T23:30:00.000Z',
    });
    expect(
      parseEventWhen('Wednesday, October 7, 2026 11:00 – 1:00 PM'),
    ).toMatchObject({
      startsAt: '2026-10-07T15:00:00.000Z',
      endsAt: '2026-10-07T17:00:00.000Z',
    });
  });

  it('parses spans across dates, other zones, relative days, and all-day ranges', () => {
    expect(
      parseEventWhen('Oct 6, 2026, 6:00 PM – Oct 7, 2026, 2:00 PM CDT'),
    ).toEqual({
      startsAt: '2026-10-06T23:00:00.000Z',
      endsAt: '2026-10-07T19:00:00.000Z',
      timeZone: 'America/Chicago',
      allDay: false,
    });
    expect(parseEventWhen('Tomorrow at 9:00 AM', { now: NOW })).toMatchObject({
      startsAt: '2026-10-02T13:00:00.000Z',
      endsAt: null,
    });
    expect(
      parseEventWhen('October 20 – October 21, 2026', { now: NOW }),
    ).toEqual({
      startsAt: '2026-10-20T04:00:00.000Z',
      endsAt: '2026-10-22T03:59:00.000Z',
      timeZone: 'America/New_York',
      allDay: true,
    });
    expect(parseEventWhen('Date to be announced').startsAt).toBeNull();
  });
});

describe('Handshake listings', () => {
  it('collects event ids in Handshake order, skipping nav links and duplicates', () => {
    const events = parseListing(
      `${NAV}<a href="/stu/events/301?ref=list">Google Engineering Panel</a><a href="/stu/events/302">GITMAD Weekly Meeting</a><a href="/stu/events/301">Google Engineering Panel</a><a href="/events/303">Tesla Info Session</a>`,
    );
    expect(
      events.map((item) => [item.sourceId, item.sourceUrl, item.rank]),
    ).toEqual([
      ['301', 'https://app.joinhandshake.com/stu/events/301', 1],
      ['302', 'https://app.joinhandshake.com/stu/events/302', 2],
      ['303', 'https://app.joinhandshake.com/stu/events/303', 3],
    ]);
    expect(events[0].cardText).toBe('Google Engineering Panel');
  });

  it('returns nothing when the page has no event links', () => {
    expect(parseListing(`${NAV}<main>Sign in to continue</main>`)).toEqual([]);
  });
});

describe('Handshake event details', () => {
  const at = (id: string) => ({
    sourceId: id,
    sourceUrl: `https://app.joinhandshake.com/stu/events/${id}`,
  });

  it('reads an employer tech talk from rendered text', () => {
    expect(parseEventDetail(TECH_TALK, at('301'), { now: NOW })).toMatchObject({
      title: 'Datadog Tech Talk: Building Observability at Scale',
      organizerName: 'Datadog',
      employerSourceId: '55555',
      category: 'Tech talk',
      eventType: 'Tech talk',
      startsAt: '2026-10-06T22:00:00.000Z',
      endsAt: '2026-10-06T23:30:00.000Z',
      timeZone: 'America/New_York',
      location:
        'Klaus Advanced Computing Building, Room 1116, Atlanta, GA 30332',
      eventFormat: 'in-person',
      isVirtual: false,
      rsvpStatus: 'Open',
      postedBySchool: false,
      descriptionText:
        'Engineers from Datadog walk through how they ingest trillions of data points a day.\nPizza provided. Open to all majors and class years.',
    });
  });

  it('prefers JSON-LD Event and recognizes school-posted fairs and registrations', () => {
    expect(
      parseEventDetail(CAREER_FAIR, at('302'), { now: NOW }),
    ).toMatchObject({
      title: 'Fall 2026 All-Majors Career Fair',
      organizerName: 'Georgia Tech Career Center',
      category: 'Career fair',
      startsAt: '2026-10-14T14:00:00.000Z',
      endsAt: '2026-10-14T19:00:00.000Z',
      location: 'McCamish Pavilion, 965 Fowler St NW, Atlanta, GA',
      eventFormat: 'in-person',
      rsvpStatus: 'Registered',
      postedBySchool: true,
      imageUrl: 'https://cdn.example/fair.jpg',
      descriptionText: 'Meet more than 200 employers.\nBring your BuzzCard.',
    });
  });

  it('reads time elements, virtual format, and waitlists', () => {
    expect(
      parseEventDetail(VIRTUAL_SESSION, at('303'), { now: NOW }),
    ).toMatchObject({
      organizerName: 'Seekr',
      employerSourceId: '777',
      category: 'Info session',
      startsAt: '2026-10-08T21:00:00.000Z',
      endsAt: '2026-10-08T22:00:00.000Z',
      eventFormat: 'virtual',
      isVirtual: true,
      rsvpStatus: 'Waitlist open',
    });
  });

  it('reads the live layout: an "Events" page heading, date-only time elements, and the header block', () => {
    // Mirrors app.joinhandshake.com/stu/events/:id as rendered in Oct 2026.
    const page = `<!doctype html><html><head><title>Robotics Club Weekly Meetings | Handshake</title></head><body>${NAV}
<main>
  <h1>Events</h1>
  <a href="/stu/events">← back</a>
  <div>Georgia Institute of Technology - College of Computing</div>
  <h1>Robotics Club Weekly Meetings</h1>
  <div><time datetime="10/02/2026">Fri, Oct 2 · 5 PM</time>-<time datetime="10/02/2026">7 PM EDT</time></div>
  <div>In-person</div>
  <div>801 Atlantic Drive Northwest, Atlanta, Georgia 30332, United States</div>
  <div>College of Computing Building (CCB) 016</div>
  <div><span>General</span></div>
  <button>Register</button>
  <h2>What you’ll get out of it</h2>
  <div><p>Build robots with other first-years.</p><button>Show more</button></div>
  <h2>Similar events</h2>
  <div>Georgia Institute of Technology - College of Computing</div>
  <h2>Chess Club Weekly Meetings</h2>
  <div>Virtual∙<time datetime="10/05/2026">Mon, Oct 5 · 6:30 PM EDT</time></div>
</main></body></html>`;
    expect(parseEventDetail(page, at('304'), { now: NOW })).toMatchObject({
      title: 'Robotics Club Weekly Meetings',
      organizerName: 'Georgia Institute of Technology - College of Computing',
      category: 'Club meeting',
      eventType: 'General',
      startsAt: '2026-10-02T21:00:00.000Z',
      endsAt: '2026-10-02T23:00:00.000Z',
      location:
        'College of Computing Building (CCB) 016 · 801 Atlantic Drive Northwest, Atlanta, Georgia 30332',
      eventFormat: 'in-person',
      isVirtual: false,
      postedBySchool: true,
      descriptionText: 'Build robots with other first-years.',
    });
  });

  it('categorizes the kinds of events a first-year sees', () => {
    expect(categorizeEvent('Google Engineering Panel: Life as a SWE')).toBe(
      'Panel',
    );
    expect(categorizeEvent('An Evening with American Express')).toBe(
      'Networking',
    );
    expect(categorizeEvent('J.P. Morgan Investment Banking Kick-Off')).toBe(
      'Networking',
    );
    expect(categorizeEvent('GITMAD Weekly Meeting')).toBe('Club meeting');
    expect(categorizeEvent('Deloitte Resume Review Workshop')).toBe('Workshop');
    expect(categorizeEvent('Tesla Information Session')).toBe('Info session');
    expect(categorizeEvent('Study break')).toBe('Other');
  });
});

describe('Handshake organizer logos', () => {
  // Mirrors the asset paths Handshake renders: employer logos are signed imgix
  // URLs under institutions/<employer id>, school logos sit under schools/<id>.
  const CDN = 'https://s3.amazonaws.com/handshake.production/app/public/assets';
  const IMGIX = 'https://joinhandshake-production.imgix.net/app/public/assets';
  const employerLogo = (id: number) =>
    `${IMGIX}/institutions/${id}/original/hs-emp-logo-data.?ixlib=rb-4.1.1&amp;w=150&amp;h=150&amp;fit=crop&amp;v=17&amp;s=ab12cd${id}`;
  const decoded = (id: number) =>
    `${IMGIX}/institutions/${id}/original/hs-emp-logo-data.?ixlib=rb-4.1.1&w=150&h=150&fit=crop&v=17&s=ab12cd${id}`;
  const SCHOOL_LOGO = `${CDN}/schools/40/original/hs-school-logo-data.?1648`;
  const SCHOOL = 'Example State University - College of Computing';
  const noise = (eventId: string) => `
  <img src="${CDN}/events/${eventId}/original/data.?1788" alt="${SCHOOL}">
  <img src="${CDN}/user_profile_photos/9/original/me.jpg" alt="Attendee profile picture">
  <img src="https://cdn.example/static_assets/default_user_3.png" alt="Ada Lovelace">
  <img src="${CDN}/schools/40/original/hs-school-branding-image-data.?1652" alt="Banner" aria-hidden="true">
  <h2>Similar events</h2>
  <a href="/stu/events/9001"><img alt="Northwind logo" src="${employerLogo(3001)}" class="rosetta-entity-avatar"> Northwind Mixer</a>
  <a href="/stu/events/9002"><img alt="Featured employer ${SCHOOL}" src="${CDN}/schools/40/small/hs-school-logo-data.?1648"> Club Night</a>`;
  const when = '<div>Tuesday, October 6, 2026 6:00 PM – 7:00 PM EDT</div>';
  const at = (id: string) => ({
    sourceId: id,
    sourceUrl: `https://app.joinhandshake.com/stu/events/${id}`,
  });

  it('picks the employer logo on an employer page, decoding the signed URL', () => {
    const page = `<html><body>${NAV}<main>
  <img src="${employerLogo(1200)}" alt="Contoso" class="rosetta-entity-avatar">
  <h1>Contoso Info Session</h1>${when}
  <a href="/e/1200"><img src="${employerLogo(1200)}" alt="" class="rosetta-entity-avatar"> <span>Contoso</span></a>
  ${noise('501')}
</main></body></html>`;
    expect(parseEventDetail(page, at('501'), { now: NOW })).toMatchObject({
      employerSourceId: '1200',
      logoUrl: decoded(1200),
      imageUrl: `${CDN}/events/501/original/data.?1788`,
    });
  });

  it('picks the employer logo by id when the school posted the event', () => {
    // The header shows the school's logo first; the employer's comes later.
    const page = `<html><body>${NAV}<main>
  <img src="${SCHOOL_LOGO}" alt="${SCHOOL}" class="rosetta-entity-avatar">
  <h1>Fabrikam Info Session</h1>${when}
  <a href="/e/1300"><img src="${employerLogo(1300)}" alt="" class="rosetta-entity-avatar"> <span>Fabrikam</span></a>
  ${noise('502')}
</main></body></html>`;
    expect(parseEventDetail(page, at('502'), { now: NOW })).toMatchObject({
      organizerName: 'Fabrikam',
      logoUrl: decoded(1300),
    });
  });

  it('picks the school logo by name on a school-organized page', () => {
    const page = `<html><body>${NAV}<main>
  <img src="${SCHOOL_LOGO}" alt="${SCHOOL}" class="rosetta-entity-avatar">
  <div>${SCHOOL}</div>
  <h1>Game Dev Weekly Meetings</h1>${when}
  ${noise('503')}
</main></body></html>`;
    expect(parseEventDetail(page, at('503'), { now: NOW })).toMatchObject({
      organizerName: SCHOOL,
      employerSourceId: null,
      logoUrl: SCHOOL_LOGO,
    });
  });

  it('leaves the logo empty rather than borrowing another organizer’s', () => {
    const page = `<html><body>${NAV}<main>
  <div>Robotics Club</div><h1>Robotics Night</h1>${when}
  ${noise('504')}
</main></body></html>`;
    expect(parseEventDetail(page, at('504'), { now: NOW }).logoUrl).toBeNull();
  });

  it('takes each listing card’s own logo', () => {
    const card = (id: string, logo: string, text: string) =>
      `<div class="card"><div>${logo}</div><a href="/stu/events/${id}">${text}</a><img src="${CDN}/user_profile_photos/1/a.jpg" alt="Attendee profile picture"></div>`;
    const events = parseListing(`${NAV}<main><div class="list">
  ${card('601', `<img alt="Contoso logo" src="${employerLogo(1200)}">`, 'Contoso Info Session')}
  ${card('602', `<img alt="Featured employer ${SCHOOL}" src="${SCHOOL_LOGO}">`, 'Game Dev Weekly Meetings')}
  ${card('603', '', 'Robotics Night')}
</div></main>`);
    expect(events.map((item) => [item.sourceId, item.logoUrl])).toEqual([
      ['601', decoded(1200)],
      ['602', SCHOOL_LOGO],
      ['603', null],
    ]);
  });
});
