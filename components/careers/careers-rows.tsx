'use client';

import { useState } from 'react';
import type { CareerEventDetail } from '@/lib/handshake/queries';
import {
  calendarDaysUntil,
  fmtRelativeDay,
  fmtShortDate,
  fmtTime,
  fmtTimeRange,
  formatLabel,
} from '@/lib/handshake/format';
import { googleCalendarUrl } from '@/lib/handshake/google-calendar';
import { explainRelevance } from '@/lib/handshake/relevance';
import { cn } from '@/lib/utils';

export type Flags = { dismissed: boolean };

/*
 * Campus event rows in the Study Hub list idiom: a serif lead cell (day or
 * time), the title in the reading face, quiet sans meta, the reasons it
 * ranked as a plain sentence, and an expandable details block. Actions sit
 * to the right on wide screens and under the text on narrow ones.
 */

const ROW =
  'grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-4 py-5 sm:grid-cols-[5.5rem_minmax(0,1fr)] lg:grid-cols-[5.5rem_minmax(0,1fr)_auto] lg:gap-x-8';

function Actions({
  url,
  title,
  calendarUrl,
  dismissed,
  onFlag,
}: {
  url: string;
  title: string;
  /** null when the event has no start time yet */
  calendarUrl: string | null;
  dismissed: boolean;
  onFlag: (flags: Flags) => void;
}) {
  return (
    <div className="col-start-2 mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 lg:col-start-auto lg:mt-0 lg:flex-col lg:items-end lg:gap-y-2.5">
      {calendarUrl && (
        <a
          className="pill pill-sm whitespace-nowrap"
          href={calendarUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Add ${title} to Google Calendar (new tab)`}
        >
          Add to Google Calendar
        </a>
      )}
      <button
        type="button"
        className="textlink"
        aria-label={dismissed ? `Restore ${title}` : `Dismiss ${title}`}
        onClick={() => onFlag({ dismissed: !dismissed })}
      >
        {dismissed ? 'Restore' : 'Dismiss'}
      </button>
      <a
        className="textlink whitespace-nowrap"
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${title} in Handshake (new tab)`}
      >
        Open in Handshake ↗
      </a>
    </div>
  );
}

function Why({ reasons }: { reasons: CareerEventDetail['reasons'] }) {
  const { why, caution } = explainRelevance(reasons);
  if (!why && !caution) return null;
  return (
    <p className="mt-2 max-w-[68ch] text-[0.8125rem] leading-relaxed text-ink-3">
      {why}
      {caution && <span className="text-bad"> {caution}</span>}
    </p>
  );
}

function Meta({ items }: { items: Array<string | null | undefined | false> }) {
  const shown = items.filter((item): item is string => Boolean(item));
  if (!shown.length) return null;
  return (
    <p className="mt-1 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[0.8125rem] text-ink-3">
      {shown.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </p>
  );
}

function Prose({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!paragraphs.length) return null;
  return (
    <div className="max-w-[68ch] space-y-3 font-serif text-[1rem] leading-[1.65] text-ink-2">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

function Facts({
  facts,
}: {
  facts: Array<[string, string | null | undefined]>;
}) {
  const shown = facts.filter((fact): fact is [string, string] =>
    Boolean(fact[1]),
  );
  if (!shown.length) return null;
  return (
    <dl className="grid max-w-[44rem] grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[0.8125rem]">
      {shown.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-ink-3">{term}</dt>
          <dd className="text-ink-2">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Artifact `details.mat`: a quiet toggle with a +/− marker. */
function Details({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group mt-2.5">
      <summary className="inline-flex cursor-pointer list-none items-baseline gap-1.5 rounded-sm text-[0.8125rem] text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
        {label}
        <span aria-hidden className="w-2 text-ink-4 group-open:hidden">
          +
        </span>
        <span aria-hidden className="hidden w-2 text-ink-4 group-open:inline">
          −
        </span>
      </summary>
      <div className="mt-4 mb-1 grid gap-6">{children}</div>
    </details>
  );
}

const MINOR_WORDS = /^(of|the|and|at|for|in|&)$/i;

/** "Georgia Institute of Technology - College of Computing" → "GT". */
function initials(name: string | null) {
  const words = (name ?? '')
    .split(/\s+[-–—|]\s+/)[0]
    .split(/[\s,.]+/)
    .filter((word) => /^\p{L}/u.test(word) && !MINOR_WORDS.test(word));
  if (!words.length) return '·';
  const last = words.length > 1 ? words[words.length - 1] : '';
  return `${words[0][0]}${last[0] ?? ''}`.toUpperCase();
}

/**
 * The organizer's logo on a white tile, so transparent and dark logos read in
 * dark mode; a monogram when there is no logo or it fails to load. Decorative:
 * the organizer name is already in the row's text.
 */
export function OrganizerLogo({
  src,
  name,
  size,
}: {
  src: string | null;
  name: string | null;
  size: 32 | 40;
}) {
  const [failed, setFailed] = useState(false);
  const tile = cn(
    'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-rule',
    size === 40 ? 'size-10' : 'size-8',
  );
  if (!src || failed)
    return (
      <span
        aria-hidden
        className={cn(
          tile,
          'bg-wash font-serif text-ink-3',
          size === 40 ? 'text-[0.9375rem]' : 'text-[0.8125rem]',
        )}
      >
        {initials(name)}
      </span>
    );
  return (
    <span className={cn(tile, 'bg-white p-1')}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote Handshake logos, not optimizable assets */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-full object-contain"
      />
    </span>
  );
}

export function EventRow({
  event,
  now,
  showDay,
  onFlag,
}: {
  event: CareerEventDetail;
  now: string;
  /** lead cell shows the day as well as the time (ungrouped lists) */
  showDay: boolean;
  onFlag: (flags: Flags) => void;
}) {
  const zone = event.timeZone;
  return (
    <li className={cn(ROW, event.dismissed && 'opacity-60')}>
      <div className="pt-0.5">
        {event.startsAt ? (
          <>
            {showDay && (
              <p className="numeral text-[1.125rem] leading-tight">
                {fmtRelativeDay(event.startsAt, now, zone, 'short')}
              </p>
            )}
            <p
              className={cn(
                showDay
                  ? 'mt-0.5 text-[0.75rem] text-ink-3'
                  : 'numeral text-[1.0625rem] leading-tight',
              )}
            >
              {fmtTime(event.startsAt, zone)}
            </p>
            {!showDay && event.endsAt && (
              <p className="mt-0.5 text-[0.75rem] text-ink-3 tabular-nums">
                to{' '}
                {calendarDaysUntil(event.endsAt, event.startsAt, zone) === 0
                  ? fmtTime(event.endsAt, zone)
                  : `${fmtShortDate(event.endsAt, zone)}, ${fmtTime(event.endsAt, zone)}`}
              </p>
            )}
          </>
        ) : (
          <p className="text-[0.75rem] leading-6 text-ink-4">
            Time to be confirmed
          </p>
        )}
      </div>
      <div className="flex min-w-0 gap-3 sm:gap-4">
        <OrganizerLogo
          key={event.logoUrl}
          src={event.logoUrl}
          name={event.organizer}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[1.125rem] leading-snug text-ink">
            {event.title}
            {event.isNew && (
              <span className="ml-2 align-[0.08em] font-sans text-[0.75rem] text-good">
                New today
              </span>
            )}
          </h3>
          {event.organizer && (
            <p className="mt-0.5 text-[0.875rem] text-ink-2">
              {event.organizer}
            </p>
          )}
          <Meta
            items={[
              event.category !== 'Other' ? event.category : event.eventType,
              formatLabel(event.format),
              event.location,
              event.rsvpStatus === 'Registered'
                ? null
                : event.rsvpStatus === 'Open'
                  ? 'RSVP open'
                  : event.rsvpStatus,
            ]}
          />
          {event.rsvpStatus === 'Registered' && (
            <p className="mt-1 text-[0.8125rem] text-good">
              You&rsquo;re registered
            </p>
          )}
          <Why reasons={event.reasons} />
          {(event.description || event.whenLabel) && (
            <Details label="Details">
              <Facts
                facts={[
                  [
                    'When',
                    event.startsAt
                      ? `${fmtRelativeDay(event.startsAt, now, zone)}, ${fmtShortDate(event.startsAt, zone)}, ${fmtTimeRange(event.startsAt, event.endsAt, zone)}`
                      : event.whenLabel,
                  ],
                  ['Where', event.location],
                  ['Format', formatLabel(event.format)],
                  ['Posted by', event.postedBySchool ? 'Georgia Tech' : null],
                ]}
              />
              <Prose text={event.description} />
            </Details>
          )}
        </div>
      </div>
      <Actions
        url={event.url}
        title={event.title}
        calendarUrl={googleCalendarUrl(event)}
        dismissed={event.dismissed}
        onFlag={onFlag}
      />
    </li>
  );
}
