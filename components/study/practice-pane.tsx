'use client';

import { useState } from 'react';
import {
  checkPractice,
  practiceAnswerText,
  stripHtml,
} from '@/lib/study/model';
import type { StudyPrefs } from '@/lib/study/prefs-schema';
import { practiceItem, rateIfNew } from '@/lib/study/srs';
import type { StudyCourse, StudyPractice, StudyWeek } from '@/lib/study/types';
import { cn } from '@/lib/utils';
import { AskButton } from './ask';
import { Lookup, Tally } from './bits';
import { esc, LETTERS } from './format';
import { Html } from './html';
import { ProblemMark } from './marks';
import type { PaneProps } from './pane';

/** Practice tab (artifact renderPractice): instant checking, crossed-out misses, hints and solutions. First answers are scheduled for review. */
export function PracticePane({
  course,
  week,
  state,
  update,
  onTab,
  prefs,
}: PaneProps & { prefs: StudyPrefs }) {
  const correct = week.practice.filter(
    (_, i) => state.ww[`${week.n}-${i}`]?.ok,
  ).length;
  return (
    <>
      <div className="sethead">
        <p>
          Answers are checked instantly. Wrong answers are crossed out so you
          can try again.
        </p>
        <Tally got={correct} of={week.practice.length} noun="correct" />
      </div>
      {week.practice.map((item, i) => {
        const key = `${week.n}-${i}`;
        return (
          <PracticeItem
            key={key}
            id={key}
            index={i}
            item={item}
            course={course}
            week={week}
            result={state.ww[key]}
            onCheck={(a, ok) =>
              update((draft) => {
                // First check: schedule it (rateIfNew also records ww when absent).
                if (!draft.ww[key])
                  rateIfNew(
                    draft,
                    practiceItem(course, week, i),
                    ok ? 3 : 1,
                    Date.now(),
                    prefs,
                    { answer: a, ok },
                  );
                draft.ww[key] = { a, ok };
              })
            }
          />
        );
      })}
      {week.studio.length > 0 && (
        <div className="done-row">
          <button
            type="button"
            className="textlink"
            onClick={() => onTab('studio')}
          >
            Next: {course.labels.studio}
          </button>
        </div>
      )}
    </>
  );
}

type Reveal = 'hint' | 'sol' | null;

function PracticeItem({
  id,
  index,
  item,
  course,
  week,
  result,
  onCheck,
}: {
  id: string;
  index: number;
  item: StudyPractice;
  course: StudyCourse;
  week: StudyWeek;
  result: { a: string; ok: boolean } | undefined;
  onCheck: (answer: string, ok: boolean) => void;
}) {
  const [value, setValue] = useState(result?.a ?? '');
  // Typing or picking again clears the right/wrong styling until the next check.
  const [edited, setEdited] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // A reset from elsewhere (the rail's "Reset this course") clears the answer here too.
  const [seen, setSeen] = useState(result);
  if (result !== seen) {
    setSeen(result);
    if ((result?.a ?? '') !== value) {
      setValue(result?.a ?? '');
      setEdited(false);
    }
  }
  const [reveal, setReveal] = useState<Reveal>(null);
  const status = result ? (result.ok ? 'ok' : 'bad') : '';
  const styled = result && !edited ? (result.ok ? 'right' : 'wrong') : '';
  const mc = item.type === 'mc';

  const check = () => {
    if (mc ? value === '' : !value.trim()) {
      setMessage(mc ? 'Pick an option first.' : 'Type an answer first.');
      return;
    }
    const ok = checkPractice(item, value);
    onCheck(value, ok);
    setEdited(false);
    setMessage(null);
    setReveal(!ok && item.hint ? 'hint' : null);
  };

  const edit = (next: string) => {
    setValue(next);
    setEdited(true);
    setMessage(null);
  };

  return (
    <div className={cn('prob', status)} id={`p${id}`}>
      <div className="pn">{index + 1}</div>
      {result && <ProblemMark ok={result.ok} />}
      {item.src && <div className="src">{item.src}</div>}
      <Html className="q" html={item.q} math={course.math} />
      {mc ? (
        <>
          <div
            className="opts"
            role="radiogroup"
            aria-label={`Options for problem ${index + 1}`}
          >
            {(item.opts ?? []).map((option, oi) => {
              const picked = value === String(oi);
              return (
                <label
                  key={oi}
                  className={picked && styled ? styled : undefined}
                >
                  <input
                    type="radio"
                    name={`p${id}`}
                    value={oi}
                    checked={picked}
                    onChange={() => edit(String(oi))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        check();
                      }
                    }}
                  />
                  <span className="let" aria-hidden="true">
                    {LETTERS[oi]}
                  </span>
                  <Html html={option} math={course.math} />
                </label>
              );
            })}
          </div>
          <div className="answer">
            <button type="button" className="pill pill-primary" onClick={check}>
              Check
            </button>
          </div>
        </>
      ) : (
        <div className="answer">
          <label className="sr" htmlFor={`in-${id}`}>
            Your answer to problem {index + 1}
          </label>
          <input
            type="text"
            id={`in-${id}`}
            className={styled || undefined}
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
          <button type="button" className="pill pill-primary" onClick={check}>
            Check
          </button>
        </div>
      )}
      <div className={cn('fb', !message && status)} aria-live="polite">
        {message ??
          (result ? (result.ok ? 'Correct' : 'Not quite. Try again.') : '')}
      </div>
      <div className="tools">
        {item.hint && (
          <button
            type="button"
            className="textlink"
            aria-expanded={reveal === 'hint'}
            onClick={() => setReveal('hint')}
          >
            Hint
          </button>
        )}
        <button
          type="button"
          className="textlink"
          aria-expanded={reveal === 'sol'}
          onClick={() => setReveal('sol')}
        >
          Show solution
        </button>
        <AskButton
          context={() => {
            const mine = result
              ? mc
                ? (item.opts?.[Number(result.a)] ?? '')
                : result.a
              : '(not answered yet)';
            return {
              label: `${course.labels.practice} ${index + 1}, week ${week.n}`,
              text: `Practice problem (${course.code} week ${week.n}):\n${stripHtml(item.q)}\n${
                mc
                  ? `Options: ${(item.opts ?? []).map(stripHtml).join(' | ')}\n`
                  : ''
              }Correct answer: ${stripHtml(practiceAnswerText(item))}\nReference solution: ${stripHtml(item.sol ?? '')}\nStudent's answer: ${stripHtml(mine)}`,
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
      <div className="extra">
        {reveal === 'hint' && item.hint && (
          <Html
            className="reveal hint"
            html={`<b>Hint:</b> ${item.hint}`}
            math={course.math}
          />
        )}
        {reveal === 'sol' && (
          <>
            <Html
              className="reveal sol"
              html={`<b>Answer: ${mc ? practiceAnswerText(item) : esc(practiceAnswerText(item))}.</b> ${item.sol ?? ''}`}
              math={course.math}
            />
            <Lookup course={course} week={week} />
          </>
        )}
      </div>
    </div>
  );
}
