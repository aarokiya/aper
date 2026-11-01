'use client';

import { useState } from 'react';
import { GradeMyWork } from '@/components/study/ai/grade-my-work';
import { useTutor } from '@/components/study/ai/tutor';
import { stripHtml } from '@/lib/study/model';
import type {
  StudioRating,
  StudyCourse,
  StudyCourseState,
  StudyGrade,
  StudyStudio,
  StudyWeek,
} from '@/lib/study/types';
import { cn } from '@/lib/utils';
import { AskButton } from './ask';
import { Lookup } from './bits';
import { Html } from './html';
import { ProblemMark, Tick } from './marks';
import type { PaneProps } from './pane';

/** A readable AI grade sets the self-rating (artifact RATE). */
const RATING_FOR_VERDICT: Record<StudyGrade['verdict'], StudioRating> = {
  correct: 'got',
  partial: 'shaky',
  incorrect: 'missed',
};

const RATINGS: Array<{ value: StudioRating; label: string }> = [
  { value: 'got', label: 'Got it' },
  { value: 'shaky', label: 'Shaky' },
  { value: 'missed', label: 'Missed' },
];

/** Studio tab (artifact renderStudio): paper problems, step-by-step solutions, grading, self-rating. */
export function StudioPane({ course, week, state, update, onTab }: PaneProps) {
  const tutor = useTutor();
  const firstExam = week.exams.map((id) => course.exams[id]).find(Boolean);
  return (
    <>
      <p className="paper-note">
        Work each problem on paper first. Then reveal the solution
        {tutor.enabled ? ', or have your work graded' : ''}. Anything rated
        Shaky or Missed goes to your Review queue.
      </p>
      {week.studio.map((item, i) => (
        <StudioItem
          key={`${week.n}-${i}`}
          index={i}
          item={item}
          course={course}
          week={week}
          state={state}
          update={update}
        />
      ))}
      {firstExam && (
        <div className="done-row">
          <button
            type="button"
            className="textlink"
            onClick={() => onTab(`x-${firstExam.id}`)}
          >
            Next: {firstExam.title}
          </button>
        </div>
      )}
    </>
  );
}

function StudioItem({
  index,
  item,
  course,
  week,
  state,
  update,
}: {
  index: number;
  item: StudyStudio;
  course: StudyCourse;
  week: StudyWeek;
  state: StudyCourseState;
  update: PaneProps['update'];
}) {
  const key = `${week.n}-${index}`;
  const rating = state.st[key];
  const [shown, setShown] = useState(0);
  const [hint, setHint] = useState(false);
  const total = item.steps.length;
  const multi = total > 1;
  const done = shown >= total;
  const label = `${course.labels.studio} ${index + 1}, week ${week.n}`;

  const rate = (value: StudioRating | null) =>
    update((draft) => {
      if (value) draft.st[key] = value;
      else delete draft.st[key];
    });

  return (
    <div
      className={cn('prob', rating === 'got' ? 'ok' : rating && 'bad')}
      id={`s${key}`}
    >
      <div className="pn">{index + 1}</div>
      {rating && <ProblemMark ok={rating === 'got'} />}
      {item.src && <div className="src">{item.src}</div>}
      {item.title && <div className="stitle">{item.title}</div>}
      <Html className="q" html={item.q} math={course.math} />
      {hint && item.hint && (
        <div className="hintbox">
          <Html
            className="reveal hint"
            html={`<b>Hint:</b> ${item.hint}`}
            math={course.math}
          />
        </div>
      )}
      {shown > 0 && (
        <ol
          className={cn('stepsr', !multi && 'one')}
          aria-label="Solution steps"
          aria-live="polite"
        >
          {item.steps.slice(0, shown).map((step, k) => (
            <Html as="li" key={k} html={step} math={course.math} />
          ))}
        </ol>
      )}
      {done && (
        <div className="tipbox">
          {item.tip && (
            <Html className="tip" html={item.tip} math={course.math} />
          )}
          <Lookup course={course} week={week} />
        </div>
      )}
      <div className="tools">
        {item.hint && (
          <button
            type="button"
            className="textlink"
            aria-expanded={hint}
            onClick={() => setHint(true)}
          >
            Hint
          </button>
        )}
        {multi ? (
          <>
            <button
              type="button"
              className="pill"
              disabled={done}
              onClick={() => setShown((n) => Math.min(n + 1, total))}
            >
              {done
                ? 'All steps shown'
                : shown === 0
                  ? 'Reveal first step'
                  : `Reveal step ${shown + 1} of ${total}`}
            </button>
            <button
              type="button"
              className="textlink"
              disabled={done}
              onClick={() => setShown(total)}
            >
              Show full solution
            </button>
          </>
        ) : (
          <button
            type="button"
            className="pill"
            disabled={done}
            onClick={() => setShown(total)}
          >
            Show solution
          </button>
        )}
        <AskButton
          context={() => ({
            label,
            text: `${course.code} week ${week.n} problem:\n${stripHtml(item.q)}\nReference solution:\n${item.steps.map(stripHtml).join('\n')}`,
            starter:
              'Help me get started on this without giving the whole answer away.',
          })}
        >
          Ask the tutor
        </AskButton>
      </div>
      <GradeMyWork
        course={course}
        gradeKey={key}
        label={label}
        problem={stripHtml(item.q)}
        reference={item.steps
          .map((step, k) => `${multi ? `${k + 1}. ` : ''}${stripHtml(step)}`)
          .join('\n')}
        points={10}
        saved={state.gr[key]}
        onGraded={(grade) =>
          update((draft) => {
            draft.gr[key] = grade;
            if (grade.readable)
              draft.st[key] = RATING_FOR_VERDICT[grade.verdict];
          })
        }
      />
      <fieldset className="rate m-0 min-w-0 border-0 p-0">
        <legend className="sr">How did you do on problem {index + 1}?</legend>
        <span aria-hidden="true">How did you do?</span>
        {RATINGS.map((option) => {
          const selected = rating === option.value;
          return (
            <button
              key={option.value}
              type="button"
              data-v={option.value}
              aria-pressed={selected}
              onClick={() => rate(selected ? null : option.value)}
            >
              <span className="bx">{selected && <Tick />}</span>
              {option.label}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
