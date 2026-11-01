'use client';

import { fmtPct, gradeModel, isScored } from '@/lib/study/grades';
import { DOW, d8, fmtDay, fmtExamDate, fmtPts } from '@/lib/study/model';
import { useStudyProgress } from '@/lib/study/progress-client';
import type {
  StudyCourseState,
  StudyExam,
  StudyGrading,
} from '@/lib/study/types';
import { cn } from '@/lib/utils';

export type GradesExam = Pick<
  StudyExam,
  'id' | 'title' | 'covers' | 'date' | 'dateEst'
>;

/**
 * The hub's Grades view (artifact renderGrades): every graded item on the
 * syllabus as a blank for its score, the syllabus weights, drops, and the
 * `avgLowest` (replace-the-lowest) rule, with the grade so far. Scores save as typed in
 * progress (`gb`), like every other study answer.
 */
export function GradesView({
  courseId,
  code,
  grading,
  exams,
  initial,
}: {
  courseId: string;
  code: string;
  grading: StudyGrading;
  /** the course's exams by id, for items that link one */
  exams: Record<string, GradesExam>;
  initial: StudyCourseState;
}) {
  const { state, update } = useStudyProgress(courseId, initial);
  const model = gradeModel(grading, state.gb);
  const items = grading.groups.flatMap((group) => group.items);
  const display = new Map(
    items.map((item) => {
      const exam = item.exam ? exams[item.exam] : undefined;
      let when = 'See Canvas';
      if (exam) when = fmtExamDate(state, exam);
      else if (item.due)
        when = `${DOW[d8(item.due).getDay()]} ${fmtDay(item.due)}`;
      return [
        item.id,
        {
          title: exam?.title ?? item.t ?? item.id,
          covers: exam?.covers ?? item.sec ?? '',
          when,
        },
      ] as const;
    }),
  );
  /** "Exam 1, Exam 2, or Exam 3" */
  const names = (ids: readonly string[], and: string) => {
    const list = ids.map((id) => display.get(id)?.title ?? id);
    return list.length < 3
      ? list.join(and)
      : `${list.slice(0, -1).join(', ')},${and}${list[list.length - 1]}`;
  };
  const scoredCount = model.groups.reduce(
    (sum, entry) => sum + entry.rows.filter((row) => isScored(row.pct)).length,
    0,
  );

  return (
    <div className="wrap">
      <div className="vhead">
        <h2>Grades</h2>
        <p>
          {code}: every graded item on the syllabus, done and still to come,
          with its weight. Type each score when it posts, as 17/20 or 85. Blanks
          don&apos;t count yet.
        </p>
      </div>
      <div className="sheet">
        <div className="gsum">
          <div className="gbig">
            {model.total === null ? (
              '—'
            ) : (
              <>
                {fmtPct(model.total)}
                <span>{model.letter}</span>
              </>
            )}
          </div>
          <p className="gsub">
            {model.total === null
              ? 'No scores yet. '
              : `Your grade so far, from ${scoredCount} of ${items.length} items. Groups with no scores yet are left out, and the others scale up. `}
            {grading.note}
          </p>
        </div>
        {model.groups.map(({ group, rows, counted, scored, avg }) => (
          <section key={group.id}>
            <h3 className="xsec">
              {group.h}
              <span>
                {group.weight}% of your grade
                {group.drop > 0 && ', lowest dropped'}
              </span>
            </h3>
            {group.note && <p className="paper-note gnote">{group.note}</p>}
            <div className="tbl-wrap">
              <table className="gb">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Date</th>
                    <th scope="col">Score</th>
                    <th scope="col" className="gp">
                      Percent
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const info = display.get(row.item.id);
                    const title = info?.title ?? row.item.id;
                    const bad = row.pct !== null && Number.isNaN(row.pct);
                    const detail = [
                      info?.covers,
                      row.item.avgLowest &&
                        `Optional. Averaged with your lowest of ${names(row.item.avgLowest, ' or ')} if that raises it`,
                    ]
                      .filter(Boolean)
                      .join('. ');
                    return (
                      <tr key={row.item.id}>
                        <td>
                          {title}
                          {detail && <small>{detail}</small>}
                        </td>
                        <td className="gd">{info?.when}</td>
                        <td>
                          <input
                            type="text"
                            className={cn(bad && 'bad')}
                            value={state.gb[row.item.id] ?? ''}
                            onChange={(event) => {
                              const value = event.target.value;
                              update((draft) => {
                                if (value.trim()) draft.gb[row.item.id] = value;
                                else delete draft.gb[row.item.id];
                              });
                            }}
                            placeholder="—"
                            aria-label={`${title} score`}
                            aria-invalid={bad || undefined}
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </td>
                        <td
                          className={cn(
                            'gp',
                            bad ? 'bad' : row.dropped && 'dropped',
                          )}
                          title={
                            row.dropped
                              ? `Dropped: your lowest ${group.h.toLowerCase()}`
                              : undefined
                          }
                        >
                          {bad && 'Use 17/20 or 85'}
                          {isScored(row.pct) && (
                            <>
                              {fmtPct(row.pct)}
                              {row.raised && (
                                <>
                                  {' → '}
                                  <b>{fmtPct(row.eff)}</b>
                                </>
                              )}
                              {row.dropped && (
                                <span className="sr"> (dropped)</span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="gavg">
                    <td colSpan={3}>
                      Average
                      <span>
                        {scored.length} of {counted.length} scored
                      </span>
                    </td>
                    <td className="gp">{avg === null ? '—' : fmtPct(avg)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {rows.map((row) => {
              const ids = row.item.avgLowest;
              if (!ids) return null;
              const title = display.get(row.item.id)?.title ?? row.item.id;
              const share = group.weight / counted.length;
              const effect = row.effect;
              const target = effect
                ? (display.get(effect.target.item.id)?.title ??
                  effect.target.item.id)
                : '';
              let now = '';
              if (isScored(row.pct) && !effect)
                now = ` Enter your scores for ${names(ids, ' and ')} to see what it does.`;
              else if (effect?.used)
                now = ` Right now it raises ${target} from ${fmtPct(effect.before)} to ${fmtPct(effect.after)}.`;
              else if (effect)
                now = ` Right now it doesn't help: ${fmtPct(row.eff)} isn't above your lowest, ${target} at ${fmtPct(effect.before)}.`;
              return (
                <div key={row.item.id} className="note grule">
                  <b>How {title} counts.</b> It&apos;s optional. If you take it,
                  its score is averaged with your lowest of {names(ids, ' or ')}
                  , and only when that raises it; otherwise nothing changes. So
                  when it counts, it carries half of that score&apos;s{' '}
                  {fmtPts(share)}%: {fmtPts(share / 2)}% of your grade.{now}
                </div>
              );
            })}
          </section>
        ))}
        {grading.source && (
          <p className="paper-note">Sources: {grading.source}.</p>
        )}
      </div>
    </div>
  );
}
