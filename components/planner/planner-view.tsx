'use client';

import { GripVertical, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  academicYears,
  checkRequirements,
  courseCodes,
  currentTermId,
  formatHours,
  nextTermId,
  planTotals,
  sumHours,
  term90Index,
} from '@/lib/planner/check';
import { usePlanStore } from '@/lib/planner/plan-client';
import { planPdf } from '@/lib/planner/pdf';
import {
  PLAN_TAGS,
  TAG_LABELS,
  type Plan,
  type PlanRow,
  type PlanTag,
  type PlannerRules,
} from '@/lib/planner/types';
import { d8 } from '@/lib/study/model';
import { cn } from '@/lib/utils';
import { PlannerImport } from './planner-import';

/** A current-term Canvas class, by code ("ABC 1234") and title. */
export type CanvasClass = { code: string; title: string };
/** Where a row sits: a term id, `xfer`, or `extra`, and its position. */
type Slot = { block: string; index: number };
type Notice = { text: string; undo?: { slot: Slot; row: PlanRow } };

const YEARS = [
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
  'Eighth',
];
// The app's tokens: done green, in progress yellow, recommended ink.
const TAG_CLASS: Record<PlanTag, string> = {
  '': 'text-ink-4',
  R: 'font-semibold text-ink',
  ALT: 'text-ink-3',
  IP: 'font-semibold text-warn',
  C: 'text-good',
  T: 'text-good',
};
const SAVE_TEXT: Record<string, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved on this device',
  error: 'Could not save. Retrying on the next change.',
};
const HEADING =
  'flex items-baseline justify-between gap-3 border-b border-ink pb-1.5 text-[13.5px] font-medium';
const LINE_INPUT =
  'min-w-0 border-b border-transparent bg-transparent py-1 text-sm outline-none hover:border-rule-2 focus:border-ink';

function rowsOf(plan: Plan, block: string): PlanRow[] {
  if (block === 'xfer') return plan.xfer;
  if (block === 'extra') return plan.extra;
  return plan.terms.find((term) => term.id === block)?.rows ?? [];
}

function blockLabel(plan: Plan, block: string) {
  if (block === 'xfer') return 'Transfer credit';
  if (block === 'extra') return 'Elective credit';
  return plan.terms.find((term) => term.id === block)?.label ?? block;
}

/** Where a drop at `clientY` lands among a block's rows. */
function dropIndex(container: HTMLElement, clientY: number) {
  const rows = [...container.querySelectorAll('[data-row]')];
  const index = rows.findIndex((row) => {
    const box = row.getBoundingClientRect();
    return clientY < box.top + box.height / 2;
  });
  return index < 0 ? rows.length : index;
}

/** Hours as typed, so "2." or an empty field can be edited; commits valid numbers. */
function HoursInput({
  hours,
  onChange,
}: {
  hours: number;
  onChange: (hours: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label="Credit hours"
      title="Credit hours"
      inputMode="decimal"
      value={draft ?? formatHours(hours)}
      onChange={(event) => {
        const text = event.target.value;
        const value = Number(text);
        setDraft(text);
        if (text.trim() && Number.isFinite(value) && value >= 0 && value <= 30)
          onChange(value);
      }}
      onBlur={() => setDraft(null)}
      className={cn(LINE_INPUT, 'w-full text-right tabular-nums')}
    />
  );
}

export function PlannerView({
  rules,
  initialPlan,
  today: todayKey,
  canvasClasses,
}: {
  rules: PlannerRules;
  initialPlan: Plan;
  /** Local YYYY-MM-DD, from the server so both renders agree */
  today: string;
  canvasClasses: CanvasClass[];
}) {
  const { plan, status, update, replace } = usePlanStore(initialPlan);
  const today = d8(todayKey);
  const next = nextTermId(plan, today);
  const current = currentTermId(plan, today);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [moving, setMoving] = useState<Slot | null>(null);
  const [dropAt, setDropAt] = useState<Slot | null>(null);
  const dragging = useRef<Slot | null>(null);
  const [addTo, setAddTo] = useState(next);
  const [showDone, setShowDone] = useState(false);
  const results = useMemo(() => checkRequirements(plan, rules), [plan, rules]);
  const totals = planTotals(plan);
  const at90 = term90Index(plan);
  const grid = academicYears(plan.terms);
  const day = `${today.getMonth() + 1}/${today.getDate()}/${String(today.getFullYear()).slice(2)}`;

  useEffect(() => {
    if (!moving) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMoving(null);
      setNotice(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moving]);

  const move = (from: Slot, to: Slot) => {
    const row = rowsOf(plan, from.block).at(from.index);
    setMoving(null);
    if (!row) return;
    update((draft) => {
      const source = rowsOf(draft, from.block);
      const target = rowsOf(draft, to.block);
      source.splice(from.index, 1);
      target.splice(
        source === target && to.index > from.index ? to.index - 1 : to.index,
        0,
        row,
      );
    });
    setNotice(
      from.block === to.block
        ? null
        : {
            text: `Moved “${row.n || 'course'}” to ${blockLabel(plan, to.block)}.`,
          },
    );
  };

  const remove = (slot: Slot) => {
    const row = rowsOf(plan, slot.block).at(slot.index);
    if (!row) return;
    update((draft) => {
      rowsOf(draft, slot.block).splice(slot.index, 1);
    });
    setMoving(null);
    setNotice({ text: `Removed “${row.n || 'course'}”.`, undo: { slot, row } });
  };

  const restore = () => {
    const undo = notice?.undo;
    if (!undo) return;
    update((draft) => {
      const rows = rowsOf(draft, undo.slot.block);
      rows.splice(Math.min(undo.slot.index, rows.length), 0, undo.row);
    });
    setNotice({ text: `Restored “${undo.row.n || 'course'}”.` });
  };

  /** Appends a row to a block and returns where it landed. */
  const add = (block: string, row: PlanRow, text?: string): Slot => {
    const index = rowsOf(plan, block).length;
    update((draft) => {
      rowsOf(draft, block).push(row);
    });
    setNotice(text ? { text } : null);
    return { block, index };
  };

  const edit = (slot: Slot, change: Partial<PlanRow>) =>
    update((draft) => {
      const row = rowsOf(draft, slot.block).at(slot.index);
      if (row) Object.assign(row, change);
    });

  const exportPdf = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([planPdf(plan, today)], { type: 'application/pdf' }),
    );
    link.download =
      `${plan.title || 'Course plan'} - ${plan.name || 'plan'}.pdf`.replace(
        /[\\/:*?"<>|]+/g,
        '-',
      );
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };

  const reset = async () => {
    if (
      !window.confirm(
        'Replace your plan with the starting plan from your planner file? Your changes to the plan will be lost.',
      )
    )
      return;
    const response = await fetch('/api/planner', { method: 'DELETE' }).catch(
      () => null,
    );
    if (!response?.ok) {
      setNotice({
        text: 'The plan could not be reset. Check that _aper is running.',
      });
      return;
    }
    replace((await response.json()) as Plan);
    setMoving(null);
    setNotice({ text: 'Plan reset to the starting plan.' });
  };

  const focusRow = (slot: Slot, scroll: boolean) =>
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-slot="${slot.block}:${slot.index}"] input`,
      );
      if (scroll) input?.scrollIntoView({ block: 'center' });
      input?.focus({ preventScroll: true });
    });

  const renderRow = (block: string, row: PlanRow, index: number) => {
    const slot = { block, index };
    const key = `${block}:${index}`;
    const isMoving = moving?.block === block && moving.index === index;
    const done = row.k === 'T' || row.k === 'C';
    return (
      <li
        key={key}
        data-row
        data-slot={key}
        className={cn(
          'relative grid grid-cols-[18px_minmax(0,1fr)_40px_52px_22px] items-center gap-1.5 border-b border-rule py-0.5',
          isMoving && 'bg-wash',
          dropAt?.block === block &&
            dropAt.index === index &&
            'before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:bg-ink',
        )}
      >
        <button
          type="button"
          draggable
          aria-label={`Move ${row.n || 'this course'}`}
          title="Drag to another semester, or click and choose Move here"
          className={cn(
            'grid h-6 cursor-grab touch-none place-items-center text-ink-4 hover:text-ink',
            isMoving && 'text-ink',
          )}
          onDragStart={(event) => {
            dragging.current = slot;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', row.n);
            // Drag the whole row, not just the handle.
            const item = event.currentTarget.closest('li');
            if (item)
              event.dataTransfer.setDragImage(item, 12, item.offsetHeight / 2);
          }}
          onDragEnd={() => {
            dragging.current = null;
            setDropAt(null);
          }}
          onClick={() => {
            setMoving(isMoving ? null : slot);
            setNotice(
              isMoving
                ? null
                : {
                    text: `Moving “${row.n || 'course'}”. Choose Move here under a semester, or press Escape to cancel.`,
                  },
            );
          }}
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
        </button>
        <input
          aria-label="Course"
          placeholder="Course"
          spellCheck={false}
          title={row.n}
          value={row.n}
          onChange={(event) => edit(slot, { n: event.target.value })}
          className={cn(
            LINE_INPUT,
            'placeholder:text-ink-4',
            done ? 'text-good' : row.k === 'ALT' ? 'text-ink-2' : 'text-ink',
          )}
        />
        <HoursInput
          hours={row.h}
          onChange={(hours) => edit(slot, { h: hours })}
        />
        <select
          aria-label="Tag"
          title={TAG_LABELS[row.k]}
          value={row.k}
          onChange={(event) => edit(slot, { k: event.target.value as PlanTag })}
          className={cn(
            'min-w-0 cursor-pointer bg-transparent py-1 text-xs outline-none',
            TAG_CLASS[row.k],
          )}
        >
          {PLAN_TAGS.map((tag) => (
            <option key={tag} value={tag} className="bg-paper text-ink">
              {tag || '–'}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={`Remove ${row.n || 'this course'}`}
          title="Remove"
          onClick={() => remove(slot)}
          className="grid h-6 place-items-center text-ink-4 hover:text-ink"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </li>
    );
  };

  const renderBlock = (block: string, label: string, footnote?: ReactNode) => {
    const rows = rowsOf(plan, block);
    return (
      <div
        key={block}
        className="min-w-0"
        onDragOver={(event) => {
          if (!dragging.current) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const index = dropIndex(event.currentTarget, event.clientY);
          if (dropAt?.block !== block || dropAt.index !== index)
            setDropAt({ block, index });
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDropAt(null);
        }}
        onDrop={(event) => {
          const from = dragging.current;
          if (!from) return;
          event.preventDefault();
          dragging.current = null;
          setDropAt(null);
          move(from, {
            block,
            index: dropIndex(event.currentTarget, event.clientY),
          });
        }}
      >
        <h4 className={HEADING}>
          {label}
          <span className="text-[12.5px] font-normal text-ink-3 tabular-nums">
            {formatHours(sumHours(rows))} hrs
          </span>
        </h4>
        <ol
          className={cn(
            'relative min-h-[34px]',
            dropAt?.block === block &&
              dropAt.index === rows.length &&
              'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-ink',
          )}
        >
          {rows.map((row, index) => renderRow(block, row, index))}
        </ol>
        {moving ? (
          <button
            type="button"
            className="textlink mt-2 text-ink underline"
            onClick={() => move(moving, { block, index: rows.length })}
          >
            Move here
          </button>
        ) : (
          <button
            type="button"
            className="textlink mt-2"
            onClick={() =>
              focusRow(
                add(block, {
                  n: '',
                  h: 3,
                  k: block === 'xfer' || block === 'extra' ? 'T' : '',
                }),
                false,
              )
            }
          >
            + Add course
          </button>
        )}
        {footnote}
      </div>
    );
  };

  // The current term is checked against your Canvas classes.
  const currentRows = current ? rowsOf(plan, current) : [];
  const notInPlan = canvasClasses.filter(
    (item) =>
      !currentRows.some((row) => courseCodes(row.n).includes(item.code)),
  );
  const canvasNote = current && canvasClasses.length > 0 && (
    <p className="mt-2 text-[12.5px] text-ink-3">
      {notInPlan.length === 0 ? (
        'Matches your Canvas classes this term.'
      ) : (
        <>
          In Canvas this term but not here:{' '}
          {notInPlan.map((item) => (
            <button
              key={item.code}
              type="button"
              className="textlink mr-2 text-[12.5px] text-ink underline"
              title={`Add ${item.code} ${item.title} as in progress`}
              onClick={() =>
                add(
                  current,
                  { n: `${item.code} ${item.title}`, h: 3, k: 'IP' },
                  `Added ${item.code} to ${blockLabel(plan, current)}.`,
                )
              }
            >
              Add {item.code}
            </button>
          ))}
        </>
      )}
    </p>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className="pill pill-primary" onClick={exportPdf}>
          Export PDF
        </button>
        <p className="text-[13.5px] text-ink-3">
          <span className="numeral text-[19px] text-ink">
            {formatHours(totals.done)}
          </span>{' '}
          completed,{' '}
          <span className="numeral text-[19px] text-ink">
            {formatHours(totals.inProgress)}
          </span>{' '}
          in progress,{' '}
          <span className="numeral text-[19px] text-ink">
            {formatHours(totals.planned)}
          </span>{' '}
          planned.{' '}
          {formatHours(totals.done + totals.inProgress + totals.planned)} of{' '}
          {formatHours(plan.hours)} hours
        </p>
        <span className="flex-1" />
        <span className="text-[12px] text-ink-4">{SAVE_TEXT[status]}</span>
        <button type="button" className="textlink" onClick={() => void reset()}>
          Reset plan
        </button>
        <PlannerImport replace />
      </div>
      <p
        aria-live="polite"
        className="mt-2 mb-6 min-h-[22px] text-[13px] text-ink-2"
      >
        {notice?.text}
        {notice?.undo && (
          <button
            type="button"
            className="textlink ml-2 text-ink underline"
            onClick={restore}
          >
            Undo
          </button>
        )}
      </p>

      <div className="mb-11 grid gap-x-7 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ['name', 'Name'],
            ['date', 'Date'],
            ['by', 'Assessment by'],
            ['title', 'Title'],
            ['note', 'Line under the title'],
          ] as const
        ).map(([field, label]) => (
          <label
            key={field}
            className="flex flex-col gap-1 text-[12px] text-ink-3"
          >
            {label}
            <input
              className="field"
              spellCheck={false}
              value={plan[field]}
              placeholder={field === 'date' ? `Export day (${day})` : undefined}
              onChange={(event) =>
                update((draft) => {
                  draft[field] = event.target.value;
                })
              }
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Hours for degree
          <input
            className="field"
            inputMode="numeric"
            value={String(plan.hours)}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (
                event.target.value.trim() &&
                Number.isFinite(value) &&
                value >= 0 &&
                value <= 400
              )
                update((draft) => {
                  draft.hours = value;
                });
            }}
          />
        </label>
      </div>

      <section className="mb-11">
        <h2 className="section-label mb-3">
          Next semester options: {blockLabel(plan, next)}
        </h2>
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          {(['R', 'ALT'] as const).map((tag) => {
            const list = plan.terms.flatMap((term) =>
              term.rows
                .map((row, index) => ({ row, slot: { block: term.id, index } }))
                .filter(({ row }) => row.k === tag),
            );
            return (
              <div key={tag}>
                <h3 className={HEADING}>
                  {tag === 'R' ? 'Recommended (R)' : 'Alternatives (ALT)'}
                  <span className="text-[12.5px] font-normal text-ink-3 tabular-nums">
                    {formatHours(
                      list.reduce((total, { row }) => total + row.h, 0),
                    )}{' '}
                    hrs
                  </span>
                </h3>
                {list.length ? (
                  <ul>
                    {list.map(({ row, slot }) => (
                      <li
                        key={`${slot.block}:${slot.index}`}
                        className="grid grid-cols-[minmax(0,1fr)_32px_36px] items-baseline gap-2 border-b border-rule py-1.5 text-sm"
                      >
                        <button
                          type="button"
                          className="min-w-0 truncate text-left hover:underline"
                          onClick={() => focusRow(slot, true)}
                        >
                          {row.n || 'Untitled course'}
                        </button>
                        <span className="text-right text-[12.5px] text-ink-3 tabular-nums">
                          {formatHours(row.h)}
                        </span>
                        <span className="text-right text-[12.5px] text-ink-3">
                          {slot.block}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[13px] text-ink-3">
                    Tag a course {tag} to list it here and in the PDF.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-11">
        <h2 className="section-label">Four-year plan</h2>
        <p className="mt-1 mb-5 text-[12.5px] text-ink-3">
          Tags: <b className="text-ink-2">T</b> transfer credit,{' '}
          <b className="text-ink-2">C</b> completed,{' '}
          <b className="text-ink-2">IP</b> in progress,{' '}
          <b className="text-ink-2">R</b> recommended next semester,{' '}
          <b className="text-ink-2">ALT</b> alternative. Untagged courses are
          planned.
        </p>
        {grid.years.map((terms, year) => (
          <div key={year} className="mb-8">
            <h3 className="display mb-3 text-[1.25rem]">
              {YEARS.at(year) ?? `Year ${year + 1}`} year
            </h3>
            <div
              className={cn(
                'grid gap-x-8 gap-y-6',
                grid.seasons === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2',
              )}
            >
              {terms.map((term, season) =>
                term ? (
                  renderBlock(
                    term.id,
                    term.label,
                    term.id === current ? canvasNote : undefined,
                  )
                ) : (
                  // A season this year skips keeps its column empty.
                  <div key={`empty-${season}`} aria-hidden="true" />
                ),
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="mb-11">
        <h2 className="section-label mb-3">Credit you already have</h2>
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          {renderBlock('xfer', 'Transfer credit')}
          {renderBlock('extra', 'Elective credit (not applied to the degree)')}
        </div>
      </section>

      <section className="mb-11">
        <h2 className="section-label">Requirements</h2>
        <div className="mt-1 mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-2 text-[13px] text-ink-3">
          <label className="flex items-baseline gap-2">
            Add missing courses to
            <select
              value={addTo}
              onChange={(event) => setAddTo(event.target.value)}
              className="cursor-pointer border-b border-rule-2 bg-transparent py-0.5 text-ink outline-none focus:border-ink"
            >
              {plan.terms.map((term) => (
                <option
                  key={term.id}
                  value={term.id}
                  className="bg-paper text-ink"
                >
                  {term.label}
                </option>
              ))}
            </select>
          </label>
          <span className="flex-1" />
          <button
            type="button"
            className="textlink"
            onClick={() => setShowDone(!showDone)}
          >
            {showDone
              ? 'Hide finished requirements'
              : `Show finished requirements (${Object.values(results).filter((item) => item.status === 'done').length})`}
          </button>
        </div>
        {rules.areas.map((area) => {
          const items = area.reqs.map((req) => results[req.id]);
          const done = items.filter((item) => item.status === 'done').length;
          const shown = showDone
            ? items
            : items.filter((item) => item.status !== 'done');
          return (
            <div key={area.h} className="mb-7">
              <h3 className={HEADING}>
                {area.h}
                <span
                  className={cn(
                    'text-[12.5px]',
                    done === items.length
                      ? 'font-medium text-good'
                      : 'font-normal text-ink-3',
                  )}
                >
                  {done === items.length
                    ? 'Done ✓'
                    : `${done} of ${items.length} done`}
                </span>
              </h3>
              {area.note && done < items.length && (
                <p className="mt-1.5 max-w-[80ch] text-[13px] text-ink-3">
                  {area.note}
                  {area.by90 &&
                    at90 >= 0 &&
                    ` In this plan you reach 90 hours during ${plan.terms[at90].label}.`}
                </p>
              )}
              <ul>
                {shown.map(({ req, take, got, need, status: state }) => {
                  const open = take.filter((ref) => ref.rank > 0);
                  const late =
                    area.by90 === true &&
                    at90 >= 0 &&
                    open.some((ref) => ref.term >= at90);
                  return (
                    <li
                      key={req.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-[1_1_320px]">
                        {req.label}
                        {req.note && state !== 'done' && (
                          <small className="block text-[12.5px] text-ink-3">
                            {req.note}
                          </small>
                        )}
                      </span>
                      <span className="flex items-baseline gap-3 text-right text-[13px] text-ink-2">
                        {state === 'done' && (
                          <span className="text-good">Done</span>
                        )}
                        {state === 'ip' && (
                          <span className="font-medium text-warn">
                            In progress
                          </span>
                        )}
                        {state === 'plan' && (
                          <span className={cn(late && 'text-bad')}>
                            {[
                              ...new Set(
                                open.map((ref) => blockLabel(plan, ref.block)),
                              ),
                            ].join(', ')}
                            {late && ', after you reach 90 hours'}
                          </span>
                        )}
                        {state === 'miss' && (
                          <>
                            <span className="text-bad">
                              {got
                                ? `${formatHours(got)} of ${formatHours(need)} ${req.hrs ? 'hours' : 'courses'} planned`
                                : 'Not in the plan'}
                            </span>
                            <button
                              type="button"
                              className="textlink text-ink underline"
                              onClick={() =>
                                add(
                                  addTo,
                                  {
                                    n: req.name ?? req.label,
                                    h: req.h ?? 3,
                                    k: '',
                                    r: req.id,
                                  },
                                  `Added “${req.name ?? req.label}” to ${blockLabel(plan, addTo)}.`,
                                )
                              }
                            >
                              Add
                            </button>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="section-label">Degree notes</h2>
        <p className="mt-1 mb-3 text-[12.5px] text-ink-3">
          Printed at the bottom of the PDF, one line each. Wrap words in
          **double asterisks** to make them bold.
        </p>
        <textarea
          aria-label="Degree notes"
          className="field min-h-[180px] font-mono text-[12.5px] leading-relaxed"
          spellCheck={false}
          value={plan.notes.join('\n')}
          onChange={(event) =>
            update((draft) => {
              draft.notes = event.target.value.split('\n');
            })
          }
        />
      </section>
    </div>
  );
}
