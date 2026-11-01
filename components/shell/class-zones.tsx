'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  classStatus,
  statusText,
  type ClassStatus,
  type ClassStatusLevel,
  type ClassWork,
} from '@/lib/study/class-status';
import type { ClassLink } from '@/lib/study/nav';
import { useStudyProgress } from '@/lib/study/progress-client';
import type { StudyCourseState } from '@/lib/study/types';
import { cn } from '@/lib/utils';
import type { ShellData } from './shell-data';

const WORK_CHANGED_EVENT = 'aper:work-changed';

/** Call after changing a task locally so the rail's class dots re-read open work. */
export function notifyWorkChanged() {
  window.dispatchEvent(new Event(WORK_CHANGED_EVENT));
}

type Live = { today: string; work: Record<number, ClassWork> };
type Zone = 'study' | 'classes';
type Move = { toStudy: boolean; run: (refocus: boolean) => void };

const DRAG_TYPE = 'application/x-aper-class';

const DOT: Record<ClassStatusLevel, string> = {
  behind: 'bg-bad',
  today: 'bg-warn',
  clear: 'bg-good',
};

const ROW =
  'relative flex items-baseline gap-2 py-[5px] text-ink-3 transition-colors hover:text-ink';
const ROW_ACTIVE =
  'text-ink before:absolute before:top-1/2 before:-left-[11px] before:size-[5px] before:-translate-y-1/2 before:rounded-full before:bg-ink';

/**
 * Open work and the local day, re-read on every navigation, window focus,
 * and local task change; the shell itself only renders on full loads.
 */
function useLive(data: ShellData, pathname: string): Live {
  const [live, setLive] = useState<Live>({
    today: data.today,
    work: data.work,
  });
  const [seed, setSeed] = useState(data);
  if (seed !== data) {
    // The server rendered the shell again (router.refresh): adopt it.
    setSeed(data);
    setLive({ today: data.today, work: data.work });
  }
  const navigated = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      void fetch('/api/rail', { cache: 'no-store', signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((value: Live | null) => {
          if (value) setLive(value);
        })
        .catch(() => undefined);
    // The first render already has fresh server data.
    if (navigated.current) load();
    navigated.current = true;
    window.addEventListener('focus', load);
    window.addEventListener(WORK_CHANGED_EVENT, load);
    return () => {
      controller.abort();
      window.removeEventListener('focus', load);
      window.removeEventListener(WORK_CHANGED_EVENT, load);
    };
  }, [pathname]);
  return live;
}

function ClassRow({
  item,
  href,
  active,
  status,
  move,
  onDragging,
}: {
  item: ClassLink;
  href: string;
  active: boolean;
  status: ClassStatus;
  /** set for classes with study materials, which can change zones */
  move?: Move;
  onDragging?: (studyId: string | null) => void;
}) {
  const text = statusText(status);
  const studyId = move ? item.studyId : null;
  const moveLabel = move
    ? `Move ${item.code} to ${move.toStudy ? 'Study' : 'Classes'}`
    : '';
  return (
    <div className="group relative">
      <Link
        href={href}
        title={`${item.code}: ${item.name}. ${text}`}
        aria-current={active ? 'page' : undefined}
        onDragStart={(event) => {
          if (!studyId) return;
          event.dataTransfer.setData(DRAG_TYPE, studyId);
          event.dataTransfer.effectAllowed = 'move';
          onDragging?.(studyId);
        }}
        onDragEnd={() => onDragging?.(null)}
        className={cn(ROW, active && ROW_ACTIVE)}
      >
        <span
          className={cn(
            'inline-flex min-w-[74px] items-center text-sm',
            active && 'font-semibold',
          )}
        >
          {item.code}
          <span
            aria-hidden="true"
            data-status={status.level}
            className={cn(
              'relative -top-px ml-1.5 size-[5px] shrink-0 rounded-full',
              DOT[status.level],
            )}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-4">
          {item.name}
        </span>
        <span className="sr">, {text}</span>
      </Link>
      {move && studyId && (
        <button
          type="button"
          id={`rail-move-${studyId}`}
          onClick={() => move.run(true)}
          aria-label={moveLabel}
          title={moveLabel}
          className="absolute top-1/2 right-3.5 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-paper text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100"
        >
          {move.toStudy ? (
            <ArrowUp className="size-3.5" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3.5" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}

/**
 * Live progress for the Study zone's courses (each level subscribes to one
 * course through the shared store, so the hook count per component stays
 * fixed); the Overview row's dot needs every row's status at once.
 */
function StudyStates({
  seeds,
  index = 0,
  states = [],
  children,
}: {
  seeds: ReadonlyArray<{ id: string; initial: StudyCourseState | undefined }>;
  index?: number;
  states?: StudyCourseState[];
  children: (states: StudyCourseState[]) => React.ReactNode;
}) {
  if (index >= seeds.length) return children(states);
  return (
    <StudyStateLevel seeds={seeds} index={index} states={states}>
      {children}
    </StudyStateLevel>
  );
}

function StudyStateLevel({
  seeds,
  index,
  states,
  children,
}: {
  seeds: ReadonlyArray<{ id: string; initial: StudyCourseState | undefined }>;
  index: number;
  states: StudyCourseState[];
  children: (states: StudyCourseState[]) => React.ReactNode;
}) {
  const { state } = useStudyProgress(seeds[index].id, seeds[index].initial);
  return (
    <StudyStates seeds={seeds} index={index + 1} states={[...states, state]}>
      {children}
    </StudyStates>
  );
}

const RANK: Record<ClassStatusLevel, number> = { clear: 0, today: 1, behind: 2 };

/** One zone: heading, rows, and its drop-target state while a class is dragged. */
function ZoneList({
  label,
  accepts,
  over,
  empty,
  dropProps,
  children,
}: {
  label: string;
  /** a dragged class can be dropped here */
  accepts: boolean;
  over: boolean;
  empty: string | null;
  dropProps: React.HTMLAttributes<HTMLElement>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-1.5 text-xs font-medium text-ink-3">{label}</h2>
      <nav
        aria-label={label}
        className={cn(
          'flex flex-col gap-0.5 rounded-md outline-offset-4 transition-colors',
          accepts && 'outline-1 outline-rule-2 outline-dashed',
          over && 'bg-wash outline-ink-3',
        )}
        {...dropProps}
      >
        {children}
        {accepts ? (
          <p className="py-[5px] text-xs text-ink-4">Drop to move to {label}</p>
        ) : (
          empty && <p className="py-[5px] text-xs text-ink-4">{empty}</p>
        )}
      </nav>
    </div>
  );
}

/**
 * The rail's classes: a Study zone for classes with Study Hub materials
 * (opens the study side; the dot follows study pace and Canvas work) above
 * every other class (opens the Canvas course; the dot follows Canvas work).
 * Classes with materials move between the two with a hover button or by
 * dragging; the Study zone is saved locally.
 */
export function ClassZones({
  data,
  pathname,
}: {
  data: ShellData;
  pathname: string;
}) {
  const { study } = data;
  const live = useLive(data, pathname);
  const [zone, setZone] = useState(study.zone);
  const [seedZone, setSeedZone] = useState(study.zone);
  if (seedZone !== study.zone) {
    setSeedZone(study.zone);
    setZone(study.zone);
  }
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Zone | null>(null);
  const [announce, setAnnounce] = useState('');
  const [error, setError] = useState('');
  const saving = useRef<Promise<void>>(Promise.resolve());

  const hasHub = Boolean(study.title);
  const activeStudyId = pathname.match(/^\/study\/([^/]+)/)?.[1] ?? null;
  const overviewCurrent = pathname === '/study';
  const dailyCurrent = pathname === '/study/daily';

  const inZone = new Set(zone);
  const byStudyId = new Map(
    study.classes.flatMap((item) =>
      item.studyId ? [[item.studyId, item] as const] : [],
    ),
  );
  const studyItems = zone.flatMap((id) => byStudyId.get(id) ?? []);
  const otherItems = study.classes
    .filter((item) => !item.studyId || !inZone.has(item.studyId))
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));

  const moveTo = (item: ClassLink, toStudy: boolean): Move | undefined => {
    const id = item.studyId;
    if (!hasHub || !id) return undefined;
    return {
      toStudy,
      run: (refocus) => {
        if (inZone.has(id) === toStudy) return;
        const previous = zone;
        const next = toStudy
          ? [...zone, id]
          : zone.filter((value) => value !== id);
        setZone(next);
        setError('');
        setAnnounce(`Moved ${item.code} to ${toStudy ? 'Study' : 'Classes'}.`);
        if (refocus)
          window.requestAnimationFrame(() =>
            document.getElementById(`rail-move-${id}`)?.focus(),
          );
        saving.current = saving.current.then(() =>
          fetch('/api/rail', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studyZone: next }),
          })
            .then((response) => {
              if (!response.ok) throw new Error(String(response.status));
            })
            .catch(() => {
              setZone(previous);
              setAnnounce('');
              setError(
                `${item.code} could not be moved. Check that _aper is running.`,
              );
            }),
        );
      },
    };
  };

  /** Only the zone a dragged class can join accepts the drop. */
  const dropTarget = (target: Zone) => {
    const accepts =
      dragging !== null && inZone.has(dragging) === (target === 'classes');
    const dropProps: React.HTMLAttributes<HTMLElement> = {
      onDragOver: (event) => {
        if (!accepts) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (over !== target) setOver(target);
      },
      onDragLeave: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOver((value) => (value === target ? null : value));
      },
      onDrop: (event) => {
        if (!accepts) return;
        event.preventDefault();
        const item = byStudyId.get(event.dataTransfer.getData(DRAG_TYPE));
        if (item) moveTo(item, target === 'study')?.run(false);
        setDragging(null);
        setOver(null);
      },
    };
    return { accepts, over: over === target, dropProps };
  };

  const onDragging = (studyId: string | null) => {
    setDragging(studyId);
    if (!studyId) setOver(null);
  };

  const classes = (
    <ZoneList
      label="Classes"
      empty={hasHub && !otherItems.length ? 'No other classes.' : null}
      {...dropTarget('classes')}
    >
      {otherItems.map((item) => {
        const href =
          item.canvasCourseId !== null
            ? `/courses/${item.canvasCourseId}`
            : `/study/${item.studyId}`;
        return (
          <ClassRow
            key={item.key}
            item={item}
            href={href}
            active={
              pathname === href ||
              pathname.startsWith(`${href}/`) ||
              (item.studyId !== null && activeStudyId === item.studyId)
            }
            status={classStatus({
              work:
                item.canvasCourseId === null
                  ? undefined
                  : live.work[item.canvasCourseId],
              today: live.today,
            })}
            move={moveTo(item, true)}
            onDragging={onDragging}
          />
        );
      })}
    </ZoneList>
  );

  if (!hasHub) return classes;

  const studyRows = studyItems.flatMap((item) => {
    const outline = item.studyId ? study.outlines[item.studyId] : undefined;
    return outline ? [{ item, outline }] : [];
  });

  return (
    <>
      <StudyStates
        seeds={studyRows.map(({ outline }) => ({
          id: outline.id,
          initial: study.progress[outline.id],
        }))}
      >
        {(states) => {
          const statuses = studyRows.map(({ outline }, index) =>
            classStatus({
              work:
                outline.canvasCourseId === null
                  ? undefined
                  : live.work[outline.canvasCourseId],
              study: { course: outline, state: states[index] },
              today: live.today,
            }),
          );
          // The hub's Overview dot: the worst course, and why.
          const worst = statuses.reduce<ClassStatusLevel>(
            (level, status) =>
              RANK[status.level] > RANK[level] ? status.level : level,
            'clear',
          );
          const overviewText =
            worst === 'clear'
              ? 'All courses caught up'
              : studyRows
                  .flatMap(({ item }, index) =>
                    statuses[index].level === 'clear'
                      ? []
                      : [`${item.code}: ${statusText(statuses[index])}`],
                  )
                  .join('. ');
          return (
            <ZoneList
              label="Study"
              empty={
                studyItems.length
                  ? null
                  : 'Move a class with study materials here.'
              }
              {...dropTarget('study')}
            >
              <Link
                href="/study"
                aria-current={overviewCurrent ? 'page' : undefined}
                className={cn(ROW, overviewCurrent && ROW_ACTIVE)}
              >
                <span
                  className={cn(
                    'inline-flex min-w-[74px] items-center text-sm',
                    overviewCurrent && 'font-semibold',
                  )}
                >
                  Overview
                  <span
                    // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- the hub's status dot: a CSS circle with a spoken status
                    role="img"
                    title={overviewText}
                    aria-label={overviewText}
                    data-status={worst}
                    className={cn(
                      'relative -top-px ml-1.5 size-[5px] shrink-0 rounded-full',
                      DOT[worst],
                    )}
                  />
                </span>
                <span className="truncate text-xs text-ink-4">All courses</span>
              </Link>
              <Link
                href="/study/daily"
                aria-current={dailyCurrent ? 'page' : undefined}
                className={cn(ROW, dailyCurrent && ROW_ACTIVE)}
              >
                <span
                  className={cn(
                    'min-w-[74px] flex-1 text-sm',
                    dailyCurrent && 'font-semibold',
                  )}
                >
                  Daily review
                </span>
                {study.dailyDue > 0 && (
                  <span
                    className="text-xs text-ink tabular-nums"
                    aria-label={`${study.dailyDue} due`}
                  >
                    {study.dailyDue}
                  </span>
                )}
              </Link>
              {studyRows.map(({ item, outline }, index) => (
                <ClassRow
                  key={item.key}
                  item={item}
                  href={`/study/${outline.id}`}
                  active={activeStudyId === outline.id}
                  status={statuses[index]}
                  move={moveTo(item, false)}
                  onDragging={onDragging}
                />
              ))}
            </ZoneList>
          );
        }}
      </StudyStates>
      {classes}
      <p className="sr" aria-live="polite">
        {announce}
      </p>
      {error && (
        <p role="alert" className="-mt-3 text-[12.5px] text-bad">
          {error}
        </p>
      )}
    </>
  );
}
