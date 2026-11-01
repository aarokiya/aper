import { APP_TIME_ZONE } from '@/lib/time-zone';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { hasHandshakeSession } from '@/lib/handshake/auth';
import { getCareerProfile } from '@/lib/handshake/profile';
import type { CareerProfile, RelevanceReason } from '@/lib/handshake/relevance';
import {
  loadEventRows,
  newSince,
  parseJsonArray,
  scoreEventRow,
  type EventRow,
} from '@/lib/handshake/store';
import {
  handshakeLoginState,
  isHandshakeSyncActive,
  type HandshakeLoginState,
} from '@/lib/handshake/runtime';

export type CareerEvent = {
  id: number;
  sourceId: string;
  url: string;
  title: string;
  organizer: string | null;
  category: string | null;
  eventType: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
  whenLabel: string | null;
  location: string | null;
  format: 'in-person' | 'virtual' | 'hybrid' | null;
  rsvpStatus: string | null;
  postedBySchool: boolean;
  imageUrl: string | null;
  logoUrl: string | null;
  isNew: boolean;
  score: number;
  reasons: RelevanceReason[];
  dismissed: boolean;
};

export type CareerEventDetail = CareerEvent & { description: string };

export type CareersDigest = {
  connected: boolean;
  lastSyncedAt: string | null;
  events: CareerEvent[];
  /** server render time, so day labels match between SSR and hydration */
  now: string;
};

export type HandshakeStatus = {
  /** provider auth is CONNECTED */
  connected: boolean;
  /** a visible sign-in has completed on this machine at least once */
  hasSession: boolean;
  authStatus: string | null;
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  syncing: boolean;
  login: HandshakeLoginState;
  latestRun: null | {
    id: number;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    progressLabel: string | null;
    entitiesUpdated: number;
    errors: string[];
    warnings: string[];
  };
  counts: { events: number };
};

const DAY_MS = 86_400_000;

export function getHandshakeStatus(): HandshakeStatus {
  initializeDatabase();
  const { sqlite } = getDb();
  const provider = sqlite
    .prepare(
      `SELECT auth_status AS authStatus,last_success_at AS lastSuccessAt,last_attempt_at AS lastAttemptAt,last_error AS lastError FROM providers WHERE key='handshake'`,
    )
    .get() as
    | {
        authStatus: string;
        lastSuccessAt: string | null;
        lastAttemptAt: string | null;
        lastError: string | null;
      }
    | undefined;
  const run = sqlite
    .prepare(
      `SELECT id,status,started_at AS startedAt,finished_at AS finishedAt,progress_label AS progressLabel,entities_updated AS entitiesUpdated,errors_json AS errors,warnings_json AS warnings FROM sync_runs WHERE provider='handshake' ORDER BY id DESC LIMIT 1`,
    )
    .get() as
    | (Omit<
        NonNullable<HandshakeStatus['latestRun']>,
        'errors' | 'warnings'
      > & {
        errors: string;
        warnings: string;
      })
    | undefined;
  const now = new Date().toISOString();
  const counts = sqlite
    .prepare(
      `SELECT count(*) AS events FROM campus_events WHERE source_provider='handshake' AND dismissed_at IS NULL AND COALESCE(ends_at,starts_at,?) >= ?`,
    )
    .get(now, now) as { events: number };
  return {
    connected: provider?.authStatus === 'CONNECTED',
    hasSession: hasHandshakeSession(),
    authStatus: provider?.authStatus ?? null,
    lastSyncedAt: provider?.lastSuccessAt ?? null,
    lastAttemptAt: provider?.lastAttemptAt ?? null,
    lastError: provider?.lastError ?? null,
    syncing: isHandshakeSyncActive(),
    login: handshakeLoginState(),
    latestRun: run
      ? {
          ...run,
          errors: parseJsonArray<string>(run.errors),
          warnings: parseJsonArray<string>(run.warnings),
        }
      : null,
    counts,
  };
}

function toEvent(
  row: EventRow,
  profile: CareerProfile,
  now: Date,
  newCutoff: string,
): CareerEvent {
  const relevance = scoreEventRow(row, profile, now);
  return {
    id: row.id,
    sourceId: row.sourceId,
    url:
      row.sourceUrl ??
      `https://app.joinhandshake.com/stu/events/${row.sourceId}`,
    title: row.title,
    organizer: row.organizerName,
    category: row.category,
    eventType: row.eventType,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timeZone: row.timeZone ?? APP_TIME_ZONE,
    whenLabel: row.whenLabel,
    location: row.location,
    format: row.eventFormat as CareerEvent['format'],
    rsvpStatus: row.rsvpStatus,
    postedBySchool: Boolean(row.postedBySchool),
    imageUrl: row.imageUrl,
    logoUrl: row.logoUrl,
    isNew: row.firstSeenAt > newCutoff,
    score: relevance.score,
    reasons: relevance.reasons,
    dismissed: Boolean(row.dismissedAt),
  };
}

/** Not yet over: ends in the future, or (no end) started under three hours ago. */
const upcomingWhere = `COALESCE(ends_at, strftime('%Y-%m-%dT%H:%M:%fZ', starts_at, '+3 hours'), '9999') >= ?`;

/**
 * Today's campus events: the most relevant in the next 14 days (≤6), never
 * dismissed, shown in date order.
 */
export function getCareersDigest(now = new Date()): CareersDigest {
  const status = getHandshakeStatus();
  const profile = getCareerProfile();
  const newCutoff = newSince(now);
  const nowIso = now.toISOString();
  const horizon = new Date(now.getTime() + 14 * DAY_MS).toISOString();
  const events = loadEventRows(
    `dismissed_at IS NULL AND starts_at IS NOT NULL AND starts_at <= ? AND ${upcomingWhere}`,
    horizon,
    nowIso,
  )
    .map((row) => toEvent(row, profile, now, newCutoff))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
  return {
    connected: status.connected,
    lastSyncedAt: status.lastSyncedAt,
    events,
    now: nowIso,
  };
}

export type CareersPageData = {
  now: string;
  status: HandshakeStatus;
  profile: CareerProfile;
  events: CareerEventDetail[];
};

/**
 * Every upcoming event, which the Careers page filters client-side, by date.
 * Dismissed rows are included and hidden by default.
 */
export function getCareersPage(now = new Date()): CareersPageData {
  const status = getHandshakeStatus();
  const profile = getCareerProfile();
  const newCutoff = newSince(now);
  const nowIso = now.toISOString();
  const events = loadEventRows(upcomingWhere, nowIso)
    .map((row) => ({
      ...toEvent(row, profile, now, newCutoff),
      description: row.descriptionText ?? '',
    }))
    .sort(
      (a, b) =>
        (a.startsAt ?? '9999').localeCompare(b.startsAt ?? '9999') ||
        b.score - a.score,
    );
  return { now: nowIso, status, profile, events };
}
