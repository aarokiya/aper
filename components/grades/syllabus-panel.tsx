'use client';

import { useRef, useState } from 'react';
import type { GradeCourse } from '@/lib/grades/calculator';
import type { GradePolicy, PolicyReport } from '@/lib/grades/policy';
import { cn } from '@/lib/utils';
import { PolicyEditor } from './policy-editor';
import { describeScoring, describeSources, sourceNames } from './policy-text';

type Phase =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'review'; draft: GradePolicy; report: PolicyReport }
  | { kind: 'edit'; draft: GradePolicy };

const DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

async function failure(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? 'That did not work. Check that _aper is running.';
}

/**
 * Where a course's grading rules come from. Without a policy it offers to
 * read the syllabus (upload, the Canvas syllabus page, a synced file, or
 * pasted text) and shows what it found before anything is used; with one it
 * names the source, the letter scale, and the rules the calculator cannot
 * apply, and lets the user edit, re-read, or go back to Canvas's groups.
 */
export function SyllabusPanel({
  course,
  onSaved,
}: {
  course: GradeCourse;
  onSaved: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const policy = course.policy;
  const busy = phase.kind === 'busy';

  const read = async (label: string, body: FormData | object) => {
    setError('');
    setPhase({ kind: 'busy', label });
    try {
      const response = await fetch(`/api/grades/syllabus/${course.id}`, {
        method: 'POST',
        ...(body instanceof FormData
          ? { body }
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }),
      });
      if (!response.ok) throw new Error(await failure(response));
      const payload = (await response.json()) as {
        policy: GradePolicy;
        report: PolicyReport;
      };
      setPasting(false);
      setChoosing(false);
      setPhase({
        kind: 'review',
        draft: payload.policy,
        report: payload.report,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPhase({ kind: 'idle' });
    }
  };

  const save = async (draft: GradePolicy) => {
    setError('');
    setPhase({ kind: 'busy', label: 'Saving the rules…' });
    const response = await fetch(`/api/grades/policy/${course.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }).catch(() => null);
    if (!response?.ok) {
      setError(
        response
          ? await failure(response)
          : 'The rules could not be saved. Check that _aper is running.',
      );
      setPhase({ kind: 'edit', draft });
      return;
    }
    setPhase({ kind: 'idle' });
    onSaved();
  };

  const remove = async () => {
    setError('');
    setConfirmingRemove(false);
    setPhase({ kind: 'busy', label: 'Switching back to Canvas…' });
    const response = await fetch(`/api/grades/policy/${course.id}`, {
      method: 'DELETE',
    }).catch(() => null);
    if (!response?.ok)
      setError('Could not switch back. Check that _aper is running.');
    setPhase({ kind: 'idle' });
    if (response?.ok) onSaved();
  };

  const readers = (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.txt,.md,.html,.htm,application/pdf,text/plain,text/html"
        className="sr"
        aria-label={`Syllabus file for ${course.code}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const form = new FormData();
          form.append('file', file);
          void read(`Reading ${file.name}…`, form);
        }}
      />
      <button
        type="button"
        className="pill pill-sm pill-primary"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        Upload the syllabus
      </button>
      {course.syllabi.map((source) =>
        source.kind === 'canvas' ? (
          <button
            key="canvas"
            type="button"
            className="pill pill-sm"
            disabled={busy}
            onClick={() =>
              void read('Reading the Canvas syllabus…', { source: 'canvas' })
            }
          >
            Read the Canvas syllabus
          </button>
        ) : (
          <button
            key={source.id}
            type="button"
            className="pill pill-sm"
            disabled={busy}
            onClick={() =>
              void read(`Reading ${source.name}…`, {
                source: 'file',
                fileId: source.id,
              })
            }
          >
            Read {source.name}
          </button>
        ),
      )}
      <button
        type="button"
        className="textlink text-[13px]"
        disabled={busy}
        onClick={() => setPasting((open) => !open)}
      >
        {pasting ? 'Close' : 'Paste the grading section'}
      </button>
    </div>
  );

  const pasteArea = pasting && (
    <div className="grid gap-2">
      <label className="grid gap-1 text-[13px] text-ink-2">
        Grading section
        <textarea
          className="field min-h-32 font-mono text-[12.5px]"
          value={pasted}
          placeholder={
            'Homework: 20%\nExams: 60% (3 exams)\nFinal: 20%\nA: 90-100'
          }
          onChange={(event) => setPasted(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="pill pill-sm justify-self-start"
        disabled={busy || pasted.trim().length < 20}
        onClick={() => void read('Reading the pasted text…', { text: pasted })}
      >
        Read the text
      </button>
    </div>
  );

  return (
    <section
      aria-label={`${course.code} syllabus rules`}
      className="mt-6 rounded-xl border border-rule bg-wash/60 p-4 sm:p-5"
    >
      {phase.kind === 'review' ? (
        <Proposal
          course={course}
          draft={phase.draft}
          report={phase.report}
          onUse={() => void save(phase.draft)}
          onEdit={() => setPhase({ kind: 'edit', draft: phase.draft })}
          onCancel={() => setPhase({ kind: 'idle' })}
        />
      ) : phase.kind === 'edit' ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-medium text-ink">
              Edit the syllabus rules
            </h3>
            <span className="text-[12.5px] text-ink-3">
              From {phase.draft.source}
            </span>
          </div>
          <PolicyEditor
            course={course}
            draft={phase.draft}
            onChange={(draft) => setPhase({ kind: 'edit', draft })}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="pill pill-sm pill-primary"
              onClick={() => void save(phase.draft)}
            >
              Save the rules
            </button>
            <button
              type="button"
              className="pill pill-sm"
              onClick={() => setPhase({ kind: 'idle' })}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : policy ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <p className="text-[14px] text-ink-2">
              <span className="font-medium text-ink">
                Graded by the syllabus
              </span>{' '}
              <span className="text-ink-3">
                from {policy.source}, {DAY.format(new Date(policy.savedAt))}
                {policy.cutoffs &&
                  `. Letter scale ${policy.cutoffs.join(' / ')}`}
                {policy.credits != null &&
                  `, ${policy.credits} credit ${policy.credits === 1 ? 'hour' : 'hours'}`}
              </span>
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <button
                type="button"
                className="textlink"
                disabled={busy}
                onClick={() => setPhase({ kind: 'edit', draft: policy })}
              >
                Edit rules
              </button>
              <button
                type="button"
                className="textlink"
                disabled={busy}
                aria-expanded={choosing}
                onClick={() => setChoosing((open) => !open)}
              >
                Read a new syllabus
              </button>
              {confirmingRemove ? (
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-ink-3">
                    Remove these rules and use Canvas&rsquo;s groups?
                  </span>
                  <button
                    type="button"
                    className="textlink text-bad"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="textlink"
                    onClick={() => setConfirmingRemove(false)}
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="textlink text-ink-3"
                  disabled={busy}
                  onClick={() => setConfirmingRemove(true)}
                >
                  Use Canvas&rsquo;s weights
                </button>
              )}
            </div>
          </div>
          {policy.notes.length > 0 && (
            <div className="text-[12.5px] leading-relaxed text-ink-3">
              <p className="text-ink-2">
                The syllabus also says (not applied here):
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {policy.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}
          {choosing && readers}
          {choosing && pasteArea}
        </div>
      ) : (
        <div className="grid gap-3">
          <div>
            <h3 className="text-[15px] font-medium text-ink">
              Grade {course.code} by its syllabus
            </h3>
            <p className="mt-1 max-w-[64ch] text-[13px] leading-relaxed text-ink-3">
              Read the syllabus to use its weights, drops, ranked exams, point
              caps, and letter scale instead of Canvas&rsquo;s groups.
              You&rsquo;ll see what it found before anything changes.
            </p>
          </div>
          {readers}
          {pasteArea}
        </div>
      )}
      <p
        aria-live="polite"
        className={cn(
          'text-[12.5px] empty:hidden',
          error ? 'mt-3 text-bad' : 'mt-3 text-ink-3',
        )}
      >
        {error || (phase.kind === 'busy' ? phase.label : '')}
      </p>
    </section>
  );
}

/** What a read found, before it is used. */
function Proposal({
  course,
  draft,
  report,
  onUse,
  onEdit,
  onCancel,
}: {
  course: GradeCourse;
  draft: GradePolicy;
  report: PolicyReport;
  onUse: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const names = sourceNames(course);
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="text-[15px] font-medium text-ink">
          Found in {draft.source}
        </h3>
        <p className="mt-1 text-[13px] text-ink-3">
          Check that each part counts the right Canvas work, then use the rules.
        </p>
      </div>
      <ul className="grid gap-2">
        {draft.components.map((component) => (
          <li
            key={component.key}
            className="grid gap-x-4 gap-y-1 rounded-lg border border-rule bg-paper px-3 py-2.5 sm:grid-cols-[4rem_minmax(0,1fr)]"
          >
            <span className="numeral text-[18px] leading-tight text-ink">
              {+component.weight.toFixed(2)}%
            </span>
            <div className="min-w-0">
              <p className="text-[14px] text-ink">
                <span className="font-medium">{component.name}</span>
                <span className="text-ink-3">
                  {' '}
                  · {describeScoring(component)}
                </span>
              </p>
              <p
                className={cn(
                  'mt-0.5 text-[12.5px]',
                  component.sources.length ? 'text-ink-3' : 'text-bad',
                )}
              >
                {component.sources.length
                  ? `Counts ${describeSources(component.sources, names)}`
                  : 'No Canvas work matched yet. Pick what counts with Adjust first.'}
              </p>
              {component.quote && (
                <p className="mt-1 border-l-2 border-rule pl-2 text-[12px] text-ink-4">
                  {component.quote}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="grid gap-1 text-[13px] text-ink-2">
        <p className={Math.abs(report.total - 100) < 0.5 ? '' : 'text-bad'}>
          Weights add up to {+report.total.toFixed(2)}%.
        </p>
        <p>
          {draft.cutoffs
            ? `Letter scale from the syllabus: A ${draft.cutoffs[0]}, B ${draft.cutoffs[1]}, C ${draft.cutoffs[2]}, D ${draft.cutoffs[3]}.`
            : 'No letter scale found; 90 / 80 / 70 / 60 stays.'}
          {draft.credits != null &&
            ` ${draft.credits} credit ${draft.credits === 1 ? 'hour' : 'hours'}.`}
        </p>
        {draft.notes.length > 0 && (
          <div className="text-[12.5px] leading-relaxed text-ink-3">
            <p className="text-ink-2">Also in the syllabus, not applied here:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {draft.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pill pill-sm pill-primary"
          onClick={onUse}
        >
          Use these rules
        </button>
        <button type="button" className="pill pill-sm" onClick={onEdit}>
          Adjust first
        </button>
        <button type="button" className="pill pill-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
