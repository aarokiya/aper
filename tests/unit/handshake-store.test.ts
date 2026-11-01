import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type * as DbClient from '@/lib/db/client';
import type { ParsedEvent } from '@/lib/handshake/parse';
import type * as Queries from '@/lib/handshake/queries';
import type * as Store from '@/lib/handshake/store';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aper-handshake-'));
process.env.ACADEMIC_DATA_DIR = sandbox;
process.env.ACADEMIC_DB_PATH = path.join(sandbox, 'academic.db');
process.env.ACADEMIC_BROWSER_DIR = path.join(sandbox, 'browser');

let db: typeof DbClient;
let store: typeof Store;
let queries: typeof Queries;

const DAY = 86_400_000;
const FIRST_SYNC = new Date('2026-09-20T11:00:00.000Z');
const NOW = new Date('2026-10-01T16:00:00.000Z');
const at = (base: Date, days: number) =>
  new Date(base.getTime() + days * DAY).toISOString();

const event = (
  id: string,
  startsAt: string | null,
  overrides: Partial<ParsedEvent> = {},
): ParsedEvent => ({
  sourceId: id,
  sourceUrl: `https://app.joinhandshake.com/stu/events/${id}`,
  title: `Event ${id}`,
  organizerName: 'Google',
  employerSourceId: null,
  category: 'Tech talk',
  eventType: null,
  startsAt,
  endsAt: startsAt
    ? new Date(Date.parse(startsAt) + 3_600_000).toISOString()
    : null,
  timeZone: 'America/New_York',
  whenLabel: null,
  location: 'Klaus 1116',
  isVirtual: false,
  eventFormat: 'in-person',
  rsvpStatus: null,
  postedBySchool: false,
  descriptionText: '',
  imageUrl: null,
  logoUrl: null,
  ...overrides,
});

describe('Handshake storage and Careers digest', () => {
  beforeAll(async () => {
    // Imported after the env vars above: the client resolves paths at module load.
    db = await import('@/lib/db/client');
    store = await import('@/lib/handshake/store');
    queries = await import('@/lib/handshake/queries');
    db.initializeDatabase();
  });

  afterAll(() => {
    db.closeDatabaseForTests();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('keeps the dismissed flag and first-seen time through re-syncs', () => {
    // Already over, so it stays out of the upcoming lists checked below.
    const startsAt = at(NOW, -5);
    store.upsertEvent(
      event('e-100', startsAt),
      { rank: 1, logoUrl: null },
      FIRST_SYNC.toISOString(),
      'raw/events.json',
    );
    const [row] = store.loadEventRows(`source_id='e-100'`);
    expect(store.setHandshakeFlags(row.id, { dismissed: true })).toBe(true);
    const later = at(FIRST_SYNC, 1);
    store.upsertEvent(
      event('e-100', startsAt, { title: 'Engineering Panel, renamed' }),
      { rank: 4, logoUrl: null },
      later,
      'raw/events.json',
    );
    const [after] = store.loadEventRows(`source_id='e-100'`);
    expect(after).toMatchObject({
      title: 'Engineering Panel, renamed',
      listRank: 4,
      firstSeenAt: FIRST_SYNC.toISOString(),
      lastSeenAt: later,
    });
    expect(after.dismissedAt).not.toBeNull();
    expect(store.setHandshakeFlags(999_999, { dismissed: true })).toBe(false);
  });

  it('picks relevant upcoming events within two weeks and lists them by date', () => {
    const seen = FIRST_SYNC.toISOString();
    store.upsertEvent(
      event('e-past', at(NOW, -2)),
      { rank: 1, logoUrl: null },
      seen,
      'raw/events.json',
    );
    store.upsertEvent(
      event('e-far', at(NOW, 20)),
      { rank: 2, logoUrl: null },
      seen,
      'raw/events.json',
    );
    store.upsertEvent(
      event('e-fair', at(NOW, 9), {
        title: 'All-Majors Career Fair',
        category: 'Career fair',
        postedBySchool: true,
      }),
      { rank: 3, logoUrl: null },
      seen,
      'raw/events.json',
    );
    store.upsertEvent(
      event('e-talk', at(NOW, 2)),
      { rank: 4, logoUrl: null },
      seen,
      'raw/events.json',
    );
    store.upsertEvent(
      event('e-tbd', null),
      { rank: 5, logoUrl: null },
      seen,
      'raw/events.json',
    );

    const digest = queries.getCareersDigest(NOW);
    expect(digest.events.map((item) => item.sourceId)).toEqual([
      'e-talk',
      'e-fair',
    ]);

    const page = queries.getCareersPage(NOW);
    expect(page.events.map((item) => item.sourceId)).toEqual([
      'e-talk',
      'e-fair',
      'e-far',
      'e-tbd',
    ]);
  });

  it('lets a detail-page logo win over the card logo and never clears a logo', () => {
    const id = 'e-logo';
    const startsAt = at(NOW, -3);
    const card = 'https://cdn.example/card-logo.png';
    const detail = 'https://cdn.example/detail-logo.png';
    const logo = () => store.loadEventRows(`source_id='${id}'`)[0].logoUrl;
    const listed = (logoUrl: string | null) =>
      store.markEventsListed(
        [{ sourceId: id, rank: 1, postedBySchool: false, logoUrl }],
        FIRST_SYNC.toISOString(),
      );
    const read = (eventLogo: string | null, cardLogo: string | null) =>
      store.upsertEvent(
        event(id, startsAt, { logoUrl: eventLogo }),
        { rank: 1, logoUrl: cardLogo },
        FIRST_SYNC.toISOString(),
        'raw/events.json',
      );

    // A new event whose page has no logo keeps the one from its card.
    read(null, card);
    expect(logo()).toBe(card);
    read(detail, card);
    expect(logo()).toBe(detail);
    // Later runs that only list the event, or read a logo-less page, keep it.
    listed('https://cdn.example/other-card.png');
    read(null, 'https://cdn.example/other-card.png');
    listed(null);
    read(null, null);
    expect(logo()).toBe(detail);
  });

  it('fills a missing logo from the card when the run only lists the event', () => {
    const id = 'e-listed';
    const card = 'https://cdn.example/card-logo.png';
    store.upsertEvent(
      event(id, at(NOW, -3)),
      { rank: 1, logoUrl: null },
      FIRST_SYNC.toISOString(),
      'raw/events.json',
    );
    store.markEventsListed(
      [{ sourceId: id, rank: 2, postedBySchool: false, logoUrl: card }],
      FIRST_SYNC.toISOString(),
    );
    expect(store.loadEventRows(`source_id='${id}'`)[0].logoUrl).toBe(card);
  });
});
