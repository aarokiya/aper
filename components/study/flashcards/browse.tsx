'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { Html } from '@/components/study/html';
import { useNow } from '@/components/study/review/clock';
import { esc, plural, weekName } from '@/components/study/format';
import { practiceAnswerText } from '@/lib/study/model';
import type { ItemKind, StudyPrefs } from '@/lib/study/prefs-schema';
import { useStudyProgress } from '@/lib/study/progress-client';
import {
  isNewMemory,
  memoryOf,
  nextDayStart,
  resetItem,
  retrievability,
  setSuspended,
  studyDay,
  userCardItems,
  type StudyItem,
} from '@/lib/study/srs';
import type { SrsMemory, StudyCourseState } from '@/lib/study/types';
import { renderUserText } from '@/lib/study/user-text';

const PAGE_SIZE = 50;
const DAY = 86_400_000;

const KIND_LABEL: Record<ItemKind, string> = {
  card: 'Card',
  quick: 'Quick check',
  practice: 'Quiz question',
  parsons: 'Arrange code',
  mine: 'My card',
};

const KIND_FILTERS: Array<[ItemKind, string]> = [
  ['card', 'Cards'],
  ['quick', 'Quick checks'],
  ['practice', 'Quiz questions'],
  ['parsons', 'Arrange code'],
  ['mine', 'My cards'],
];

const STATE_FILTERS = {
  all: 'All',
  new: 'New',
  learning: 'Learning',
  review: 'Review',
  due: 'Due today',
  suspended: 'Suspended',
  lapsed: 'Lapsed (lapses ≥ 1)',
  weak: 'Weak (recall < 85%)',
} as const;

type StateFilter = keyof typeof STATE_FILTERS;

type Row = {
  item: StudyItem;
  mem: SrsMemory | null;
  isNew: boolean;
  recall: number;
  dueToday: boolean;
};

type BrowseCourse = {
  code: string;
  math: boolean;
  codeLang?: string;
  weeks: Array<{ n: number; label: string; title: string }>;
};

function stateLabel(row: Row) {
  if (row.mem?.sus) return 'Suspended';
  if (row.isNew || !row.mem) return 'New';
  if (row.mem.st === 1) return 'Learning';
  if (row.mem.st === 3) return 'Relearning';
  return 'Review';
}

function dueLabel(row: Row, now: number, dayStartsAt: number) {
  if (row.isNew || !row.mem) return '—';
  // Whole days between the two study days (`YYYY-MM-DD` parse as UTC midnight).
  const gap = Math.round(
    (Date.parse(studyDay(row.mem.due, dayStartsAt)) -
      Date.parse(studyDay(now, dayStartsAt))) /
      DAY,
  );
  if (gap > 0) return `in ${gap}d`;
  if (gap < 0) return `${-gap}d overdue`;
  return 'today';
}

function matches(
  row: Row,
  filters: { week: string; kind: string; state: StateFilter; query: string },
) {
  const { item, mem } = row;
  if (filters.week === 'none' && item.week !== null) return false;
  if (
    filters.week !== 'all' &&
    filters.week !== 'none' &&
    item.week !== Number(filters.week)
  )
    return false;
  if (filters.kind !== 'all' && item.kind !== filters.kind) return false;
  if (filters.query && !item.label.toLowerCase().includes(filters.query))
    return false;
  switch (filters.state) {
    case 'new':
      return row.isNew && !mem?.sus;
    case 'learning':
      return !row.isNew && !mem?.sus && mem?.st !== 2;
    case 'review':
      return !row.isNew && !mem?.sus && mem?.st === 2;
    case 'due':
      return row.dueToday;
    case 'suspended':
      return Boolean(mem?.sus);
    case 'lapsed':
      return (mem?.l ?? 0) >= 1;
    case 'weak':
      return !row.isNew && row.recall < 0.85;
    default:
      return true;
  }
}

/** Flashcards → Browse: every item of the course with its schedule, filters, and per-item or bulk suspend/reset. */
export function BrowseView({
  cid,
  course,
  items,
  initial,
  prefs,
}: {
  cid: string;
  course: BrowseCourse;
  items: StudyItem[];
  initial: StudyCourseState;
  prefs: StudyPrefs;
}) {
  const { state, update } = useStudyProgress(cid, initial);
  const now = useNow();
  // Rows only change once a minute (or when progress changes), not every clock tick.
  const minute = Math.floor(now / 60_000) * 60_000;
  const [week, setWeek] = useState('all');
  const [kind, setKind] = useState('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState('');

  const allItems = useMemo(
    () => [...items, ...userCardItems(cid, state.uc)],
    [items, cid, state.uc],
  );
  const byKey = useMemo(
    () => new Map(allItems.map((item) => [item.key, item])),
    [allItems],
  );
  const rows = useMemo<Row[]>(() => {
    if (!minute) return [];
    const dueBy = nextDayStart(minute, prefs.dayStartsAt);
    return allItems.map((item) => {
      const { mem } = memoryOf(item, state, prefs, minute);
      const isNew = isNewMemory(mem);
      return {
        item,
        mem,
        isNew,
        recall: retrievability(mem, minute, prefs),
        dueToday: Boolean(mem && !isNew && !mem.sus && mem.due < dueBy),
      };
    });
  }, [allItems, state, prefs, minute]);
  const shown = useMemo(
    () =>
      rows.filter((row) =>
        matches(row, {
          week,
          kind,
          state: stateFilter,
          query: query.trim().toLowerCase(),
        }),
      ),
    [rows, week, kind, stateFilter, query],
  );

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageRows = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const hasWeekless = allItems.some((item) => item.week === null);
  const weekLabel = (n: number | null) => {
    if (n === null) return '—';
    const found = course.weeks.find((other) => other.n === n);
    return found ? weekName(found) : `Week ${n}`;
  };

  const filterChange =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(0);
    };

  const applyTo = (keys: string[], action: 'suspend' | 'unsuspend' | 'reset') => {
    const targets = keys
      .map((key) => byKey.get(key))
      .filter((item): item is StudyItem => Boolean(item));
    if (targets.length === 0) return;
    if (
      action === 'reset' &&
      !window.confirm(
        `Reset ${plural(targets.length, 'item')}? ${targets.length === 1 ? 'It' : 'They'} will be new again and lose ${targets.length === 1 ? 'its' : 'their'} schedule.`,
      )
    )
      return;
    const at = Date.now();
    update((draft) => {
      for (const item of targets) {
        if (action === 'reset') resetItem(draft, item, at);
        else setSuspended(draft, item, action === 'suspend', at, prefs);
      }
    });
    setNotice(
      `${action === 'reset' ? 'Reset' : action === 'suspend' ? 'Suspended' : 'Unsuspended'} ${plural(targets.length, 'item')}.`,
    );
  };

  const toggleSelected = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectedKeys = [...selected].filter((key) => byKey.has(key));

  return (
    <section className="ca" aria-label={`Browse ${course.code} items`}>
      <search className="ca-filters">
        <label>
          <span>Week</span>
          <select
            value={week}
            onChange={(event) => filterChange(setWeek)(event.target.value)}
          >
            <option value="all">All weeks</option>
            {course.weeks.map((w) => (
              <option key={w.n} value={String(w.n)}>
                {`${weekName(w)}${w.title ? ` · ${w.title}` : ''}`}
              </option>
            ))}
            {hasWeekless ? <option value="none">No week</option> : null}
          </select>
        </label>
        <label>
          <span>Kind</span>
          <select
            value={kind}
            onChange={(event) => filterChange(setKind)(event.target.value)}
          >
            <option value="all">All kinds</option>
            {KIND_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>State</span>
          <select
            value={stateFilter}
            onChange={(event) =>
              filterChange(setStateFilter)(event.target.value as StateFilter)
            }
          >
            {Object.entries(STATE_FILTERS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="ca-search">
          <span>Search</span>
          <input
            type="search"
            value={query}
            placeholder="Text in the item"
            onChange={(event) => filterChange(setQuery)(event.target.value)}
          />
        </label>
      </search>

      <div className="ca-bulk">
        <span className="ca-count" aria-live="polite">
          {now ? plural(shown.length, 'item') : 'Loading…'}
          {selectedKeys.length > 0 ? ` · ${selectedKeys.length} selected` : ''}
        </span>
        <button
          type="button"
          className="pill pill-sm"
          disabled={shown.length === 0}
          onClick={() =>
            setSelected(new Set(shown.map((row) => row.item.key)))
          }
        >
          Select all shown
        </button>
        {selectedKeys.length > 0 ? (
          <>
            <button
              type="button"
              className="pill pill-sm"
              onClick={() => applyTo(selectedKeys, 'suspend')}
            >
              Suspend
            </button>
            <button
              type="button"
              className="pill pill-sm"
              onClick={() => applyTo(selectedKeys, 'unsuspend')}
            >
              Unsuspend
            </button>
            <button
              type="button"
              className="pill pill-sm"
              onClick={() => applyTo(selectedKeys, 'reset')}
            >
              Reset
            </button>
            <button
              type="button"
              className="textlink"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          </>
        ) : null}
        <span className="sr" aria-live="polite">
          {notice}
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="ca-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr">Selected</span>
              </th>
              <th scope="col">Item</th>
              <th scope="col">Week</th>
              <th scope="col">Kind</th>
              <th scope="col">State</th>
              <th scope="col">Due</th>
              <th scope="col" className="num">
                Stability
              </th>
              <th scope="col" className="num">
                Recall
              </th>
              <th scope="col" className="num">
                Lapses
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const { item, mem } = row;
              const expanded = open === item.key;
              const previewId = `ca-prev-${item.key.replace(/[^\w-]/g, '_')}`;
              const userId = item.kind === 'mine' ? item.key.slice(2) : null;
              const href =
                item.href ??
                (userId
                  ? `/study/${cid}/cards?tab=mine#${encodeURIComponent(userId)}`
                  : null);
              return (
                <Fragment key={item.key}>
                  <tr className={mem?.sus ? 'ca-sus' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(item.key)}
                        onChange={() => toggleSelected(item.key)}
                        aria-label={`Select ${item.label}`}
                      />
                    </td>
                    <td className="ca-label">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={previewId}
                        onClick={() => setOpen(expanded ? null : item.key)}
                      >
                        {item.label || '(empty)'}
                      </button>
                      <span className="ca-acts">
                        {href ? (
                          <Link className="textlink" href={href}>
                            Open
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="textlink"
                          onClick={() =>
                            applyTo(
                              [item.key],
                              mem?.sus ? 'unsuspend' : 'suspend',
                            )
                          }
                        >
                          {mem?.sus ? 'Unsuspend' : 'Suspend'}
                        </button>
                        <button
                          type="button"
                          className="textlink"
                          onClick={() => applyTo([item.key], 'reset')}
                        >
                          Reset
                        </button>
                      </span>
                    </td>
                    <td className="ca-nowrap">{weekLabel(item.week)}</td>
                    <td className="ca-nowrap">{KIND_LABEL[item.kind]}</td>
                    <td className="ca-nowrap">{stateLabel(row)}</td>
                    <td
                      className={`ca-nowrap${row.dueToday ? ' ca-due' : ''}`}
                    >
                      {dueLabel(row, minute, prefs.dayStartsAt)}
                    </td>
                    <td className="num">
                      {row.isNew || !mem ? '—' : mem.s.toFixed(1)}
                    </td>
                    <td
                      className={`num${!row.isNew && row.recall < 0.85 ? ' ca-weak' : ''}`}
                    >
                      {row.isNew ? '—' : `${Math.round(row.recall * 100)}%`}
                    </td>
                    <td className="num">{mem?.l ?? 0}</td>
                  </tr>
                  {expanded ? (
                    <tr className="ca-prev-row">
                      <td colSpan={9} id={previewId}>
                        <ItemPreview item={item} course={course} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {now && shown.length === 0 ? (
        <p className="ca-empty">No items match these filters.</p>
      ) : null}

      {pages > 1 ? (
        <nav className="ca-pager" aria-label="Pages">
          <button
            type="button"
            className="pill pill-sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <button
            type="button"
            className="pill pill-sm"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}

/** The item's content, read-only, under its row. */
function ItemPreview({
  item,
  course,
}: {
  item: StudyItem;
  course: BrowseCourse;
}) {
  const { math } = course;
  if (item.mine) {
    const card = item.mine;
    return (
      <div className="ca-prev">
        <div className="ca-side">
          <span className="ca-lbl">Front</span>
          <div
            className="ca-user"
            dangerouslySetInnerHTML={{ __html: renderUserText(card.f) }}
          />
        </div>
        <div className="ca-side">
          <span className="ca-lbl">Back</span>
          <div
            className="ca-user"
            dangerouslySetInnerHTML={{ __html: renderUserText(card.b) }}
          />
        </div>
        {card.a?.length ? (
          <p className="ca-meta">Typed answers: {card.a.join(' · ')}</p>
        ) : null}
        {card.tags?.length ? (
          <p className="ca-meta">Tags: {card.tags.join(', ')}</p>
        ) : null}
      </div>
    );
  }
  if (item.card) {
    const card = item.card;
    return (
      <div className="ca-prev">
        <div className="ca-side">
          <span className="ca-lbl">Front</span>
          <Html html={card.f} math={math} className="prose" />
        </div>
        <div className="ca-side">
          <span className="ca-lbl">Back</span>
          <Html html={card.b} math={math} className="prose" />
        </div>
        {card.a?.length ? (
          <p className="ca-meta">Typed answers: {card.a.join(' · ')}</p>
        ) : null}
      </div>
    );
  }
  if (item.practice) {
    const practice = item.practice;
    return (
      <div className="ca-prev">
        <Html html={practice.q} math={math} className="prose q" />
        {practice.type === 'mc' && practice.opts ? (
          <ol className="ca-opts">
            {practice.opts.map((opt, i) => (
              <li
                key={i}
                className={i === Number(practice.a) ? 'right' : undefined}
              >
                <Html html={opt} math={math} as="span" />
                {i === Number(practice.a) ? (
                  <span className="ca-meta"> (answer)</span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="ca-meta">
            Answer:{' '}
            <Html
              html={esc(practiceAnswerText(practice))}
              math={math}
              as="span"
            />
          </p>
        )}
        {practice.sol ? (
          <div className="reveal sol">
            <Html html={practice.sol} math={math} />
          </div>
        ) : null}
      </div>
    );
  }
  if (item.parsons) {
    const parsons = item.parsons;
    return (
      <div className="ca-prev">
        {parsons.title ? <p className="stitle">{parsons.title}</p> : null}
        <Html html={parsons.q} math={math} className="prose q" />
        <span className="ca-lbl">Solution</span>
        <pre>
          <code
            className={
              course.codeLang ? `language-${course.codeLang}` : undefined
            }
          >
            {parsons.lines.join('\n')}
          </code>
        </pre>
        {parsons.distractors?.length ? (
          <>
            <span className="ca-lbl">Distractors (left out)</span>
            <pre>
              <code>{parsons.distractors.join('\n')}</code>
            </pre>
          </>
        ) : null}
        {parsons.sol ? (
          <div className="reveal sol">
            <Html html={parsons.sol} math={math} />
          </div>
        ) : null}
      </div>
    );
  }
  return <p className="ca-meta">{item.label}</p>;
}
