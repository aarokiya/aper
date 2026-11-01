'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { fmtDay, topicStatus, type StudyLabels } from '@/lib/study/model';
import { useStudyProgress } from '@/lib/study/progress-client';
import type { StudyCourseState } from '@/lib/study/types';
import { weekHref } from './format';

export type SpineWeek = {
  n: number;
  label: string;
  title: string;
  start: string;
  end: string;
  exam: boolean;
  lectures: number;
  practice: number;
  studio: number;
  cards: number;
  checks: number;
};

/**
 * The sticky semester timeline above every course view (artifact
 * renderSpine): one bar per week, past weeks faint, the current week heavy,
 * complete weeks green, behind weeks red, a dot under the open week, and a
 * diamond over exam weeks.
 */
export function Spine({
  courseId,
  code,
  labels,
  weeks,
  current,
  initial,
  today,
}: {
  courseId: string;
  code: string;
  labels: StudyLabels;
  weeks: SpineWeek[];
  /** curWeek(weeks, today), computed on the server */
  current: number;
  initial: StudyCourseState;
  /** local YYYY-MM-DD */
  today: string;
}) {
  const { state } = useStudyProgress(courseId, initial);
  const pathname = usePathname();
  const open = pathname.match(/\/week\/(\d+)/);
  const selected =
    open && pathname.startsWith(`/study/${courseId}/`) ? Number(open[1]) : null;
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return (
    <nav className="spine" aria-label="Semester timeline">
      <ol style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week) => {
          const status = topicStatus(labels, state, week, today);
          return (
            <li key={week.n}>
              <Link
                href={weekHref(courseId, week.n)}
                className={cn(
                  week.n < current && 'past',
                  week.n === current && 'cur',
                  week.n === selected && 'sel',
                  status.complete ? 'done' : status.behind && 'behind',
                )}
                title={`${week.label === String(week.n) ? `Week ${week.n}` : week.label}: ${week.title}`}
                aria-label={`Week ${week.label}${week.exam ? ', exam week' : ''}${week.n === current ? ', this week' : ''}`}
                aria-current={week.n === selected ? 'page' : undefined}
              >
                {week.exam && <span className="ex" />}
              </Link>
            </li>
          );
        })}
      </ol>
      {first && last && (
        <div className="legend">
          <span>{fmtDay(first.start)}</span>
          <span>
            {code}. Diamonds are exams. Green: complete. Red: behind.
          </span>
          <span>{fmtDay(last.end)}</span>
        </div>
      )}
    </nav>
  );
}
