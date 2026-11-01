'use client';

import { Fragment, useId, useState } from 'react';
import { GradeMyWork } from '@/components/study/ai/grade-my-work';
import { useTutor } from '@/components/study/ai/tutor';
import {
  examEstimated,
  fmtExamDate,
  fmtPts,
  normExamAnswer,
  stripHtml,
} from '@/lib/study/model';
import type {
  StudyCourse,
  StudyCourseState,
  StudyExam,
  StudyExamBlank,
  StudyExamItem,
  StudyExamState,
  StudyWeek,
} from '@/lib/study/types';
import { cn } from '@/lib/utils';
import { AskButton } from './ask';
import { ReadAlong } from './bits';
import { useExamTimer } from './exam-timer';
import { LETTERS } from './format';
import { Html } from './html';
import { CheckMark, CrossMark, ProblemMark } from './marks';

type Update = (mutate: (draft: StudyCourseState) => void) => void;
type Answer = StudyExamState['ans'][string] | undefined;

const blankExam = (): StudyExamState => ({
  ans: {},
  pts: {},
  rev: {},
  sub: false,
  done: false,
});

const autoKind = (kind: StudyExamItem['kind']) =>
  kind === 'mc' || kind === 'tf' || kind === 'blanks';

const blankOk = (blank: StudyExamBlank, value: string | undefined) =>
  value != null &&
  value !== '' &&
  blank.answers.some(
    (answer) => normExamAnswer(answer) === normExamAnswer(value),
  );

function itemScore(item: StudyExamItem, answer: Answer) {
  if (item.kind === 'mc' || item.kind === 'tf')
    return answer === item.answer ? item.pts : 0;
  if (item.kind === 'blanks') {
    const values = Array.isArray(answer) ? answer : [];
    return (item.blanks ?? []).reduce(
      (sum, blank, bi) => sum + (blankOk(blank, values[bi]) ? blank.pts : 0),
      0,
    );
  }
  return 0;
}

const clockText = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Practice exam tab (artifact renderExam): timer, auto-graded and written items, score, retake. */
export function ExamPane({
  course,
  exam,
  week,
  state,
  update,
}: {
  course: StudyCourse;
  exam: StudyExam;
  week: StudyWeek;
  state: StudyCourseState;
  update: Update;
}) {
  const tutor = useTutor();
  const st = state.ex[exam.id] ?? blankExam();
  const timer = useExamTimer(`${course.id}:${exam.id}`, exam.minutes);
  const [settingDate, setSettingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState(exam.date.slice(0, 10));
  const dateId = useId();

  const items = exam.sections.flatMap((section, si) =>
    section.items.map((item, ii) => ({ item, key: `${si}-${ii}`, si })),
  );
  const total = items.reduce((sum, { item }) => sum + item.pts, 0);
  const graded = (key: string) => st.sub || Boolean(st.rev[key]);
  const earned = items.reduce(
    (sum, { item, key }) =>
      sum +
      (autoKind(item.kind)
        ? graded(key)
          ? itemScore(item, st.ans[key])
          : 0
        : Number(st.pts[key]) || 0),
    0,
  );

  const updateExam = (
    mutate: (exam: StudyExamState, draft: StudyCourseState) => void,
  ) =>
    update((draft) => {
      const current = { ...blankExam(), ...draft.ex[exam.id] };
      current.ans ??= {};
      current.pts ??= {};
      current.rev ??= {};
      draft.ex[exam.id] = current;
      mutate(current, draft);
    });

  let running = 0;
  let lastSection = -1;

  return (
    <>
      <div className="exam-meta">
        <span>
          <b>Covers:</b> {exam.covers}
        </span>
        <span>
          <b>Time:</b> {exam.minutes} min
        </span>
        <span>
          <b>Points:</b> {fmtPts(total)}
        </span>
        <span>
          <b>Real exam:</b> {fmtExamDate(state, exam)}
          {examEstimated(state, exam) && !settingDate && (
            <>
              {' '}
              <button
                type="button"
                className="textlink"
                onClick={() => setSettingDate(true)}
              >
                Set the real date
              </button>
            </>
          )}
        </span>
      </div>
      {settingDate && (
        <form
          className="inline-field"
          onSubmit={(event) => {
            event.preventDefault();
            if (!dateDraft) return;
            update((draft) => {
              draft.dates[exam.id] = dateDraft;
            });
            setSettingDate(false);
          }}
        >
          <label htmlFor={dateId}>Real exam date</label>
          <input
            id={dateId}
            type="date"
            value={dateDraft}
            onChange={(event) => setDateDraft(event.target.value)}
          />
          <button type="submit" className="pill pill-primary pill-sm">
            Save
          </button>
          <button
            type="button"
            className="textlink"
            onClick={() => setSettingDate(false)}
          >
            Cancel
          </button>
        </form>
      )}
      {exam.note && (
        <div className="note">
          {exam.note} Closed book, no calculator. Answer everything, then submit
          to grade the auto-checked parts. Grade written parts yourself
          {tutor.enabled ? ' or with Grade my work' : ''}.
        </div>
      )}
      {exam.links.length ? (
        <div className="readalong">
          <b>Real review material:</b>
          {exam.links.map(([label, url], i) => (
            <a
              key={`${i}-${url}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {label}
            </a>
          ))}
        </div>
      ) : (
        <ReadAlong course={course} week={week} />
      )}

      <div className="timer">
        <span
          className={cn('clock', timer.left <= 300 && 'low')}
          role="timer"
          aria-label="Time left"
        >
          {clockText(timer.left)}
        </span>
        <button
          type="button"
          className="pill pill-primary"
          disabled={timer.left === 0}
          onClick={timer.run ? timer.pause : timer.start}
        >
          {timer.run
            ? 'Pause'
            : timer.left === timer.total
              ? 'Start timer'
              : timer.left === 0
                ? 'Time is up'
                : 'Resume'}
        </button>
        <button type="button" className="pill" onClick={timer.reset}>
          Reset
        </button>
        <span className="sp" />
        <span className="tot">
          Score{' '}
          <b className={cn(Math.abs(earned - total) < 1e-6 && 'full')}>
            {fmtPts(earned)}
          </b>{' '}
          / {fmtPts(total)}
        </span>
        <button
          type="button"
          className="pill"
          disabled={st.sub}
          onClick={() => {
            timer.pause();
            updateExam((current) => {
              current.sub = true;
            });
          }}
        >
          {st.sub ? 'Submitted' : 'Submit and grade'}
        </button>
      </div>
      <div aria-live="polite">
        {timer.left === 0 && (
          <div className="timesup">Time is up. Pencils down, then submit.</div>
        )}
      </div>

      {items.map(({ item, key, si }) => {
        running += 1;
        let head = null;
        if (si !== lastSection) {
          lastSection = si;
          const section = exam.sections[si];
          if (section.title)
            head = (
              <h3 className="xsec" key={`section-${si}`}>
                {section.title}
                <span>
                  {fmtPts(
                    section.items.reduce((sum, entry) => sum + entry.pts, 0),
                  )}{' '}
                  pts
                </span>
              </h3>
            );
        }
        return (
          <Fragment key={key}>
            {head}
            <ExamItem
              course={course}
              exam={exam}
              item={item}
              itemKey={key}
              number={running}
              st={st}
              graded={graded(key)}
              grade={state.gr[`${exam.id}:${key}`]}
              updateExam={updateExam}
            />
          </Fragment>
        );
      })}

      <div className="done-row">
        <button
          type="button"
          className={st.done ? 'pill pill-on' : 'pill pill-primary'}
          aria-pressed={st.done}
          onClick={() =>
            updateExam((current) => {
              current.done = !current.done;
            })
          }
        >
          {st.done ? 'Completed ✓' : 'Mark practice exam complete'}
        </button>
        <button
          type="button"
          className="textlink"
          onClick={() => {
            if (
              !window.confirm(
                'Clear your answers, points, and grades for this practice exam?',
              )
            )
              return;
            update((draft) => {
              draft.ex[exam.id] = blankExam();
              for (const { key } of items) delete draft.gr[`${exam.id}:${key}`];
            });
          }}
        >
          Clear my answers and retake
        </button>
      </div>
    </>
  );
}

function ExamItem({
  course,
  exam,
  item,
  itemKey,
  number,
  st,
  graded,
  grade,
  updateExam,
}: {
  course: StudyCourse;
  exam: StudyExam;
  item: StudyExamItem;
  itemKey: string;
  number: number;
  st: StudyExamState;
  graded: boolean;
  grade: StudyCourseState['gr'][string] | undefined;
  updateExam: (
    mutate: (exam: StudyExamState, draft: StudyCourseState) => void,
  ) => void;
}) {
  const answer = st.ans[itemKey];
  const fieldId = useId();
  let status: 'ok' | 'bad' | null = null;
  if (autoKind(item.kind) && graded)
    status = itemScore(item, answer) >= item.pts - 1e-6 ? 'ok' : 'bad';
  if (!autoKind(item.kind) && st.pts[itemKey] !== undefined)
    status = st.pts[itemKey] >= item.pts ? 'ok' : 'bad';

  const ask = (
    <AskButton
      context={() => ({
        label: `${exam.title} problem`,
        text: `${course.code} ${exam.title} problem (${fmtPts(item.pts)} pts):\n${stripHtml(item.q)}\n${
          item.choices
            ? `Choices: ${item.choices.map(stripHtml).join(' | ')}\n`
            : ''
        }Reference solution: ${stripHtml(item.sol ?? '')}`,
        starter:
          'Explain how to approach this problem and what a full-credit answer needs.',
      })}
    >
      Ask the tutor
    </AskButton>
  );

  const checkTools = (
    <div className="tools">
      <button
        type="button"
        className="textlink"
        onClick={() =>
          updateExam((current) => {
            current.rev[itemKey] = true;
          })
        }
      >
        Check this one
      </button>
      {ask}
    </div>
  );

  let body: React.ReactNode;
  if (item.kind === 'mc' || item.kind === 'tf') {
    const options: Array<[string, string]> =
      item.kind === 'tf'
        ? [
            ['true', 'True'],
            ['false', 'False'],
          ]
        : (item.choices ?? []).map((choice, i) => [String(i), choice]);
    const right = String(item.answer);
    const pick = answer === undefined ? null : String(answer);
    body = (
      <>
        <div
          className="opts"
          role="radiogroup"
          aria-label={`Answer for problem ${number}`}
        >
          {options.map(([value, label], i) => (
            <label
              key={value}
              className={
                graded
                  ? value === right
                    ? 'right'
                    : value === pick
                      ? 'wrong'
                      : undefined
                  : undefined
              }
            >
              <input
                type="radio"
                name={`x${course.id}${exam.id}${itemKey}`}
                value={value}
                checked={pick === value}
                disabled={graded}
                onChange={() =>
                  updateExam((current) => {
                    current.ans[itemKey] =
                      item.kind === 'tf' ? value === 'true' : Number(value);
                  })
                }
              />
              <span className="let" aria-hidden="true">
                {item.kind === 'tf' ? label[0] : LETTERS[i]}
              </span>
              {item.kind === 'tf' ? (
                <div>{label}</div>
              ) : (
                <Html html={label} math={course.math} />
              )}
            </label>
          ))}
        </div>
        {graded
          ? item.sol && (
              <Html className="reveal sol" html={item.sol} math={course.math} />
            )
          : checkTools}
      </>
    );
  } else if (item.kind === 'blanks') {
    const values = Array.isArray(answer) ? answer : [];
    body = (
      <>
        {item.bank && (
          <div className="bank">
            {item.bank.map((entry) => (
              <div key={entry.k}>
                <b>{entry.k}</b>{' '}
                <Html as="span" html={entry.v} math={course.math} />
              </div>
            ))}
          </div>
        )}
        <div className="blanks">
          {(item.blanks ?? []).map((blank, bi) => {
            const ok = blankOk(blank, values[bi]);
            const id = `${fieldId}-${bi}`;
            const set = (value: string) =>
              updateExam((current) => {
                const next = Array.isArray(current.ans[itemKey])
                  ? [...(current.ans[itemKey] as string[])]
                  : [];
                while (next.length < bi) next.push('');
                next[bi] = value;
                current.ans[itemKey] = next;
              });
            return (
              <div
                key={bi}
                className={cn('bl', graded && (ok ? 'right' : 'wrong'))}
              >
                <label htmlFor={id}>{blank.label}</label>
                {item.bank ? (
                  <select
                    id={id}
                    value={values[bi] ?? ''}
                    disabled={graded}
                    onChange={(event) => set(event.target.value)}
                  >
                    <option value="">—</option>
                    {item.bank.map((entry) => (
                      <option key={entry.k} value={entry.k}>
                        {entry.k}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    type="text"
                    spellCheck={false}
                    autoComplete="off"
                    value={values[bi] ?? ''}
                    disabled={graded}
                    onChange={(event) => set(event.target.value)}
                  />
                )}
                {graded && (
                  <span className="blk">
                    {ok ? (
                      <CheckMark />
                    ) : (
                      <>
                        <CrossMark /> <code>{blank.answers[0]}</code>
                      </>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {graded
          ? item.sol && (
              <Html className="reveal sol" html={item.sol} math={course.math} />
            )
          : checkTools}
      </>
    );
  } else {
    const gradeKey = `${exam.id}:${itemKey}`;
    body = (
      <>
        <div className="tools">
          <button
            type="button"
            className="textlink"
            aria-expanded={graded}
            onClick={() =>
              updateExam((current) => {
                current.rev[itemKey] = !current.rev[itemKey];
              })
            }
          >
            {graded ? 'Hide solution' : 'Show solution'}
          </button>
          {ask}
        </div>
        <GradeMyWork
          course={course}
          gradeKey={gradeKey}
          label={`${exam.title}, problem`}
          problem={stripHtml(item.q)}
          reference={`${
            item.rubric
              ? `Rubric: ${item.rubric.map((row) => `${stripHtml(row.item)} (${row.pts} pts)`).join('; ')}\n`
              : ''
          }Solution: ${stripHtml(item.sol ?? '')}`}
          points={item.pts}
          saved={grade}
          onGraded={(result) =>
            updateExam((current, draft) => {
              draft.gr[gradeKey] = result;
              if (result.readable) current.pts[itemKey] = result.score;
            })
          }
        />
        {graded && (
          <>
            {item.rubric && (
              <div className="rubric">
                <b>Rubric</b>
                <ul>
                  {item.rubric.map((row, ri) => (
                    <li key={ri}>
                      <span>{fmtPts(row.pts)}</span>
                      <Html html={row.item} math={course.math} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Html
              className="reveal sol"
              html={`<b>Solution.</b> ${item.sol ?? ''}`}
              math={course.math}
            />
            <EarnedPoints
              id={fieldId}
              max={item.pts}
              stored={st.pts[itemKey]}
              onChange={(value) =>
                updateExam((current) => {
                  if (value === null) delete current.pts[itemKey];
                  else current.pts[itemKey] = value;
                })
              }
            />
          </>
        )}
      </>
    );
  }

  return (
    <div className={cn('prob xitem', status)}>
      <div className="pn">{number}</div>
      {status && <ProblemMark ok={status === 'ok'} />}
      <div className="pts">{fmtPts(item.pts)} points</div>
      <Html className="q" html={item.q} math={course.math} />
      {body}
    </div>
  );
}

/** "Points you earned [ ] / 6": clamped to 0..max, and refreshed when a grade fills it in. */
function EarnedPoints({
  id,
  max,
  stored,
  onChange,
}: {
  id: string;
  max: number;
  stored: number | undefined;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(
    stored === undefined ? '' : String(stored),
  );
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    const parsed = draft === '' ? undefined : Number(draft);
    if (parsed !== stored) setDraft(stored === undefined ? '' : String(stored));
  }
  return (
    <div className="mine">
      <label htmlFor={`${id}-pts`}>Points you earned</label>
      <input
        id={`${id}-pts`}
        type="number"
        min={0}
        max={max}
        step={0.5}
        inputMode="decimal"
        value={draft}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') {
            setDraft('');
            onChange(null);
            return;
          }
          const value = Math.max(0, Math.min(max, Number(raw) || 0));
          setDraft(value === Number(raw) ? raw : String(value));
          onChange(value);
        }}
      />{' '}
      / {fmtPts(max)}
    </div>
  );
}
