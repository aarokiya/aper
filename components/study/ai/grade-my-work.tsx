'use client';

import 'katex/dist/katex.min.css';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  PAD_START_HEIGHT,
  attachPad,
  exportPad,
  preparePhoto,
  type PadControls,
  type PadState,
} from '@/components/study/ai/canvas';
import {
  GRADE_ERROR_COPY,
  VERDICT_LABEL,
  escapeHtml,
  gradeTutorContext,
} from '@/components/study/ai/format';
import { useTutor, type TutorCourse } from '@/components/study/ai/tutor';
import { GRADE_MAX_IMAGES } from '@/lib/groq/grade';
import { renderMathInHtml } from '@/lib/study/math';
import { fmtPts } from '@/lib/study/model';
import type { StudyGrade } from '@/lib/study/types';
import { cn } from '@/lib/utils';

type Mode = 'draw' | 'photo' | 'type';
type Draft = { mode: Mode; files: File[]; typed: string; pad: PadState };

const MODES: Array<[Mode, string]> = [
  ['draw', 'Write here'],
  ['photo', 'Upload a photo'],
  ['type', 'Type it'],
];
const SYMBOLS = [
  '¬',
  '∧',
  '∨',
  '→',
  '↔',
  '≡',
  '∀',
  '∃',
  '∈',
  '∉',
  '⊆',
  '∪',
  '∩',
  '∅',
  '≤',
  '≥',
  '≠',
  'ℤ',
  'ℕ',
  'ℝ',
  'λ',
  '·',
  '²',
  '∎',
];
const PHOTO_TYPES =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif';

/**
 * Work in progress per problem, kept for the life of the tab (not persisted,
 * as in the artifact): switching modes, closing the panel, or moving to
 * another week and back keeps the drawing, photos, and typed answer.
 */
const drafts = new Map<string, Draft>();

function draftFor(key: string): Draft {
  const existing = drafts.get(key);
  if (existing) return existing;
  const draft: Draft = {
    mode: 'draw',
    files: [],
    typed: '',
    pad: { strokes: [], height: PAD_START_HEIGHT },
  };
  if (typeof window !== 'undefined') drafts.set(key, draft);
  return draft;
}

export type GradeMyWorkProps = {
  course: TutorCourse;
  /** Where the caller stores the grade (`gr[gradeKey]`); also keys the draft. */
  gradeKey: string;
  /** Names the problem for the tutor, e.g. "Studio 2, week 3". */
  label: string;
  /** Plain text. */
  problem: string;
  /** Plain text; empty when there is no reference solution. */
  reference: string;
  points: number;
  saved?: StudyGrade;
  onGraded: (grade: StudyGrade) => void;
  /** Open the hand-in panel straight away (the grader page). */
  defaultOpen?: boolean;
};

/**
 * "Grade my work": hand in a drawing, photos, or typed work and get line-by-
 * line marks from the AI grader. The caller persists the grade it receives in
 * `onGraded` and passes it back as `saved`. Without a Groq key the toggle is
 * hidden; a saved grade still shows.
 */
export function GradeMyWork({
  course,
  gradeKey,
  label,
  problem,
  reference,
  points,
  saved,
  onGraded,
  defaultOpen = false,
}: GradeMyWorkProps) {
  const { enabled } = useTutor();
  const [open, setOpen] = useState(defaultOpen);
  const [built, setBuilt] = useState(defaultOpen);
  const panelId = useId();
  const card = useRef<HTMLDivElement>(null);
  const reveal = useRef(false);

  // Bring a fresh grade into view once the caller has saved it and passed it back.
  useLayoutEffect(() => {
    if (!reveal.current || !saved) return;
    reveal.current = false;
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    card.current?.scrollIntoView({
      block: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [saved]);

  const graded = useCallback(
    (grade: StudyGrade) => {
      reveal.current = true;
      onGraded(grade);
    },
    [onGraded],
  );

  return (
    <div className="mt-[18px]">
      {enabled ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => {
              setBuilt(true);
              setOpen(!open);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-transparent px-[13px] py-1 text-[0.8125rem] text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            Grade my work
          </button>
          {built ? (
            <GraderPanel
              key={`${course.id}-${gradeKey}`}
              id={panelId}
              hidden={!open}
              course={course}
              draftKey={`${course.id}-${gradeKey}`}
              problem={problem}
              reference={reference}
              points={points}
              onGraded={graded}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      ) : defaultOpen ? (
        <p className="max-w-[60ch] rounded-lg border border-rule px-4 py-3.5 text-[0.875rem] leading-relaxed text-ink-2">
          Grading uses Groq, and no API key is set yet. Add one in{' '}
          <Link
            href="/settings#groq"
            className="text-ink underline underline-offset-[3px] hover:no-underline"
          >
            Settings under Groq API key
          </Link>
          , then come back to this page.
        </p>
      ) : null}
      {saved ? (
        <div ref={card} className="scroll-mt-6">
          <GradeCard
            course={course}
            grade={saved}
            label={label}
            problem={problem}
            reference={reference}
          />
        </div>
      ) : null}
    </div>
  );
}

type Status = { text: string; error: boolean };

class GradeFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function GraderPanel({
  id,
  hidden,
  course,
  draftKey,
  problem,
  reference,
  points,
  onGraded,
  onClose,
}: {
  id: string;
  hidden: boolean;
  course: TutorCourse;
  draftKey: string;
  problem: string;
  reference: string;
  points: number;
  onGraded: (grade: StudyGrade) => void;
  onClose: () => void;
}) {
  const [draft] = useState(() => draftFor(draftKey));
  const [mode, setMode] = useState(draft.mode);
  const [files, setFiles] = useState(draft.files);
  const [typed, setTyped] = useState(draft.typed);
  const [strokes, setStrokes] = useState(draft.pad.strokes.length);
  const [status, setStatus] = useState<Status>({ text: '', error: false });
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const padWrap = useRef<HTMLDivElement>(null);
  const padCanvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<PadControls | null>(null);
  const answer = useRef<HTMLTextAreaElement>(null);
  const answerId = useId();
  const code = Boolean(course.code_lang);

  const countStrokes = useCallback(
    () => setStrokes(draft.pad.strokes.length),
    [draft],
  );

  useEffect(() => {
    if (mode !== 'draw' || !padWrap.current || !padCanvas.current) return;
    const controls = attachPad(
      padWrap.current,
      padCanvas.current,
      draft.pad,
      countStrokes,
    );
    pad.current = controls;
    return () => {
      controls.detach();
      pad.current = null;
    };
  }, [mode, draft, countStrokes]);

  // A request still running when the problem leaves the page is abandoned.
  useEffect(() => () => controller.current?.abort(), []);

  // Object URLs belong to the effect that made them, so StrictMode's remount cannot revoke live previews.
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const fail = (text: string) => setStatus({ text, error: true });

  const chooseMode = (next: Mode) => {
    draft.mode = next;
    setMode(next);
    setStatus({ text: '', error: false });
  };

  const addFiles = (list: FileList | null) => {
    const all = Array.from(list ?? []);
    const images = all.filter((file) => file.type.startsWith('image/'));
    draft.files = [...draft.files, ...images].slice(0, GRADE_MAX_IMAGES);
    setFiles(draft.files);
    if (all.length && !images.length)
      fail("That file isn't an image. Use a JPG or PNG photo.");
    else setStatus({ text: '', error: false });
  };

  const removeFile = (index: number) => {
    draft.files = draft.files.filter((_, at) => at !== index);
    setFiles(draft.files);
  };

  const insert = (text: string) => {
    const element = answer.current;
    if (!element) return;
    element.setRangeText(
      text,
      element.selectionStart,
      element.selectionEnd,
      'end',
    );
    draft.typed = element.value;
    setTyped(element.value);
    element.focus();
  };

  async function grade() {
    if (controller.current) {
      controller.current.abort();
      return;
    }
    if (!problem.trim()) return fail('Type the problem statement first.');
    if (mode === 'draw' && !draft.pad.strokes.length)
      return fail('Write your answer first.');
    if (mode === 'photo' && !draft.files.length)
      return fail('Add a photo of your work first.');
    const work = mode === 'type' ? draft.typed.trim() : '';
    if (mode === 'type' && !work) return fail('Type your answer first.');
    const width = padWrap.current?.clientWidth ?? 640;

    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setStatus({
      text: 'Grading… this usually takes 10 to 40 seconds.',
      error: false,
    });
    try {
      const images =
        mode === 'draw'
          ? [await exportPad(draft.pad, width)]
          : mode === 'photo'
            ? await Promise.all(draft.files.map(preparePhoto))
            : [];
      const form = new FormData();
      form.set('courseId', course.id);
      form.set('problem', problem);
      form.set('reference', reference);
      form.set('points', String(points));
      if (work) form.set('typed', work);
      images.forEach((image, index) =>
        form.append('images', image, `page-${index + 1}`),
      );
      const response = await fetch('/api/study/grade', {
        method: 'POST',
        body: form,
        signal: request.signal,
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as StudyGrade & { code?: string; error?: string };
      if (!response.ok)
        throw new GradeFailure(payload.code ?? 'http', payload.error ?? '');
      setStatus({
        text: payload.readable ? 'Graded. Marks are below.' : '',
        error: false,
      });
      onGraded(payload);
    } catch (error) {
      const failure = error instanceof GradeFailure ? error : null;
      const reason = request.signal.aborted
        ? 'cancelled'
        : (failure?.code ?? 'http');
      const text =
        GRADE_ERROR_COPY[reason] ??
        (failure?.message || GRADE_ERROR_COPY.fallback);
      setStatus({ text, error: reason !== 'cancelled' });
    } finally {
      if (controller.current === request) controller.current = null;
      setBusy(false);
    }
  }

  return (
    <div
      id={id}
      hidden={hidden}
      className="mt-[18px] rounded-lg border border-rule px-4 pt-3.5 pb-4"
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-[18px] border-b border-rule">
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-x-[18px] border-0 p-0">
          <legend className="sr">How to hand in your work</legend>
          {MODES.map(([value, name]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => chooseMode(value)}
              className={cn(
                '-mb-px cursor-pointer border-b-[1.5px] pb-2 text-[0.8125rem] transition-colors',
                mode === value
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink-3 hover:text-ink',
              )}
            >
              {name}
            </button>
          ))}
        </fieldset>
        <span className="flex-1" />
        <button type="button" className="textlink pb-2" onClick={onClose}>
          Close
        </button>
      </div>

      {mode === 'draw' ? (
        <>
          <p className="mb-2 text-[0.8125rem] text-ink-3">
            Write with a finger, stylus, or mouse, one step per line.
          </p>
          <div
            ref={padWrap}
            className="relative touch-none overflow-hidden rounded-md border border-rule bg-paper"
          >
            <canvas
              ref={padCanvas}
              className="block w-full cursor-crosshair touch-none"
              style={{ height: draft.pad.height }}
            >
              Writing area for your answer. To use the keyboard instead, choose
              Type it.
            </canvas>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              className="pill"
              disabled={!strokes}
              onClick={() => pad.current?.undo()}
            >
              Undo
            </button>
            <button
              type="button"
              className="pill"
              disabled={!strokes}
              onClick={() => pad.current?.clear()}
            >
              Clear
            </button>
            <button
              type="button"
              className="pill"
              onClick={() => pad.current?.more()}
            >
              Add more room
            </button>
          </div>
        </>
      ) : mode === 'photo' ? (
        <>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              addFiles(event.dataTransfer.files);
            }}
          >
            <label
              className={cn(
                'block cursor-pointer rounded-md border border-dashed px-[22px] py-[22px] text-center text-[0.875rem] leading-relaxed text-ink-2 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink',
                over ? 'border-ink' : 'border-rule-2 hover:border-ink-4',
              )}
            >
              Drop a photo of your written work here, or{' '}
              <u className="underline-offset-[3px]">choose photos</u>.
              <br />
              <small className="text-[0.8125rem] text-ink-3">
                Flat page, good light, whole answer in frame. Up to{' '}
                {GRADE_MAX_IMAGES} pages.
              </small>
              <input
                type="file"
                className="sr"
                accept={PHOTO_TYPES}
                multiple
                onChange={(event) => {
                  addFiles(event.currentTarget.files);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
          {urls.length ? (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {urls.map((url, index) => (
                <figure key={url} className="relative m-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob: preview of a photo that never leaves the page until grading */}
                  <img
                    src={url}
                    alt={`Page ${index + 1}`}
                    className="block h-[110px] rounded border border-rule grayscale"
                  />
                  <button
                    type="button"
                    aria-label={`Remove page ${index + 1}`}
                    onClick={() => removeFile(index)}
                    className="absolute top-1 right-1 grid size-[22px] place-items-center rounded-full bg-black/65 text-[0.8125rem] leading-none text-white"
                  >
                    ×
                  </button>
                </figure>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {code ? null : (
            <fieldset className="m-0 mb-2 flex min-w-0 flex-wrap gap-[3px] border-0 p-0">
              <legend className="sr">Insert a symbol</legend>
              {SYMBOLS.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insert(symbol)}
                  className="h-[26px] min-w-[26px] cursor-pointer rounded border border-rule px-1 text-center font-serif text-[0.9375rem] leading-[24px] text-ink-2 transition-colors hover:border-ink hover:text-ink"
                >
                  {symbol}
                </button>
              ))}
            </fieldset>
          )}
          <label htmlFor={answerId} className="sr">
            Your answer
          </label>
          <textarea
            ref={answer}
            id={answerId}
            value={typed}
            spellCheck={false}
            placeholder={
              code
                ? 'Write your code here.'
                : 'Write your answer here, one step per line.'
            }
            onChange={(event) => {
              draft.typed = event.target.value;
              setTyped(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Tab' || !code || event.shiftKey) return;
              event.preventDefault();
              insert('    ');
            }}
            className={cn(
              'block min-h-[200px] w-full resize-y rounded-md border border-rule bg-transparent px-3 py-2.5 text-ink placeholder:text-ink-4 focus:border-ink focus:outline-none',
              code
                ? 'font-mono text-[0.84375rem] leading-[1.6] [tab-size:4]'
                : 'font-serif text-base leading-[1.7]',
            )}
          />
        </>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="pill pill-primary"
          onClick={() => void grade()}
        >
          {busy ? 'Stop' : 'Grade it'}
        </button>
        <span
          aria-live="polite"
          className={cn(
            'text-[0.8125rem]',
            status.error ? 'text-bad' : 'text-ink-3',
          )}
        >
          {status.text}
        </span>
      </div>
    </div>
  );
}

const CHECK = (
  <>
    <svg viewBox="0 0 40 36" width="16" height="15" aria-hidden="true">
      <path
        d="M5 20c3 2 6 5 9 11C19 19 26 10 36 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    <span className="sr">correct</span>
  </>
);

const CROSS = (
  <>
    <svg viewBox="0 0 40 36" width="16" height="15" aria-hidden="true">
      <path
        d="M9 6c7 7 15 15 23 25M31 5C24 13 16 21 8 31"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </svg>
    <span className="sr">wrong</span>
  </>
);

/** Text from the grader; TeX in it is typeset for math courses, as the artifact typeset the whole result. */
function GradeText({
  math,
  className,
  children,
}: {
  math: boolean;
  className?: string;
  children: string;
}) {
  const html = useMemo(
    () => (math ? renderMathInHtml(escapeHtml(children)) : null),
    [math, children],
  );
  return html === null ? (
    <span className={className}>{children}</span>
  ) : (
    <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** The artifact's graded block (gradedHTML): score, verdict, marked transcript, summary. */
export function GradeCard({
  course,
  grade,
  label,
  problem,
  reference,
}: {
  course: TutorCourse;
  grade: StudyGrade;
  label: string;
  problem: string;
  reference: string;
}) {
  const { enabled, ask } = useTutor();
  const tone = grade.verdict === 'correct' ? 'text-good' : 'text-bad';
  let body: ReactNode;
  if (!grade.readable) {
    body = (
      <p className="text-[0.90625rem] leading-[1.6] text-ink">
        I couldn&rsquo;t read this as an attempt at the problem. Try a sharper
        photo, or write bigger and line by line.
      </p>
    );
  } else {
    body = (
      <>
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <span className={cn('numeral text-[1.875rem] leading-none', tone)}>
            {fmtPts(grade.score)}/{fmtPts(grade.max)}
          </span>
          <span className={cn('text-[0.875rem]', tone)}>
            {VERDICT_LABEL[grade.verdict]}
          </span>
          {grade.at ? (
            <span className="text-xs text-ink-4">
              Graded{' '}
              {new Date(grade.at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          ) : null}
        </div>
        {grade.lines.length || grade.missing.length ? (
          <ul className="mt-1.5">
            {grade.lines.map((line, index) => (
              <li
                key={index}
                className="grid grid-cols-[22px_1fr] gap-x-2.5 gap-y-1 border-b border-rule py-1.5"
              >
                <span
                  className={cn(
                    'col-start-1 row-start-1 pt-[5px]',
                    line.mark === 'ok'
                      ? 'text-good'
                      : line.mark === 'error'
                        ? 'text-bad'
                        : '',
                  )}
                >
                  {line.mark === 'ok'
                    ? CHECK
                    : line.mark === 'error'
                      ? CROSS
                      : null}
                </span>
                <GradeText
                  math={course.math}
                  className={cn(
                    'col-start-2 row-start-1 font-serif text-base leading-[1.55] break-words',
                    line.mark === 'error' && 'text-bad',
                  )}
                >
                  {line.text}
                </GradeText>
                {line.mark === 'error' && line.note ? (
                  <GradeText
                    math={course.math}
                    className="col-start-2 text-[0.8125rem] text-bad"
                  >
                    {line.note}
                  </GradeText>
                ) : null}
              </li>
            ))}
            {grade.missing.map((item, index) => (
              <li
                key={`missing-${index}`}
                className="grid grid-cols-[22px_1fr] gap-x-2.5 border-b border-rule py-1.5"
              >
                <span className="col-start-2 font-serif text-base leading-[1.55] text-bad italic">
                  Missing: <GradeText math={course.math}>{item}</GradeText>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {grade.summary || (grade.next && grade.verdict !== 'correct') ? (
          <div className="mt-3 space-y-1 text-[0.90625rem] leading-[1.6]">
            {grade.summary ? (
              <p
                className={
                  grade.verdict === 'correct' ? 'text-good' : 'text-ink'
                }
              >
                <GradeText math={course.math}>{grade.summary}</GradeText>
              </p>
            ) : null}
            {grade.next && grade.verdict !== 'correct' ? (
              <p className="text-ink">
                Fix first:{' '}
                <GradeText math={course.math}>{grade.next}</GradeText>
              </p>
            ) : null}
          </div>
        ) : null}
        {enabled ? (
          <div className="mt-3">
            <button
              type="button"
              className="textlink"
              onClick={() =>
                ask(gradeTutorContext(label, problem, reference, grade))
              }
            >
              Ask the tutor about this grade
            </button>
          </div>
        ) : null}
        <p className="mt-2.5 text-xs text-ink-4">
          Graded by AI. It can misread handwriting, so double-check anything
          that looks off.
        </p>
      </>
    );
  }
  return <div className="mt-5 border-t border-rule pt-4">{body}</div>;
}
