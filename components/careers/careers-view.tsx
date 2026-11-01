'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  HandshakeConnectButton,
  HandshakeLiveNote,
  HandshakeRefreshButton,
} from '@/components/careers/handshake-actions';
import { EventRow, type Flags } from '@/components/careers/careers-rows';
import {
  clearEventFilters,
  EVENT_FILTER_KEYS,
  eventFiltersToParams,
  eventPool,
  filterEvents,
  isFiltered,
  kindOptions,
  type EventFilters,
  type EventFormatFilter,
  type EventHostFilter,
  type EventSort,
  type EventWindow,
} from '@/lib/handshake/event-filters';
import {
  fmtLongDay,
  fmtRelativeDay,
  fmtSyncedAt,
} from '@/lib/handshake/format';
import type {
  CareerEventDetail,
  CareersPageData,
} from '@/lib/handshake/queries';
import { listJoin } from '@/lib/handshake/relevance';
import { cn } from '@/lib/utils';

function Toggle({
  on,
  count,
  onClick,
  children,
}: {
  on: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('pill pill-sm', on && 'pill-primary')}
    >
      {children}
      {count !== undefined && (
        <span className={cn('tabular-nums', on ? 'opacity-75' : 'text-ink-4')}>
          {count}
        </span>
      )}
    </button>
  );
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <label className="contents">
      <span className="sr">{label}</span>
      <select
        className="field w-auto min-w-0 pr-8 text-[0.8125rem]"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function Empty({
  children,
  onClear,
}: {
  children: React.ReactNode;
  onClear?: () => void;
}) {
  return (
    <div className="border-t border-rule py-8">
      <p className="text-[0.9375rem] text-ink-2">{children}</p>
      {onClear && (
        <button type="button" className="textlink mt-2" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

/** Shown after a dismiss so the row can come back without hunting for it. */
function UndoLine({ title, onUndo }: { title: string; onUndo: () => void }) {
  return (
    <p className="mb-3 text-[0.8125rem] text-ink-3" aria-live="polite">
      Dismissed {title}.{' '}
      <button type="button" className="textlink" onClick={onUndo}>
        Undo
      </button>
    </p>
  );
}

function ConnectIntro({ data }: { data: CareersPageData }) {
  return (
    <section className="max-w-[62ch] border-t border-rule pt-7">
      <h2 className="display text-[1.5rem]">Connect Handshake</h2>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
        Each morning, _aper reads the campus events Handshake ranks highest for
        you, along with the ones Georgia Tech posts itself, then sorts them
        against your career profile, with the reasons each one made the cut.
      </p>
      <ol className="mt-6 space-y-2.5 text-[0.875rem] text-ink-2">
        {[
          'A Handshake window opens on this computer.',
          'Sign in there with your Georgia Tech account, SSO and Duo included.',
          'The window closes and the first read starts. It takes a few minutes.',
        ].map((step, index) => (
          <li key={step} className="grid grid-cols-[1.5rem_1fr] items-baseline">
            <span className="numeral text-ink-3">{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
        <HandshakeConnectButton initial={data.status} />
        <HandshakeLiveNote initial={data.status} />
      </div>
      <p className="mt-6 text-[0.78125rem] leading-relaxed text-ink-4">
        Read-only. _aper never registers, saves, messages, or RSVPs on
        Handshake, never sees your password or Duo response, and keeps the
        session on this machine. Prefer a terminal? Run{' '}
        <span className="font-mono">pnpm handshake:login</span>.
      </p>
    </section>
  );
}

export function CareersView({
  data,
  initialFilters,
}: {
  data: CareersPageData;
  initialFilters: EventFilters;
}) {
  const [events, setEvents] = useState(data.events);
  const [undo, setUndo] = useState<{ id: number; title: string } | null>(null);
  const [flagError, setFlagError] = useState('');
  const { status, profile, now } = data;

  const [synced, setSynced] = useState(data);
  if (synced !== data) {
    // Server data changed (refresh finished): adopt it.
    setSynced(data);
    setEvents(data.events);
  }

  const flag = async (id: number, flags: Flags) => {
    const previous = events.find((item) => item.id === id);
    if (!previous) return;
    const update = (value: Flags) =>
      setEvents((list) =>
        list.map((item) => (item.id === id ? { ...item, ...value } : item)),
      );
    update(flags);
    setFlagError('');
    if (flags.dismissed) setUndo({ id, title: previous.title });
    else if (flags.dismissed === false && undo?.id === id) setUndo(null);
    try {
      const response = await fetch(`/api/handshake/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flags),
      });
      if (!response.ok) throw new Error(`Could not update ${previous.title}.`);
    } catch (error) {
      update({ dismissed: previous.dismissed });
      setFlagError(error instanceof Error ? error.message : String(error));
    }
  };

  if (!events.length && !status.hasSession) return <ConnectIntro data={data} />;

  const interests = listJoin(profile.interests.slice(0, 3));
  return (
    <div>
      <p className="mb-8 max-w-[60ch] text-[0.96875rem] leading-relaxed text-ink-2">
        Campus events from Handshake, ranked
        {interests
          ? ` for your interest in ${interests}`
          : ' by Handshake and event type. Add interests to sharpen this'}
        .
        Read every morning;{' '}
        <Link
          href="/settings#handshake"
          className="underline decoration-rule-2 underline-offset-[3px] hover:decoration-ink"
        >
          {interests ? 'change what counts' : 'add interests'}
        </Link>
        .
      </p>

      {!status.connected && status.hasSession && (
        <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-ink py-1 pl-4">
          <p className="text-[0.875rem] text-ink-2">
            Handshake needs you to sign in again.
            {status.lastSyncedAt &&
              ` These events are from ${fmtSyncedAt(status.lastSyncedAt, now)}.`}
          </p>
          <HandshakeConnectButton initial={status} small />
        </div>
      )}
      {status.connected && !status.lastSyncedAt && !events.length && (
        <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-ink py-1 pl-4">
          <p className="text-[0.875rem] text-ink-2">
            Handshake is connected. Read it now to fill this list.
          </p>
          <HandshakeRefreshButton initial={status} small />
        </div>
      )}
      <HandshakeLiveNote initial={status} className="-mt-4 mb-6" />
      {status.latestRun?.status === 'PARTIAL' && (
        <p className="-mt-3 mb-6 max-w-[68ch] text-[0.78125rem] text-ink-4">
          The last read skipped {status.latestRun.errors.length}{' '}
          {status.latestRun.errors.length === 1 ? 'item' : 'items'} Handshake
          didn&rsquo;t show clearly; earlier copies are kept.
        </p>
      )}

      {flagError && (
        <p className="mb-4 text-[0.8125rem] text-bad" role="alert">
          {flagError}
        </p>
      )}
      {undo && (
        <UndoLine
          title={undo.title}
          onUndo={() => void flag(undo.id, { dismissed: false })}
        />
      )}

      <EventsList
        events={events}
        now={now}
        synced={Boolean(status.lastSyncedAt)}
        initialFilters={initialFilters}
        onFlag={(id, flags) => void flag(id, flags)}
      />
    </div>
  );
}

/** Rewrites the filter params in the address bar, so reload and back keep them. */
function mirrorToUrl(filters: EventFilters) {
  const url = new URL(window.location.href);
  // `tab` belonged to the retired list switch; drop it along with old filters.
  for (const key of [...EVENT_FILTER_KEYS, 'tab']) url.searchParams.delete(key);
  for (const [key, value] of eventFiltersToParams(filters))
    url.searchParams.append(key, value);
  window.history.replaceState(window.history.state, '', url);
}

function EventsList({
  events,
  now,
  synced,
  initialFilters,
  onFlag,
}: {
  events: CareerEventDetail[];
  now: string;
  synced: boolean;
  initialFilters: EventFilters;
  onFlag: (id: number, flags: Flags) => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const update = (next: EventFilters) => {
    setFilters(next);
    mirrorToUrl(next);
  };
  const set = (patch: Partial<EventFilters>) =>
    update({ ...filters, ...patch });

  const nowDate = new Date(now);
  const ordered = filterEvents(events, filters, nowDate);
  const pool = eventPool(events, filters);
  const kinds = kindOptions(events, filters, nowDate);
  const filtered = isFiltered(filters);
  const dismissedCount = events.filter((event) => event.dismissed).length;
  const clear = () => update(clearEventFilters(filters));

  // Date order groups rows under their day, like an agenda.
  const groups =
    filters.sort === 'date'
      ? ordered.reduce<
          Array<{ key: string; label: string; items: CareerEventDetail[] }>
        >((list, event) => {
          // Multi-day events that already began (e.g. a month-long virtual
          // series) belong under "Happening now", not their past start day.
          const started =
            event.startsAt !== null &&
            Date.parse(event.startsAt) < Date.parse(now);
          const key = started
            ? 'Happening now'
            : event.startsAt
              ? fmtLongDay(event.startsAt, event.timeZone)
              : 'Date to be confirmed';
          const last = list[list.length - 1];
          if (last?.key === key) last.items.push(event);
          else {
            const relative =
              event.startsAt && !started
                ? fmtRelativeDay(event.startsAt, now, event.timeZone)
                : null;
            list.push({
              key,
              label:
                relative === 'Today' || relative === 'Tomorrow'
                  ? `${relative}, ${key.split(', ').slice(1).join(', ')}`
                  : key,
              items: [event],
            });
          }
          return list;
        }, [])
      : null;

  return (
    <>
      <fieldset className="mb-6 grid gap-3 border-b border-rule pb-5">
        <legend className="sr">Filter events</legend>
        <div className="flex flex-wrap items-center gap-2">
          <label className="w-full sm:w-[17rem]">
            <span className="sr">Search events</span>
            <input
              type="search"
              className="field"
              placeholder="Search events, employers, places"
              value={filters.query}
              onChange={(event) => set({ query: event.target.value })}
            />
          </label>
          <Select<EventWindow>
            label="When"
            value={filters.when}
            onChange={(when) => set({ when })}
            options={[
              ['any', 'Any time'],
              ['today', 'Today'],
              ['7d', 'Next 7 days'],
              ['14d', 'Next 14 days'],
            ]}
          />
          <Select<EventFormatFilter>
            label="Format"
            value={filters.format}
            onChange={(format) => set({ format })}
            options={[
              ['any', 'Any format'],
              ['in-person', 'In person'],
              ['virtual', 'Virtual'],
            ]}
          />
          <Select<EventHostFilter>
            label="Posted by"
            value={filters.host}
            onChange={(host) => set({ host })}
            options={[
              ['any', 'Any host'],
              ['school', 'Georgia Tech'],
              ['employers', 'Employers'],
            ]}
          />
          <Select<EventSort>
            label="Sort events"
            value={filters.sort}
            onChange={(sort) => set({ sort })}
            options={[
              ['date', 'By date'],
              ['match', 'Best match'],
            ]}
          />
        </div>
        {kinds.length > 0 && (
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="sr">Kind of event</legend>
            {kinds.map(({ kind, count }) => {
              const on = filters.kinds.includes(kind);
              return (
                <Toggle
                  key={kind}
                  on={on}
                  count={count}
                  onClick={() =>
                    set({
                      kinds: on
                        ? filters.kinds.filter((value) => value !== kind)
                        : [...filters.kinds, kind],
                    })
                  }
                >
                  {kind}
                </Toggle>
              );
            })}
          </fieldset>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {(dismissedCount > 0 || filters.dismissed) && (
            <Toggle
              on={filters.dismissed}
              count={dismissedCount}
              onClick={() => set({ dismissed: !filters.dismissed })}
            >
              Dismissed
            </Toggle>
          )}
          <p
            className="text-[0.78125rem] text-ink-3 tabular-nums"
            aria-live="polite"
          >
            {ordered.length} of {pool.length}{' '}
            {pool.length === 1 ? 'event' : 'events'}
          </p>
          {filtered && (
            <button type="button" className="textlink" onClick={clear}>
              Clear filters
            </button>
          )}
        </div>
      </fieldset>

      {!ordered.length ? (
        filtered ? (
          <Empty onClear={clear}>No events match these filters.</Empty>
        ) : (
          <Empty>
            {synced
              ? 'No upcoming events in Handshake’s latest read.'
              : 'Campus events appear here after the first read.'}
          </Empty>
        )
      ) : groups ? (
        <div className="space-y-9">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className="section-label mb-1.5">{group.label}</h3>
              <ul className="rule-rows">
                {group.items.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    now={now}
                    showDay={false}
                    onFlag={(flags) => onFlag(event.id, flags)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="rule-rows">
          {ordered.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              now={now}
              showDay
              onFlag={(flags) => onFlag(event.id, flags)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
