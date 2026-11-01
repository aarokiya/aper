'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  checkPractice,
  practiceAnswerText,
  stripHtml,
} from '@/lib/study/model';
import type { ItemKind } from '@/lib/study/prefs-schema';
import { seededShuffle, type SrsGrade, type StudyItem } from '@/lib/study/srs';
import type { StudyParsons, StudyQuickCheck } from '@/lib/study/types';
import { renderUserText } from '@/lib/study/user-text';
import { cn } from '@/lib/utils';
import { esc, LETTERS } from '../format';
import { Html } from '../html';
import { ParsonsBoard } from '../parsons-board';

/** What answering or revealing an item produced; `ok` is absent for self-graded cards. */
export type ItemResult = { answer?: string; ok?: boolean };

export const GRADES: ReadonlyArray<{ grade: SrsGrade; label: string }> = [
  { grade: 1, label: 'Again' },
  { grade: 2, label: 'Hard' },
  { grade: 3, label: 'Good' },
  { grade: 4, label: 'Easy' },
];

export const KIND_LABEL: Record<ItemKind, string> = {
  card: 'Card',
  quick: 'Quick check',
  practice: 'Practice',
  parsons: 'Arrange',
  mine: 'My card',
};

/** Keyboard shortcuts stay out of the way while the student types. */
export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
    return true;
  return (
    target instanceof HTMLInputElement &&
    !['radio', 'checkbox', 'button', 'submit', 'reset'].includes(target.type)
  );
}

/** Buttons and links activate themselves on Space/Enter. */
export const isControlTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('button, a, summary, [role="button"]') !== null;

/** Typed-answer check for a card's accepted answers. */
export const checkTyped = (answers: string[], value: string) =>
  checkPractice({ type: 'text', a: answers, q: '' }, value);

/** Suggested grade after an auto-checked answer: wrong → Again, right → Good. */
export const suggestedGrade = (result: ItemResult | null): SrsGrade | null =>
  result?.ok === undefined ? null : result.ok ? 3 : 1;

/** Focus an element once it mounts (without scrolling), when `enabled`. */
export function useFocusOnMount<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (enabled) ref.current?.focus({ preventScroll: true });
  }, [enabled]);
  return ref;
}

/**
 * Again / Hard / Good / Easy with their next intervals. Focus moves here
 * when it appears (onto the suggested grade, so Enter picks it).
 */
export function RatingBar({
  preview,
  suggested,
  onRate,
}: {
  preview: Record<SrsGrade, { label: string }> | null;
  suggested: SrsGrade | null;
  onRate: (grade: SrsGrade) => void;
}) {
  const group = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const root = group.current;
    if (!root) return;
    const target = suggested
      ? root.querySelector<HTMLButtonElement>(`[data-grade="${suggested}"]`)
      : root;
    target?.focus({ preventScroll: true });
  }, [suggested]);
  return (
    <fieldset ref={group} className="rv-rate" tabIndex={-1}>
      <legend className="sr">How well did you know it? Keys 1 to 4</legend>
      {GRADES.map(({ grade, label }) => (
        <button
          key={grade}
          type="button"
          data-grade={grade}
          className={cn('rv-grade', suggested === grade && 'sugg')}
          aria-keyshortcuts={String(grade)}
          onClick={() => onRate(grade)}
        >
          <span className="rv-gl">
            {label}
            {suggested === grade && <span className="sr"> (suggested)</span>}
          </span>
          {preview && <span className="rv-iv">{preview[grade].label}</span>}
          <span className="kbd" aria-hidden="true">
            {grade}
          </span>
        </button>
      ))}
    </fieldset>
  );
}

/** One-line answer field with a Check button (Enter checks). */
export function AnswerInput({
  label,
  mono,
  value,
  onChange,
  onCheck,
  status,
  placeholder = 'Answer',
  numeric = false,
  focusOnMount = false,
}: {
  label: string;
  mono: boolean;
  value: string;
  onChange: (value: string) => void;
  onCheck: () => void;
  /** null before checking */
  status: boolean | null;
  placeholder?: string;
  numeric?: boolean;
  focusOnMount?: boolean;
}) {
  const id = useId();
  const done = status !== null;
  const input = useFocusOnMount<HTMLInputElement>(focusOnMount);
  return (
    <div className="answer">
      <label className="sr" htmlFor={id}>
        {label}
      </label>
      <input
        ref={input}
        type="text"
        id={id}
        className={cn(
          mono && 'mono',
          done && (status ? 'right' : 'wrong'),
        )}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        readOnly={done}
        value={value}
        placeholder={placeholder}
        inputMode={numeric ? 'decimal' : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || done) return;
          event.preventDefault();
          onCheck();
        }}
      />
      {!done && (
        <button type="button" className="pill pill-primary" onClick={onCheck}>
          Check <span className="kbd" aria-hidden="true">Enter</span>
        </button>
      )}
    </div>
  );
}

/** Content HTML, or a user card's text made safe. */
function Rich({
  text,
  user,
  math,
  className,
}: {
  text: string;
  user: boolean;
  math: boolean;
  className?: string;
}) {
  return (
    <Html
      className={className}
      html={user ? renderUserText(text) : text}
      math={math}
    />
  );
}

type ViewProps = {
  item: StudyItem;
  math: boolean;
  codeLang?: string;
  /** mc option order seed, null to keep the authored order */
  shuffleSeed: string | null;
  /** null until revealed or checked */
  result: ItemResult | null;
  onResult: (result: ItemResult) => void;
};

/** A review item: card, typed card, user card, quick check, practice problem, or Parsons problem. */
export function ItemView(props: ViewProps) {
  const { item } = props;
  if (item.kind === 'parsons' && item.parsons)
    return <ParsonsView {...props} problem={item.parsons} />;
  if ((item.kind === 'quick' || item.kind === 'practice') && item.practice)
    return <PracticeView {...props} check={item.practice} />;
  const card = item.card ?? item.mine;
  if (!card) return null;
  return (
    <CardView
      {...props}
      front={card.f}
      back={card.b}
      answers={card.a?.length ? card.a : null}
      user={item.kind === 'mine'}
    />
  );
}

function CardView({
  math,
  codeLang,
  result,
  onResult,
  front,
  back,
  answers,
  user,
}: ViewProps & {
  front: string;
  back: string;
  answers: string[] | null;
  user: boolean;
}) {
  const showButton = useFocusOnMount<HTMLButtonElement>(!answers);
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const check = () => {
    if (!answers) return;
    if (!value.trim()) {
      setMessage('Type an answer first.');
      return;
    }
    setMessage(null);
    onResult({ answer: value, ok: checkTyped(answers, value) });
  };
  return (
    <div className={cn('rv-card', result && 'shown')}>
      <Rich className="fc-f rv-front" text={front} user={user} math={math} />
      {answers && (
        <>
          <AnswerInput
            label="Your answer"
            mono={Boolean(codeLang)}
            value={value}
            onChange={(next) => {
              setValue(next);
              setMessage(null);
            }}
            onCheck={check}
            status={result ? Boolean(result.ok) : null}
            focusOnMount
          />
          <div
            className={cn('fb', !message && result && (result.ok ? 'ok' : 'bad'))}
            aria-live="polite"
          >
            {message ??
              (result
                ? result.ok
                  ? 'Correct'
                  : `Not quite. Accepted: ${answers[0]}`
                : '')}
          </div>
        </>
      )}
      {result ? (
        <div className="rv-back">
          <div className="fc-lbl">Answer</div>
          <Rich className="fc-b" text={back} user={user} math={math} />
        </div>
      ) : (
        <div className="rv-reveal">
          {answers ? (
            <button
              type="button"
              className="textlink"
              onClick={() => onResult({ answer: value, ok: false })}
            >
              I don&apos;t know, show the answer
            </button>
          ) : (
            <button
              ref={showButton}
              type="button"
              className="pill pill-primary"
              onClick={() => onResult({})}
            >
              Show answer <span className="kbd" aria-hidden="true">Space</span>
            </button>
          )}
        </div>
      )}
      {!answers && (
        <div className="sr" aria-live="polite">
          {result ? `Answer: ${user ? back : stripHtml(back)}` : ''}
        </div>
      )}
    </div>
  );
}

function PracticeView({
  item,
  math,
  codeLang,
  shuffleSeed,
  result,
  onResult,
  check: q,
}: ViewProps & { check: StudyQuickCheck }) {
  const name = useId();
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const mc = q.type === 'mc';
  const order = useMemo(() => {
    const indices = (q.opts ?? []).map((_, i) => i);
    return shuffleSeed ? seededShuffle(indices, shuffleSeed) : indices;
  }, [q, shuffleSeed]);
  const firstOption = useFocusOnMount<HTMLInputElement>(mc);

  const submit = () => {
    if (mc ? value === '' : !value.trim()) {
      setMessage(mc ? 'Pick an option first.' : 'Type an answer first.');
      return;
    }
    setMessage(null);
    onResult({ answer: value, ok: checkPractice(q, value) });
  };

  const picked = result?.answer ? Number(result.answer) : -1;
  const why = mc && result ? q.why?.[picked] : undefined;
  const answerHtml = mc
    ? practiceAnswerText(q)
    : esc(practiceAnswerText(q));

  return (
    <div className="rv-practice">
      {q.src && <div className="src">{q.src}</div>}
      <Html className="q rv-q" html={q.q} math={math} />
      {mc ? (
        <>
          <div
            className="opts"
            role="radiogroup"
            aria-label={`Options for ${item.label}`}
          >
            {order.map((oi, position) => {
              const chosen = value === String(oi);
              const tone = result
                ? oi === Number(q.a)
                  ? 'right'
                  : oi === picked
                    ? 'wrong'
                    : undefined
                : undefined;
              return (
                <label key={oi} className={tone}>
                  <input
                    ref={position === 0 ? firstOption : undefined}
                    type="radio"
                    name={name}
                    value={oi}
                    checked={chosen}
                    disabled={result !== null}
                    onChange={() => {
                      setValue(String(oi));
                      setMessage(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      submit();
                    }}
                  />
                  <span className="let" aria-hidden="true">
                    {LETTERS[position]}
                  </span>
                  <Html html={q.opts?.[oi] ?? ''} math={math} />
                </label>
              );
            })}
          </div>
          {!result && (
            <div className="answer">
              <button
                type="button"
                className="pill pill-primary"
                onClick={submit}
              >
                Check <span className="kbd" aria-hidden="true">Enter</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <AnswerInput
          label={`Your answer to ${item.label}`}
          mono={Boolean(codeLang)}
          value={value}
          onChange={(next) => {
            setValue(next);
            setMessage(null);
          }}
          onCheck={submit}
          status={result ? Boolean(result.ok) : null}
          placeholder={q.type === 'set' ? '1, 2, 3' : 'Answer'}
          numeric={q.type === 'num'}
          focusOnMount
        />
      )}
      <div
        className={cn('fb', !message && result && (result.ok ? 'ok' : 'bad'))}
        aria-live="polite"
      >
        {message ??
          (result
            ? result.ok
              ? 'Correct'
              : result.answer
                ? 'Not quite.'
                : 'Shown without an answer.'
            : '')}
      </div>
      {result ? (
        <Html
          className="reveal sol"
          html={`<b>Answer: ${answerHtml}.</b> ${why ?? q.sol ?? q.hint ?? ''}`}
          math={math}
        />
      ) : (
        <div className="rv-reveal">
          <button
            type="button"
            className="textlink"
            onClick={() => onResult({ answer: '', ok: false })}
          >
            I don&apos;t know, show the answer
          </button>
        </div>
      )}
    </div>
  );
}

function ParsonsView({
  item,
  math,
  result,
  onResult,
  problem,
}: ViewProps & { problem: StudyParsons }) {
  return (
    <div className="rv-parsons">
      {problem.title && <div className="rv-ptitle">{problem.title}</div>}
      <Html className="q rv-q" html={problem.q} math={math} />
      <ParsonsBoard
        key={item.key}
        problem={problem}
        seed={item.key}
        math={math}
        onResult={(r) => {
          // The first check is the one graded; retries are practice.
          if (!result) onResult({ answer: r.answer.join('\n'), ok: r.ok });
        }}
      />
    </div>
  );
}
