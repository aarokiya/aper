'use client';

import type { CareersDigest } from '@/lib/handshake/queries';
import { fmtRelativeDay, fmtTimeRange } from '@/lib/handshake/format';
import {
  HandshakeConnectButton,
  HandshakeLiveNote,
} from '@/components/careers/handshake-actions';
import { OrganizerLogo } from '@/components/careers/careers-rows';

/*
 * Today's campus events section: the list body only (Today renders the label
 * and "View all"). Rows follow the Study Hub "Coming up" list: a serif lead
 * cell, the title, quiet meta, a hairline between rows. Each row opens the
 * event in Handshake in a new tab.
 */

const ROW =
  'group grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 py-2.5 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:gap-x-4';
const TITLE =
  'text-[0.9375rem] text-ink group-hover:underline group-hover:underline-offset-[3px]';
const META = 'mt-0.5 block truncate text-[0.78125rem] text-ink-3';
const SIDE =
  'col-start-2 text-[0.78125rem] text-ink-3 tabular-nums sm:col-start-auto sm:text-right';

function ConnectState() {
  return (
    <div className="border-t border-rule py-3.5">
      <p className="max-w-[60ch] text-[0.875rem] text-ink-2">
        Connect Handshake to see campus events picked for you each morning.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <HandshakeConnectButton small />
        <HandshakeLiveNote />
      </div>
    </div>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-rule py-3.5 text-[0.875rem] text-ink-3">
      {children}
    </p>
  );
}

const Arrow = () => (
  <span aria-hidden className="ml-1 text-ink-4">
    ↗
  </span>
);

/** The most relevant campus events in the next two weeks, in date order. */
export function TodayEvents({ digest }: { digest: CareersDigest }) {
  if (!digest.events.length) {
    if (!digest.connected) return <ConnectState />;
    return (
      <Quiet>
        {digest.lastSyncedAt
          ? 'No campus events in the next two weeks match your profile.'
          : 'Handshake is connected. Events appear after the first daily read.'}
      </Quiet>
    );
  }
  return (
    <ul className="rule-rows">
      {digest.events.map((event) => {
        const day = event.startsAt
          ? fmtRelativeDay(event.startsAt, digest.now, event.timeZone, 'short')
          : '—';
        return (
          <li key={event.id}>
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className={ROW}
              aria-label={`${event.title}${event.organizer ? `, ${event.organizer}` : ''}. Opens in Handshake.`}
            >
              <span className="numeral text-[1.0625rem] leading-tight">
                {day}
              </span>
              <span className="flex min-w-0 items-center gap-3">
                <OrganizerLogo
                  key={event.logoUrl}
                  src={event.logoUrl}
                  name={event.organizer}
                  size={32}
                />
                <span className="min-w-0">
                  <span className={TITLE}>{event.title}</span>
                  <span className={META}>
                    {[
                      event.organizer,
                      event.category !== 'Other' ? event.category : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    {event.rsvpStatus === 'Registered' && (
                      <span className="text-good">
                        . You&rsquo;re registered
                      </span>
                    )}
                  </span>
                </span>
              </span>
              <span className={SIDE}>
                {event.startsAt
                  ? fmtTimeRange(event.startsAt, event.endsAt, event.timeZone)
                  : 'Time to be confirmed'}
                <Arrow />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
