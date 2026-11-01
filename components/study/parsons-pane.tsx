'use client';

import type { StudyPrefs } from '@/lib/study/prefs-schema';
import { parsonsItem, rateIfNew } from '@/lib/study/srs';
import { cn } from '@/lib/utils';
import { Tally } from './bits';
import { Html } from './html';
import { ProblemMark } from './marks';
import type { PaneProps } from './pane';
import { ParsonsBoard } from './parsons-board';

/**
 * Arrange tab: the week's Parsons problems (put code lines in order, leaving
 * distractors out). Every attempt counts in `pz`; the first one is also
 * scheduled for review.
 */
export function ParsonsPane({
  course,
  week,
  state,
  update,
  prefs,
}: PaneProps & { prefs: StudyPrefs }) {
  const problems = week.parsons ?? [];
  const solved = problems.filter(
    (_, i) => state.pz[`${week.n}-${i}`]?.ok,
  ).length;
  return (
    <>
      <div className="sethead">
        <p>
          Put the lines in order to build working code. Some problems include
          lines that don&apos;t belong: leave those out.
        </p>
        <Tally got={solved} of={problems.length} noun="solved" />
      </div>
      {problems.map((problem, i) => {
        const key = `${week.n}-${i}`;
        const record = state.pz[key];
        return (
          <section
            key={key}
            id={`z${key}`}
            className={cn('prob pz', record && (record.ok ? 'ok' : 'bad'))}
            aria-labelledby={`z${key}-t`}
          >
            <div className="pn" aria-hidden="true">
              {i + 1}
            </div>
            {record && <ProblemMark ok={record.ok} />}
            <h3 className="stitle" id={`z${key}-t`}>
              <span className="sr">Problem {i + 1}: </span>
              {problem.title || 'Arrange the lines'}
              {record && (
                <span className="pz-state">
                  {record.ok
                    ? 'Solved'
                    : `${record.n} ${record.n === 1 ? 'try' : 'tries'}, not solved yet`}
                </span>
              )}
            </h3>
            <Html className="q" html={problem.q} math={course.math} />
            <ParsonsBoard
              problem={problem}
              seed={`${course.id}:${key}`}
              math={course.math}
              onResult={(r) =>
                update((draft) => {
                  // rate() records the attempt in pz itself; otherwise count it here.
                  const rated = rateIfNew(
                    draft,
                    parsonsItem(course, week, i),
                    r.ok ? 3 : 1,
                    Date.now(),
                    prefs,
                    { ok: r.ok },
                  );
                  if (!rated) {
                    const prev = draft.pz[key];
                    draft.pz[key] = {
                      ok: Boolean(prev?.ok) || r.ok,
                      n: (prev?.n ?? 0) + 1,
                    };
                  }
                })
              }
            />
          </section>
        );
      })}
    </>
  );
}
