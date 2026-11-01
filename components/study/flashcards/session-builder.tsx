'use client';

import { useId, useMemo, useState } from 'react';
import { weekName } from '@/components/study/format';
import {
  coursePrefs,
  customSessionSchema,
  effectiveSources,
  ITEM_KINDS,
  type CustomSession,
  type ItemKind,
  type StudyPrefs,
} from '@/lib/study/prefs-schema';
import { buildCustomQueue, type StudyItem } from '@/lib/study/srs';
import type { StudyCourseState } from '@/lib/study/types';

/** A course as the builder offers it: weeks (with the exams they hold), exams, and the current week. */
export type BuilderCourse = {
  cid: string;
  code: string;
  weeks: Array<{ n: number; label: string; title: string; exams: string[] }>;
  exams: Array<{ id: string; title: string }>;
  /** current week number, for "This week" */
  current?: number;
};

/** Live queue input for one course: content items plus the student's own cards. */
export type CourseInput = {
  cid: string;
  items: StudyItem[];
  state: StudyCourseState;
};

export type Preset = StudyPrefs['presets'][number];

/** Most presets the settings keep. */
export const MAX_PRESETS = 30;

export const KIND_LABELS: Record<ItemKind, string> = {
  card: 'Cards',
  quick: 'Quick checks',
  practice: 'Quiz questions',
  parsons: 'Arrange code',
  mine: 'My cards',
};

const PICKS: Array<{ id: CustomSession['pick']; label: string; hint: string }> =
  [
    { id: 'due', label: 'Due', hint: 'what your schedule has due today' },
    { id: 'new', label: 'New', hint: 'items you have not studied yet' },
    {
      id: 'weak',
      label: 'Weak',
      hint: 'lapsed, fading, or last answered wrong',
    },
    { id: 'all', label: 'Everything', hint: 'every item in range' },
    {
      id: 'ahead',
      label: 'Review ahead',
      hint: 'reviews coming due in the next few days',
    },
  ];

const PICK_LABEL = Object.fromEntries(
  PICKS.map((pick) => [pick.id, pick.label]),
) as Record<CustomSession['pick'], string>;

const LIMITS = [10, 20, 50, 100, 0];

/** Just the session fields of a preset. */
export function sessionOf(preset: Preset): CustomSession {
  return {
    cids: preset.cids,
    weeks: preset.weeks,
    kinds: preset.kinds,
    pick: preset.pick,
    aheadDays: preset.aheadDays,
    limit: preset.limit,
    order: preset.order,
    reschedule: preset.reschedule,
  };
}

/** Items a session would hold right now. */
export function sessionSize(
  inputs: CourseInput[],
  prefs: StudyPrefs,
  now: number,
  session: CustomSession,
) {
  return buildCustomQueue({ courses: inputs, prefs, now, session }).length;
}

/** "ABC 1234, weeks 1 to 6, due, Cards and Quiz questions, up to 20, practice only" */
export function describeSession(
  session: CustomSession,
  codes: Record<string, string>,
) {
  const parts: string[] = [];
  parts.push(
    session.cids.length
      ? session.cids.map((cid) => codes[cid] ?? cid).join(', ')
      : 'Daily review courses',
  );
  parts.push(
    session.weeks
      ? session.weeks[0] === session.weeks[1]
        ? `week ${session.weeks[0]}`
        : `weeks ${session.weeks[0]} to ${session.weeks[1]}`
      : 'all weeks so far',
  );
  parts.push(
    session.pick === 'ahead'
      ? `review ${session.aheadDays} ${session.aheadDays === 1 ? 'day' : 'days'} ahead`
      : PICK_LABEL[session.pick].toLowerCase(),
  );
  if (session.kinds.length < ITEM_KINDS.length)
    parts.push(
      session.kinds.length
        ? session.kinds.map((kind) => KIND_LABELS[kind]).join(', ')
        : 'no item kinds',
    );
  if (session.limit > 0) parts.push(`up to ${session.limit}`);
  if (session.order === 'week') parts.push('by week');
  if (!session.reschedule) parts.push('practice only');
  return parts.join(' · ');
}

/** The kinds turned on in Study settings (for one course, its overrides too). */
function defaultKinds(prefs: StudyPrefs, cids: string[]): ItemKind[] {
  const sources =
    cids.length === 1 ? effectiveSources(prefs, cids[0]) : prefs.sources;
  const kinds = ITEM_KINDS.filter((kind) => sources[kind]);
  return kinds.length ? kinds : [...ITEM_KINDS];
}

/**
 * Build a custom study session: courses, weeks, item kinds, which items
 * (due, new, weak, everything, or ahead), size, order, and whether answers
 * update the schedule. Shows how many items the choice holds right now.
 */
export function SessionBuilder({
  courses,
  prefs,
  inputs,
  now,
  onStart,
  onSave,
}: {
  courses: BuilderCourse[];
  prefs: StudyPrefs;
  /** live items and progress per course, for the size of the session */
  inputs: CourseInput[];
  now: number;
  onStart: (session: CustomSession) => void;
  /** offer "Save as preset" */
  onSave?: (session: CustomSession, name: string) => void;
}) {
  const uid = useId();
  const single = courses.length === 1;
  const [cids, setCids] = useState<string[]>(() => {
    if (single) return [courses[0].cid];
    const inReview = courses
      .filter((course) => coursePrefs(prefs, course.cid).review)
      .map((course) => course.cid);
    return inReview.length ? inReview : courses.map((course) => course.cid);
  });
  const [weeks, setWeeks] = useState<CustomSession['weeks']>(null);
  const [kinds, setKinds] = useState<ItemKind[]>(() =>
    defaultKinds(
      prefs,
      single ? [courses[0].cid] : [],
    ),
  );
  const [pick, setPick] = useState<CustomSession['pick']>('due');
  const [aheadDays, setAheadDays] = useState(3);
  const [limit, setLimit] = useState(20);
  const [order, setOrder] = useState<CustomSession['order']>('mixed');
  const [reschedule, setReschedule] = useState(true);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');

  const chosen = courses.filter((course) => cids.includes(course.cid));
  const scope = chosen.length ? chosen : courses;

  // Week numbers across the chosen courses, labeled by the first course that has each.
  const byN = new Map<number, { n: number; label: string; title: string }>();
  for (const course of scope)
    for (const week of course.weeks)
      if (!byN.has(week.n)) byN.set(week.n, week);
  const weekOptions = [...byN.values()].sort((a, b) => a.n - b.n);
  const first = weekOptions[0]?.n ?? 1;
  const last = weekOptions[weekOptions.length - 1]?.n ?? first;
  const currents = scope.flatMap((course) =>
    course.current === undefined ? [] : [course.current],
  );
  const current = currents.length ? Math.max(...currents) : null;

  const quickPicks: Array<{ label: string; weeks: CustomSession['weeks'] }> =
    [];
  if (current !== null)
    quickPicks.push({ label: 'This week', weeks: [current, current] });
  quickPicks.push({ label: 'All so far', weeks: null });
  for (const course of scope) {
    const start = Math.min(...course.weeks.map((week) => week.n));
    for (const exam of course.exams) {
      const held = course.weeks.find((week) => week.exams.includes(exam.id));
      if (!held) continue;
      quickPicks.push({
        label: `Up to ${scope.length > 1 ? `${course.code} ` : ''}${exam.title}`,
        weeks: [start, held.n],
      });
    }
  }

  const session = useMemo(
    (): CustomSession =>
      customSessionSchema.parse({
        cids,
        weeks,
        kinds,
        pick,
        aheadDays,
        limit,
        order,
        reschedule,
      }),
    [cids, weeks, kinds, pick, aheadDays, limit, order, reschedule],
  );
  const size = useMemo(
    () =>
      session.cids.length && session.kinds.length
        ? sessionSize(inputs, prefs, now, session)
        : 0,
    [inputs, prefs, now, session],
  );

  const from = weeks ? weeks[0] : first;
  const to = weeks ? weeks[1] : (current ?? last);
  const full = prefs.presets.length >= MAX_PRESETS;

  const emptyReason = !cids.length
    ? 'Pick at least one course.'
    : !kinds.length
      ? 'Pick at least one kind of item.'
      : 'Nothing matches right now. Try another pick or more weeks.';

  return (
    <div className="sb">
      {!single && (
        <fieldset className="sb-row">
          <legend>Courses</legend>
          <div className="sb-chips">
            {courses.map((course) => (
              <label key={course.cid}>
                <input
                  type="checkbox"
                  checked={cids.includes(course.cid)}
                  onChange={(event) =>
                    setCids(
                      courses
                        .map((item) => item.cid)
                        .filter((cid) =>
                          cid === course.cid
                            ? event.target.checked
                            : cids.includes(cid),
                        ),
                    )
                  }
                />
                <span>{course.code}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="sb-row">
        <legend>Weeks</legend>
        <div className="sb-range">
          <label>
            <span>From</span>
            <select
              value={from}
              onChange={(event) => {
                const value = Number(event.target.value);
                setWeeks([value, Math.max(value, to)]);
              }}
            >
              {weekOptions.map((week) => (
                <option key={week.n} value={week.n}>
                  {weekName(week)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>To</span>
            <select
              value={to}
              onChange={(event) => {
                const value = Number(event.target.value);
                setWeeks([Math.min(from, value), value]);
              }}
            >
              {weekOptions.map((week) => (
                <option key={week.n} value={week.n}>
                  {weekName(week)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="sb-quick">
          {quickPicks.map((item, index) => (
            <button
              key={`${index}-${item.label}`}
              type="button"
              className="pill pill-sm"
              aria-pressed={
                weeks === null || item.weeks === null
                  ? weeks === item.weeks
                  : weeks[0] === item.weeks[0] && weeks[1] === item.weeks[1]
              }
              onClick={() => setWeeks(item.weeks)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="sb-note">
          {weeks
            ? 'Formula cards and your cards without a week are left out of a week range.'
            : 'Every week that has started, plus formula cards and your own cards.'}
        </p>
      </fieldset>

      <fieldset className="sb-row">
        <legend>Include</legend>
        <div className="sb-chips">
          {ITEM_KINDS.map((kind) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={kinds.includes(kind)}
                onChange={(event) =>
                  setKinds(
                    ITEM_KINDS.filter((item) =>
                      item === kind
                        ? event.target.checked
                        : kinds.includes(item),
                    ),
                  )
                }
              />
              <span>{KIND_LABELS[kind]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="sb-row">
        <legend>Pick</legend>
        <div className="sb-chips">
          {PICKS.map((item) => (
            <label key={item.id} title={item.hint}>
              <input
                type="radio"
                name={`${uid}-pick`}
                checked={pick === item.id}
                onChange={() => setPick(item.id)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <p className="sb-note">
          {PICKS.find((item) => item.id === pick)?.hint}
          {pick === 'ahead' && (
            <>
              :{' '}
              <label className="sb-inline">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={aheadDays}
                  onChange={(event) =>
                    setAheadDays(
                      Math.min(
                        60,
                        Math.max(1, Math.round(Number(event.target.value) || 1)),
                      ),
                    )
                  }
                />{' '}
                {aheadDays === 1 ? 'day' : 'days'}
              </label>
            </>
          )}
          .
        </p>
      </fieldset>

      <div className="sb-row sb-split">
        <label className="sb-field">
          <span>At most</span>
          <select
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          >
            {LIMITS.map((value) => (
              <option key={value} value={value}>
                {value === 0 ? 'All' : `${value} items`}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="sb-field">
          <legend>Order</legend>
          <div className="sb-chips">
            {(
              [
                ['mixed', 'Mixed'],
                ['week', 'By week'],
              ] as const
            ).map(([id, label]) => (
              <label key={id}>
                <input
                  type="radio"
                  name={`${uid}-order`}
                  checked={order === id}
                  onChange={() => setOrder(id)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="sb-row">
        <label className="sb-check">
          <input
            type="checkbox"
            checked={reschedule}
            onChange={(event) => setReschedule(event.target.checked)}
          />
          <span>
            Update my schedule
            <small>
              {reschedule
                ? 'Ratings count as reviews and move due dates.'
                : 'Practice only: due dates stay as they are.'}
            </small>
          </span>
        </label>
      </div>

      <div className="sb-go">
        <p className="sb-size" aria-live="polite">
          {size > 0 ? (
            <>
              <b>{size}</b> {size === 1 ? 'item' : 'items'} in this session
            </>
          ) : (
            emptyReason
          )}
        </p>
        <button
          type="button"
          className="pill pill-primary"
          disabled={size === 0}
          onClick={() => onStart(session)}
        >
          Start{size > 0 ? ` (${size})` : ''}
        </button>
      </div>

      {onSave && (
        <form
          className="sb-save"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed || full) return;
            onSave(session, trimmed.slice(0, 80));
            setName('');
            setSaved(`Saved “${trimmed.slice(0, 80)}”.`);
          }}
        >
          <label htmlFor={`${uid}-name`} className="sr">
            Preset name
          </label>
          <input
            id={`${uid}-name`}
            type="text"
            placeholder="Preset name"
            maxLength={80}
            value={name}
            disabled={full}
            onChange={(event) => {
              setName(event.target.value);
              setSaved('');
            }}
          />
          <button
            type="submit"
            className="pill pill-sm"
            disabled={full || !name.trim()}
          >
            Save as preset
          </button>
          <span className="sb-note" aria-live="polite">
            {full
              ? `You have ${MAX_PRESETS} presets, the most there can be. Delete one to save another.`
              : saved}
          </span>
        </form>
      )}
    </div>
  );
}

/** Saved sessions with how many items each holds now; Start and Delete. */
export function PresetList({
  presets,
  codes,
  inputs,
  prefs,
  now,
  onStart,
  onDelete,
}: {
  presets: Preset[];
  codes: Record<string, string>;
  inputs: CourseInput[];
  prefs: StudyPrefs;
  now: number;
  onStart: (session: CustomSession) => void;
  onDelete: (id: string) => void;
}) {
  if (!presets.length)
    return (
      <p className="emptystate">
        No presets yet. Set up a session below and save it to start it in one
        click next time.
      </p>
    );
  return (
    <ul className="presets">
      {presets.map((preset) => {
        const session = sessionOf(preset);
        const size = sessionSize(inputs, prefs, now, session);
        return (
          <li key={preset.id}>
            <div className="pr-t">
              <b>{preset.name}</b>
              <span>{describeSession(session, codes)}</span>
            </div>
            <span className="pr-n">
              {size} {size === 1 ? 'item' : 'items'}
            </span>
            <button
              type="button"
              className="pill pill-sm"
              disabled={size === 0}
              onClick={() => onStart(session)}
              aria-label={`Start ${preset.name}`}
            >
              Start
            </button>
            <button
              type="button"
              className="textlink"
              onClick={() => onDelete(preset.id)}
              aria-label={`Delete ${preset.name}`}
            >
              Delete
            </button>
          </li>
        );
      })}
    </ul>
  );
}
