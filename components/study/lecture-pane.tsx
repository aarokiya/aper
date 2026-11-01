'use client';

import { useRef, useState } from 'react';
import type { CondensedPart } from '@/lib/study/condense';
import {
  checkPractice,
  practiceAnswerText,
  qcKey,
  stripHtml,
  weekQuiz,
} from '@/lib/study/model';
import { coursePrefs, type StudyPrefs } from '@/lib/study/prefs-schema';
import { quickItem, rateIfNew } from '@/lib/study/srs';
import type {
  StudyCourse,
  StudyLecture,
  StudyLecturePart,
  StudyQuickCheck,
  StudyWeek,
} from '@/lib/study/types';
import { cn } from '@/lib/utils';
import { AskButton } from './ask';
import { ReadAlong } from './bits';
import { esc, LETTERS } from './format';
import { Html } from './html';
import type { PaneProps } from './pane';

/** Reading speed for the time estimates, words per minute. */
const WPM = 230;

const readingMinutes = (words: number) => Math.max(1, Math.round(words / WPM));

/**
 * Lecture tab (artifact renderLecture): notes, quick checks, read-along,
 * sections, self-checks, "Mark as reviewed". Weeks with long notes open in
 * "Key ideas" (definitions, takeaways, first example per part; orientation
 * and worked examples folded) with "Full notes" a toggle away; the choice is
 * saved per course. Quick checks show under their part in both modes.
 */
export function LecturePane({
  course,
  week,
  state,
  update,
  onTab,
  prefs,
  updatePrefs,
  condensed,
}: PaneProps & {
  prefs: StudyPrefs;
  updatePrefs: (mutate: (draft: StudyPrefs) => void) => void;
  /** per lecture, per part (see condenseWeek) */
  condensed: CondensedPart[][];
}) {
  const reviewed = Boolean(state.lec[week.n]);
  const quiz = weekQuiz(week);
  const quizCorrect = quiz.filter(
    (item) => state.lq[qcKey(week, item)]?.ok,
  ).length;
  const weekPrefix = `${week.n}-`;
  const quizSaved = Object.keys(state.lq).some((key) =>
    key.startsWith(weekPrefix),
  );
  // Parts opened in Key ideas mode: full section of a key part, or a folded part.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const parts = condensed.flat();
  const condensable = parts.some((part) => part.mode !== 'full');
  const keyMode = condensable && coursePrefs(prefs, course.id).notes === 'key';
  const fullMinutes = readingMinutes(
    parts.reduce((sum, part) => sum + part.fullWords, 0),
  );
  const keyMinutes = readingMinutes(
    parts.reduce(
      (sum, part) =>
        sum +
        (part.mode === 'full'
          ? part.fullWords
          : part.mode === 'key'
            ? part.keyWords
            : 0),
      0,
    ),
  );
  const quickChecks = (part: StudyLecturePart, li: number, pi: number) =>
    (part.quiz ?? []).map((item, qi, list) => {
      const key = qcKey(week, item);
      return (
        <QuickCheck
          key={qi}
          id={`${week.n}-${li}-${pi}-${qi}`}
          label={
            list.length > 1
              ? `Quick check ${qi + 1} of ${list.length}`
              : 'Quick check'
          }
          item={item}
          part={part}
          course={course}
          week={week}
          result={state.lq[key]}
          onCheck={(a, ok) =>
            update((draft) => {
              // First answer: schedule it (rateIfNew also records lq when absent).
              if (!draft.lq[key])
                rateIfNew(
                  draft,
                  quickItem(course, week, item),
                  ok ? 3 : 1,
                  Date.now(),
                  prefs,
                  { answer: a, ok },
                );
              draft.lq[key] = { a, ok };
            })
          }
        />
      );
    });

  const askButton = (lecture: StudyLecture, part: StudyLecturePart) => (
    <AskButton
      context={() => ({
        label: part.h,
        text: `${course.code} week ${week.n} notes (${lecture.title}), section "${part.h}":\n${stripHtml(part.b)}`,
        starter: 'Explain this section more simply, with one fresh example.',
      })}
    >
      Explain this simpler
    </AskButton>
  );

  const renderPart = (
    lecture: StudyLecture,
    part: StudyLecturePart,
    li: number,
    pi: number,
  ) => {
    const id = `${li}-${pi}`;
    const bodyId = `part-${week.n}-${id}`;
    const cut = keyMode ? condensed[li]?.[pi] : undefined;
    const isOpen = Boolean(open[id]);
    if (cut?.mode === 'collapsed')
      return (
        <div className="part part-fold" key={`${pi}-${part.h}`}>
          <div className="part-h">
            <h4>
              <button
                type="button"
                className="fold"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() =>
                  setOpen((prev) => ({ ...prev, [id]: !prev[id] }))
                }
              >
                <span className="fold-i" aria-hidden="true">
                  {isOpen ? '−' : '+'}
                </span>
                {cut.label}
              </button>
            </h4>
            {isOpen && askButton(lecture, part)}
          </div>
          <div id={bodyId} hidden={!isOpen}>
            {isOpen && (
              <Html className="prose" html={part.b} math={course.math} />
            )}
          </div>
          {quickChecks(part, li, pi)}
        </div>
      );
    return (
      <div className="part" key={`${pi}-${part.h}`}>
        <div className="part-h">
          <h4>{part.h}</h4>
          {askButton(lecture, part)}
        </div>
        {cut?.mode === 'key' ? (
          <div id={bodyId}>
            {isOpen ? (
              <Html className="prose" html={part.b} math={course.math} />
            ) : (
              <>
                <Html className="prose" html={cut.html} math={course.math} />
                {cut.traps.length > 0 && (
                  <details className="traps">
                    <summary>Watch out ({cut.traps.length})</summary>
                    <Html
                      className="prose"
                      html={cut.traps.join('')}
                      math={course.math}
                    />
                  </details>
                )}
              </>
            )}
          </div>
        ) : (
          <Html className="prose" html={part.b} math={course.math} />
        )}
        {cut?.mode === 'key' && (
          <div className="cut-row">
            <button
              type="button"
              className="textlink"
              aria-expanded={isOpen}
              aria-controls={bodyId}
              onClick={() =>
                setOpen((prev) => ({ ...prev, [id]: !prev[id] }))
              }
            >
              {isOpen ? 'Show key ideas only' : 'Show full section'}
            </button>
            {!isOpen && (
              <span className="cut-n">
                {cut.keyWords} of {cut.fullWords} words shown
              </span>
            )}
          </div>
        )}
        {quickChecks(part, li, pi)}
      </div>
    );
  };

  return (
    <>
      {condensable && (
        <div className="notes-mode">
          <fieldset className="seg">
            <legend className="sr">Notes view</legend>
            {(
              [
                ['key', 'Key ideas'],
                ['full', 'Full notes'],
              ] as const
            ).map(([notes, label]) => (
              <button
                key={notes}
                type="button"
                aria-pressed={keyMode === (notes === 'key')}
                onClick={() =>
                  updatePrefs((draft) => {
                    draft.courses[course.id] = {
                      ...coursePrefs(draft, course.id),
                      notes,
                    };
                  })
                }
              >
                {label}
              </button>
            ))}
          </fieldset>
          <p className="notes-time">
            {keyMode
              ? `Key ideas: about ${keyMinutes} min of reading (full notes: ${fullMinutes} min).`
              : `Full notes: about ${fullMinutes} min of reading (key ideas: ${keyMinutes} min).`}
          </p>
        </div>
      )}
      {week.note && (
        <Html className="note" html={week.note} math={course.math} />
      )}
      <ReadAlong course={course} week={week} />
      {week.lectures.map((lecture, li) => (
        <section
          className="lec"
          key={`${li}-${lecture.title}`}
          aria-labelledby={`lec-${week.n}-${li}`}
        >
          <div className="lec-h">
            <h3 id={`lec-${week.n}-${li}`}>{lecture.title}</h3>
            <span>
              {[lecture.when, lecture.sec !== lecture.when ? lecture.sec : '']
                .filter(Boolean)
                .join('. ')}
            </span>
          </div>
          {lecture.parts.map((part, pi) => renderPart(lecture, part, li, pi))}
        </section>
      ))}
      {week.checks.length > 0 && (
        <section className="lec" aria-labelledby={`checks-${week.n}`}>
          <div className="lec-h">
            <h3 id={`checks-${week.n}`}>Can you do these without notes?</h3>
          </div>
          <ul className="checks">
            {week.checks.map((text, i) => {
              const key = `${week.n}-${i}`;
              return (
                <li key={key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(state.chk[key])}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        update((draft) => {
                          if (checked) draft.chk[key] = 1;
                          else delete draft.chk[key];
                        });
                      }}
                    />
                    <span>{text}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className="done-row">
        <button
          type="button"
          className={reviewed ? 'pill pill-on' : 'pill pill-primary'}
          aria-pressed={reviewed}
          onClick={() =>
            update((draft) => {
              draft.lec[week.n] = !draft.lec[week.n];
            })
          }
        >
          {reviewed ? 'Reviewed ✓' : 'Mark as reviewed'}
        </button>
        {week.practice.length > 0 && (
          <button
            type="button"
            className="textlink"
            onClick={() => onTab('practice')}
          >
            Next: {course.labels.practice}
          </button>
        )}
        {quiz.length > 0 && (
          <span className="qc-sum">
            Quick checks: {quizCorrect} of {quiz.length} correct
          </span>
        )}
        {quiz.length > 0 && quizSaved && (
          <button
            type="button"
            className="textlink"
            onClick={() => {
              if (
                !window.confirm(
                  `Clear your answers to this week's ${quiz.length} quick checks so you can take them fresh?`,
                )
              )
                return;
              update((draft) => {
                for (const key of Object.keys(draft.lq))
                  if (key.startsWith(weekPrefix)) delete draft.lq[key];
              });
            }}
          >
            Clear my quick-check answers
          </button>
        )}
      </div>
    </>
  );
}

/** One quick check under a lecture part (artifact qcHTML/wireQC). */
function QuickCheck({
  id,
  label,
  item,
  part,
  course,
  week,
  result,
  onCheck,
}: {
  id: string;
  label: string;
  item: StudyQuickCheck;
  part: StudyLecturePart;
  course: StudyCourse;
  week: StudyWeek;
  result: { a: string; ok: boolean } | undefined;
  onCheck: (answer: string, ok: boolean) => void;
}) {
  const [value, setValue] = useState(result?.a ?? '');
  // Typing or picking again clears the right/wrong styling until the next check.
  const [edited, setEdited] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  // A saved answer changing elsewhere (Clear, the rail's reset) resets this check too.
  const [seen, setSeen] = useState(result);
  if (result !== seen) {
    setSeen(result);
    setMessage(null);
    setRevealed(false);
    if ((result?.a ?? '') !== value) {
      setValue(result?.a ?? '');
      setEdited(false);
    }
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const checkRef = useRef<HTMLButtonElement>(null);
  const mc = item.type === 'mc';
  const styled = result && !edited ? (result.ok ? 'right' : 'wrong') : '';
  const why = mc && result ? item.why?.[Number(result.a)] : undefined;

  const check = () => {
    if (mc ? value === '' : !value.trim()) {
      setMessage(mc ? 'Pick an option first.' : 'Type an answer first.');
      return;
    }
    const ok = checkPractice(item, value);
    onCheck(value, ok);
    setEdited(false);
    setMessage(null);
    setRevealed(false);
    ((!ok && inputRef.current) || checkRef.current)?.focus({
      preventScroll: true,
    });
  };

  const edit = (next: string) => {
    setValue(next);
    setEdited(true);
  };

  return (
    <div className={cn('qc', result && (result.ok ? 'ok' : 'bad'))}>
      <div className="qc-t">{label}</div>
      <Html className="q" html={item.q} math={course.math} />
      {mc && (
        <div className="opts" role="radiogroup" aria-label={label}>
          {(item.opts ?? []).map((option, oi) => {
            const picked = value === String(oi);
            return (
              <label key={oi} className={picked && styled ? styled : undefined}>
                <input
                  type="radio"
                  name={`qc-${id}`}
                  value={oi}
                  checked={picked}
                  onChange={() => edit(String(oi))}
                />
                <span className="let" aria-hidden="true">
                  {LETTERS[oi]}
                </span>
                <Html html={option} math={course.math} />
              </label>
            );
          })}
        </div>
      )}
      <div className="answer">
        {!mc && (
          <>
            <label className="sr" htmlFor={`qi-${id}`}>
              Your answer
            </label>
            <input
              ref={inputRef}
              type="text"
              id={`qi-${id}`}
              className={cn(course.code_lang && 'mono', styled) || undefined}
              autoComplete="off"
              spellCheck={false}
              value={value}
              placeholder={item.type === 'set' ? '1, 2, 3' : 'Answer'}
              inputMode={item.type === 'num' ? 'decimal' : undefined}
              onChange={(event) => edit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  check();
                }
              }}
            />
          </>
        )}
        <button ref={checkRef} type="button" className="pill" onClick={check}>
          Check
        </button>
        <button
          type="button"
          className="textlink"
          aria-expanded={revealed}
          onClick={() => setRevealed(true)}
        >
          Show answer
        </button>
        <AskButton
          context={() => {
            const mine = result
              ? mc
                ? stripHtml(item.opts?.[Number(result.a)] ?? '')
                : result.a
              : '(not answered yet)';
            const answer = practiceAnswerText(item);
            return {
              label: `Quick check: ${part.h}`,
              text: `Quick check in the ${course.code} week ${week.n} notes, section "${part.h}":\n${stripHtml(item.q)}\n${
                mc
                  ? `Options: ${(item.opts ?? []).map(stripHtml).join(' | ')}\n`
                  : ''
              }Correct answer: ${mc ? stripHtml(answer) : answer}\nExplanation: ${stripHtml(item.sol ?? '')}\nStudent's answer: ${mine}`,
              starter:
                result && !result.ok
                  ? 'Where did my answer go wrong? Walk me through the right approach.'
                  : 'Walk me through how to solve this, step by step.',
            };
          }}
        >
          Walk me through it
        </AskButton>
      </div>
      <div className="qc-fb" aria-live="polite">
        {message ? (
          <div className="qc-v">{message}</div>
        ) : (
          result && (
            <>
              <div className={cn('qc-v', result.ok ? 'ok' : 'bad')}>
                {result.ok ? 'Correct.' : 'Not quite. Try again.'}
              </div>
              {(why || (result.ok ? item.sol : item.hint)) && (
                <Html
                  html={
                    why ||
                    (result.ok ? (item.sol ?? '') : `<b>Hint:</b> ${item.hint}`)
                  }
                  math={course.math}
                />
              )}
            </>
          )
        )}
      </div>
      {revealed && (
        <Html
          className="reveal sol"
          html={`<b>Answer: ${mc ? practiceAnswerText(item) : esc(practiceAnswerText(item))}.</b> ${item.sol ?? ''}`}
          math={course.math}
        />
      )}
    </div>
  );
}
