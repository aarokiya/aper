'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { updateStudyProgress } from '@/lib/study/progress-client';
import type { StudyPrefs } from '@/lib/study/prefs-schema';
import {
  intervalPreview,
  rate,
  setSuspended,
  undoRating,
  userCardItems,
  type QueueEntry,
  type SrsGrade,
  type StudyItem,
  type UndoToken,
} from '@/lib/study/srs';
import type { SrsMemory, StudyCourseState } from '@/lib/study/types';
import { WithProgress } from '../with-progress';
import { refreshNow, useNow } from './clock';
import {
  isControlTarget,
  isTypingTarget,
  ItemView,
  KIND_LABEL,
  RatingBar,
  suggestedGrade,
  type ItemResult,
} from './item-views';

export type SessionCourse = {
  cid: string;
  code: string;
  math: boolean;
  codeLang?: string;
  initial: StudyCourseState;
  items: StudyItem[];
};

type SessionProps = {
  courses: SessionCourse[];
  /** built by the caller; read once at mount */
  entries: QueueEntry[];
  prefs: StudyPrefs;
  /** false = practice without schedule changes */
  reschedule: boolean;
  title: string;
  onExit: () => void;
};

/** A learning item due this soon comes back in this session. */
const LEARN_AHEAD_MS = 20 * 60_000;
/** Other items shown before a learning item comes back. */
const REQUEUE_GAP = 3;
/** Longest time counted for one item (walking away doesn't inflate stats). */
const ITEM_MS_CAP = 60_000;

type Step =
  | {
      kind: 'rate';
      entry: QueueEntry;
      token: UndoToken;
      ok: boolean;
      queue: QueueEntry[];
    }
  | {
      kind: 'suspend';
      entry: QueueEntry;
      prev: SrsMemory | undefined;
      queue: QueueEntry[];
    };

const entryId = (entry: QueueEntry) => `${entry.cid}\u0001${entry.key}`;

/**
 * One review session over any number of courses: one item at a time, four
 * FSRS ratings, undo, learning steps re-queued within the session, and a
 * summary at the end. Progress is read live from the shared store.
 */
export function ReviewSession(props: SessionProps) {
  const seeds = useMemo(
    () => props.courses.map((course) => ({ id: course.cid, initial: course.initial })),
    [props.courses],
  );
  return (
    <WithProgress seeds={seeds}>
      {(states) => <Session {...props} states={states} />}
    </WithProgress>
  );
}

function elapsedText(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Session({
  courses,
  entries,
  prefs,
  reschedule,
  title,
  onExit,
  states,
}: SessionProps & { states: StudyCourseState[] }) {
  const now = useNow();
  const [queue, setQueue] = useState(entries);
  const [steps, setSteps] = useState<Step[]>([]);
  const [suspended, setSuspendedIds] = useState<string[]>([]);
  const [result, setResult] = useState<ItemResult | null>(null);
  const [shown, setShown] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const shownAt = useRef(0);

  const courseIndex = useMemo(
    () => new Map(courses.map((course, i) => [course.cid, i])),
    [courses],
  );
  const contentIndex = useMemo(
    () => courses.map((course) => new Map(course.items.map((item) => [item.key, item]))),
    [courses],
  );
  const userIndex = courses.map(
    (course, i) =>
      new Map(
        userCardItems(course.cid, states[i].uc).map((item) => [item.key, item]),
      ),
  );
  const find = (entry: QueueEntry): StudyItem | null => {
    const i = courseIndex.get(entry.cid);
    if (i === undefined) return null;
    return contentIndex[i].get(entry.key) ?? userIndex[i].get(entry.key) ?? null;
  };

  const pending = queue.filter(
    (entry) => !suspended.includes(entryId(entry)) && find(entry) !== null,
  );
  const current = pending[0] ?? null;
  const item = current ? find(current) : null;
  const ci = current ? (courseIndex.get(current.cid) ?? 0) : 0;
  const course = courses[ci];
  const state = states[ci];
  const currentId = current ? entryId(current) : '';

  useEffect(() => {
    shownAt.current = Date.now();
  }, [shown, currentId]);

  const rated = steps.filter((step) => step.kind === 'rate');
  const done = steps.length;

  const rateCurrent = (grade: SrsGrade) => {
    if (!current || !item || !result) return;
    const at = Date.now();
    const ms = Math.min(ITEM_MS_CAP, Math.max(0, at - shownAt.current));
    const out: Array<{ token: UndoToken; mem: SrsMemory | undefined }> = [];
    updateStudyProgress(current.cid, (draft) => {
      const token = rate(draft, item, grade, at, prefs, {
        answer: result.answer,
        ok: result.ok,
        ms,
        reschedule,
      });
      out.push({ token, mem: draft.srs[item.key] });
    });
    const [{ token, mem }] = out;
    let rest = pending.slice(1);
    if (
      reschedule &&
      mem &&
      (mem.st === 1 || mem.st === 3) &&
      mem.due <= at + LEARN_AHEAD_MS
    ) {
      const gap = Math.min(REQUEUE_GAP, rest.length);
      rest = [
        ...rest.slice(0, gap),
        { cid: current.cid, key: current.key, isNew: false },
        ...rest.slice(gap),
      ];
    }
    setSteps([
      ...steps,
      {
        kind: 'rate',
        entry: current,
        token,
        ok: result.ok ?? grade > 1,
        queue: pending,
      },
    ]);
    setQueue(rest);
    setResult(null);
    setShown((n) => n + 1);
    if (!rest.length) setEndedAt(at);
    refreshNow();
  };

  const suspend = () => {
    if (!current || !item) return;
    const prev = state.srs[item.key];
    updateStudyProgress(current.cid, (draft) =>
      setSuspended(draft, item, true, Date.now(), prefs),
    );
    setSuspendedIds([...suspended, entryId(current)]);
    setSteps([
      ...steps,
      { kind: 'suspend', entry: current, prev: prev && { ...prev }, queue: pending },
    ]);
    const rest = pending.slice(1);
    setQueue(rest);
    setResult(null);
    setShown((n) => n + 1);
    if (!rest.length) setEndedAt(Date.now());
  };

  const undo = () => {
    const last = steps.at(-1);
    if (!last) return;
    if (last.kind === 'rate')
      updateStudyProgress(last.entry.cid, (draft) => undoRating(draft, last.token));
    else {
      updateStudyProgress(last.entry.cid, (draft) => {
        if (last.prev) draft.srs[last.entry.key] = { ...last.prev };
        else delete draft.srs[last.entry.key];
      });
      setSuspendedIds(suspended.filter((id) => id !== entryId(last.entry)));
    }
    setSteps(steps.slice(0, -1));
    setQueue(last.queue);
    setResult(null);
    setShown((n) => n + 1);
    setEndedAt(null);
    refreshNow();
  };

  const plainCard =
    item !== null &&
    (item.kind === 'card' || item.kind === 'mine') &&
    !(item.card ?? item.mine)?.a?.length;
  const suggested = suggestedGrade(result);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target)
      )
        return;
      const key = event.key;
      if (key === 'u' || key === 'U') {
        if (!steps.length) return;
        event.preventDefault();
        undo();
        return;
      }
      if (!item) return;
      if (result && ['1', '2', '3', '4'].includes(key)) {
        event.preventDefault();
        rateCurrent(Number(key) as SrsGrade);
        return;
      }
      if (isControlTarget(event.target)) return;
      if (!result && plainCard && (key === ' ' || key === 'Enter')) {
        event.preventDefault();
        setResult({});
        return;
      }
      if (result && suggested && key === 'Enter') {
        event.preventDefault();
        rateCurrent(suggested);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const finished = done > 0 && (!current || !item);
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (finished) backButton.current?.focus({ preventScroll: true });
  }, [finished]);

  // Counts left by kind of review.
  let newLeft = 0;
  let learningLeft = 0;
  let reviewLeft = 0;
  for (const entry of pending) {
    const i = courseIndex.get(entry.cid) ?? 0;
    const st = states[i].srs[entry.key]?.st;
    if (entry.isNew && (st === undefined || st === 0)) newLeft += 1;
    else if (st === 1 || st === 3) learningLeft += 1;
    else reviewLeft += 1;
  }
  const total = done + pending.length;
  const multi = courses.length > 1;

  if (!current && !done)
    return (
      <div className="rv">
        <div className="rv-empty">
          <h2>{title}</h2>
          <p>Nothing to review right now.</p>
          <button type="button" className="pill pill-primary" onClick={onExit}>
            Back
          </button>
        </div>
      </div>
    );

  if (!current || !item) {
    const reviewed = new Set(rated.map((step) => entryId(step.entry))).size;
    const right = rated.filter((step) => step.ok).length;
    const pct = rated.length ? Math.round((right / rated.length) * 100) : 0;
    const minutes = ((endedAt ?? startedAt) - startedAt) / 60_000;
    return (
      <div className="rv">
        <div className="rv-done" aria-live="polite">
          <h2>{title}: done</h2>
          <dl className="rv-sum">
            <div>
              <dt>Items reviewed</dt>
              <dd>{reviewed}</dd>
            </div>
            <div>
              <dt>Right</dt>
              <dd>{rated.length ? `${pct}%` : '–'}</dd>
            </div>
            <div>
              <dt>Minutes</dt>
              <dd>{minutes < 1 ? '<1' : Math.round(minutes)}</dd>
            </div>
          </dl>
          {!reschedule && (
            <p className="rv-note">Practice only: your schedule was not changed.</p>
          )}
          <div className="rv-actions">
            <button type="button" className="pill" onClick={undo}>
              Undo last <span className="kbd" aria-hidden="true">U</span>
            </button>
            <button
              ref={backButton}
              type="button"
              className="pill pill-primary"
              onClick={onExit}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const preview =
    result && prefs.showIntervals && reschedule && now
      ? intervalPreview(item, state, prefs, now)
      : null;
  const ucId = item.key.slice(2);

  return (
    <div className="rv">
      <div className="rv-head">
        <h2 className="rv-title">{title}</h2>
        <div className="rv-counts" aria-label="Left in this session">
          <span className="rv-c new" title="New">
            {newLeft} <span>new</span>
          </span>
          <span className="rv-c lrn" title="Learning">
            {learningLeft} <span>learning</span>
          </span>
          <span className="rv-c rev" title="Review">
            {reviewLeft} <span>review</span>
          </span>
        </div>
        <span className="sp" />
        <span className="rv-time" aria-label="Time in this session">
          {elapsedText(now ? now - startedAt : 0)}
        </span>
        <button
          type="button"
          className="pill pill-sm"
          disabled={!steps.length}
          aria-keyshortcuts="U"
          onClick={undo}
        >
          Undo <span className="kbd" aria-hidden="true">U</span>
        </button>
        <button type="button" className="pill pill-sm" onClick={onExit}>
          End session
        </button>
      </div>
      <progress
        className="rv-bar"
        aria-label="Session progress"
        max={Math.max(1, total)}
        value={done}
      />
      {!reschedule && (
        <p className="rv-note">Practice only: ratings won&apos;t change your schedule.</p>
      )}

      <section className="rv-item" aria-label={`${KIND_LABEL[item.kind]}: ${item.label}`}>
        <div className="rv-meta">
          {multi && <span className="rv-code">{course.code}</span>}
          <span>{KIND_LABEL[item.kind]}</span>
          {item.week !== null && <span>Week {item.week}</span>}
          {current.isNew && !steps.some((s) => entryId(s.entry) === currentId) && (
            <span className="rv-new">New</span>
          )}
        </div>
        <ItemView
          key={`${shown}:${currentId}`}
          item={item}
          math={course.math}
          codeLang={course.codeLang}
          shuffleSeed={
            prefs.shuffleChoices
              ? `${item.key}:${state.srs[item.key]?.r ?? 0}`
              : null
          }
          result={result}
          onResult={setResult}
        />
        {result && (
          <RatingBar preview={preview} suggested={suggested} onRate={rateCurrent} />
        )}
        <div className="rv-foot">
          {item.href && (
            <Link className="textlink" href={item.href}>
              Open where it lives
            </Link>
          )}
          {item.kind === 'mine' && (
            <Link
              className="textlink"
              href={`/study/${encodeURIComponent(current.cid)}/cards?tab=mine#${encodeURIComponent(ucId)}`}
            >
              Edit
            </Link>
          )}
          <button type="button" className="textlink" onClick={suspend}>
            Suspend
          </button>
        </div>
      </section>
    </div>
  );
}
