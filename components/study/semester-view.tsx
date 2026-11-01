'use client';

import Link from 'next/link';
import { fmtDay, weekProg } from '@/lib/study/model';
import type { StudyWeekOutline } from '@/lib/study/nav';
import { useStudyProgress } from '@/lib/study/progress-client';
import type { StudyCourseState, StudyWeek } from '@/lib/study/types';
import { cn } from '@/lib/utils';
import { weekHref } from './format';

export type SemesterRow = StudyWeekOutline & { events: StudyWeek['events'] };

/** Semester at a glance (artifact renderSemester): every week, its schedule, and live progress. */
export function SemesterView({
  courseId,
  code,
  rows,
  current,
  initial,
}: {
  courseId: string;
  code: string;
  rows: SemesterRow[];
  current: number;
  initial: StudyCourseState;
}) {
  const { state } = useStudyProgress(courseId, initial);
  return (
    <div className="wrap">
      <div className="vhead">
        <h2>Semester at a glance</h2>
        <p>
          {code}: every week, what&apos;s scheduled, and how far along you are.
        </p>
      </div>
      <div className="sheet">
        <div className="tbl-wrap">
          <table className="sem">
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Topics</th>
                <th scope="col">Schedule</th>
                <th scope="col">Progress</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((week) => {
                const { pct } = weekProg(state, week);
                return (
                  <tr
                    key={week.n}
                    className={cn(
                      week.exams.length > 0 && 'xrow',
                      week.n === current && 'currow',
                    )}
                    aria-current={week.n === current ? 'date' : undefined}
                  >
                    <td>
                      {week.label}
                      {week.exams.length > 0 && (
                        <span className="sr">, exam week</span>
                      )}
                    </td>
                    <td>
                      <Link href={weekHref(courseId, week.n)}>
                        {week.title}
                      </Link>
                      <br />
                      <small>
                        {fmtDay(week.start)} to {fmtDay(week.end)}. {week.secs}
                      </small>
                    </td>
                    <td className="text-[0.8125rem]">
                      {week.events.map(([date, text], i) => (
                        <span key={`${i}-${date}`} className="block">
                          {date}: {text}
                        </span>
                      ))}
                    </td>
                    <td className="text-[0.8125rem] whitespace-nowrap">
                      <span className="pb" aria-hidden="true">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
