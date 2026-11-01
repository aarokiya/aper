/**
 * SQLite persistence for Handshake campus events. Sync writes source columns
 * only; `dismissed_at` is a local flag it never touches.
 */
import { getDb, initializeDatabase } from '@/lib/db/client';
import type { ParsedEvent } from '@/lib/handshake/parse';
import { getCareerProfile } from '@/lib/handshake/profile';
import { scoreEvent, type CareerProfile } from '@/lib/handshake/relevance';
import { contentHash } from '@/lib/sync/utils';

const json = (value: unknown) => JSON.stringify(value ?? null);

export function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export type EventRow = {
  id: number;
  sourceId: string;
  sourceUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  title: string;
  organizerName: string | null;
  category: string | null;
  eventType: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string | null;
  whenLabel: string | null;
  location: string | null;
  isVirtual: number;
  eventFormat: string | null;
  rsvpStatus: string | null;
  postedBySchool: number;
  descriptionText: string | null;
  imageUrl: string | null;
  logoUrl: string | null;
  listRank: number | null;
  dismissedAt: string | null;
};

const EVENT_COLUMNS = `id,source_id AS sourceId,source_url AS sourceUrl,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt,title,organizer_name AS organizerName,category,event_type AS eventType,starts_at AS startsAt,ends_at AS endsAt,time_zone AS timeZone,when_label AS whenLabel,location,is_virtual AS isVirtual,event_format AS eventFormat,rsvp_status AS rsvpStatus,posted_by_school AS postedBySchool,description_text AS descriptionText,image_url AS imageUrl,logo_url AS logoUrl,list_rank AS listRank,dismissed_at AS dismissedAt`;

export function loadEventRows(where = '1=1', ...params: unknown[]) {
  initializeDatabase();
  return getDb()
    .sqlite.prepare(
      `SELECT ${EVENT_COLUMNS} FROM campus_events WHERE source_provider='handshake' AND (${where})`,
    )
    .all(...params) as EventRow[];
}

/**
 * Events first seen after this instant count as new: the last 24 hours,
 * but never events from the very first sync, when everything is unseen.
 */
export function newSince(now: Date) {
  const { at } = getDb()
    .sqlite.prepare(
      `SELECT MIN(first_seen_at) AS at FROM campus_events WHERE source_provider='handshake'`,
    )
    .get() as { at: string | null };
  const afterFirstSync = at ? Date.parse(at) + 3_600_000 : 0;
  return new Date(
    Math.max(now.getTime() - 86_400_000, afterFirstSync),
  ).toISOString();
}

export function scoreEventRow(
  row: EventRow,
  profile: CareerProfile,
  now: Date,
) {
  return scoreEvent(
    { ...row, postedBySchool: Boolean(row.postedBySchool) },
    profile,
    now,
  );
}

/** Recomputes and stores every event's relevance (after sync or a profile edit). */
export function rescoreHandshake(now = new Date()) {
  const profile = getCareerProfile();
  const { sqlite } = getDb();
  const events = loadEventRows();
  const updateEvent = sqlite.prepare(
    `UPDATE campus_events SET relevance_score=?,relevance_reasons_json=? WHERE id=?`,
  );
  sqlite.transaction(() => {
    for (const row of events) {
      const { score, reasons } = scoreEventRow(row, profile, now);
      updateEvent.run(score, json(reasons), row.id);
    }
  })();
}

/**
 * Keeps cached rows current for every event Handshake listed this run. The
 * card logo only fills a missing one: a detail-page logo is more specific.
 */
export function markEventsListed(
  items: Array<{
    sourceId: string;
    rank: number;
    postedBySchool: boolean;
    logoUrl: string | null;
  }>,
  seenAt: string,
) {
  const statement = getDb().sqlite.prepare(
    `UPDATE campus_events SET last_seen_at=?,list_rank=?,posted_by_school=MAX(posted_by_school,?),logo_url=COALESCE(logo_url,?) WHERE source_provider='handshake' AND source_id=?`,
  );
  for (const item of items)
    statement.run(
      seenAt,
      item.rank,
      Number(item.postedBySchool),
      item.logoUrl,
      item.sourceId,
    );
}

export function upsertEvent(
  event: ParsedEvent,
  listing: { rank: number; logoUrl: string | null },
  syncedAt: string,
  rawSnapshotPath: string,
) {
  getDb()
    .sqlite.prepare(
      `INSERT INTO campus_events (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,raw_snapshot_path,content_hash,title,organizer_name,employer_source_id,category,event_type,starts_at,ends_at,time_zone,when_label,location,is_virtual,event_format,rsvp_status,posted_by_school,description_text,image_url,logo_url,list_rank,provider_json)
       VALUES ('handshake',@sourceId,@sourceUrl,@syncedAt,@syncedAt,@syncedAt,@rawSnapshotPath,@hash,@title,@organizerName,@employerSourceId,@category,@eventType,@startsAt,@endsAt,@timeZone,@whenLabel,@location,@isVirtual,@eventFormat,@rsvpStatus,@postedBySchool,@descriptionText,@imageUrl,@logoUrl,@rank,@providerJson)
       ON CONFLICT(source_provider,source_id) DO UPDATE SET source_url=excluded.source_url,last_seen_at=excluded.last_seen_at,last_synced_at=excluded.last_synced_at,raw_snapshot_path=excluded.raw_snapshot_path,content_hash=excluded.content_hash,
         source_updated_at=CASE WHEN campus_events.content_hash IS excluded.content_hash THEN campus_events.source_updated_at ELSE excluded.last_synced_at END,
         title=excluded.title,organizer_name=excluded.organizer_name,employer_source_id=excluded.employer_source_id,category=excluded.category,event_type=excluded.event_type,starts_at=excluded.starts_at,ends_at=excluded.ends_at,time_zone=excluded.time_zone,when_label=excluded.when_label,location=excluded.location,is_virtual=excluded.is_virtual,event_format=excluded.event_format,rsvp_status=excluded.rsvp_status,posted_by_school=MAX(campus_events.posted_by_school,excluded.posted_by_school),description_text=excluded.description_text,image_url=excluded.image_url,logo_url=COALESCE(@detailLogoUrl,campus_events.logo_url,excluded.logo_url),list_rank=excluded.list_rank,provider_json=excluded.provider_json`,
    )
    .run({
      ...event,
      syncedAt,
      rawSnapshotPath,
      hash: contentHash(event),
      isVirtual: Number(event.isVirtual),
      postedBySchool: Number(event.postedBySchool),
      // A detail-page logo wins; the card logo only fills a gap.
      detailLogoUrl: event.logoUrl,
      logoUrl: event.logoUrl ?? listing.logoUrl,
      rank: listing.rank,
      providerJson: json(event),
    });
}

/** Local-only dismiss/restore; returns false when the row doesn't exist. */
export function setHandshakeFlags(id: number, flags: { dismissed: boolean }) {
  initializeDatabase();
  return (
    getDb()
      .sqlite.prepare(`UPDATE campus_events SET dismissed_at=? WHERE id=?`)
      .run(flags.dismissed ? new Date().toISOString() : null, id).changes > 0
  );
}
