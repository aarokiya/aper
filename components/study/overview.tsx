'use client';

import Link from 'next/link';
import {
  dayDiff,
  examsOf,
  fmtExamDate,
  tabsFor,
  topicStatus,
  weekProg,
  type ExamShape,
} from '@/lib/study/model';
import { useStudyProgress } from '@/lib/study/progress-client';
import type { StudyCourse, StudyCourseState } from '@/lib/study/types';
import { cn } from '@/lib/utils';
import { plural, weekHref, weekName } from './format';
import { WithProgress } from './with-progress';

export type UpcomingCourse = {
  id: string;
  code: string;
  initial: StudyCourseState;
  exams: ExamShape[];
  /** exam id → week number holding it */
  examWeeks: Record<string, number>;
};

/** Today's Daily review per course (server counts) and a Start link. */
export function DailyReviewSummary({
  courses,
}: {
  courses: Array<{
    id: string;
    code: string;
    name: string;
    due: number;
    newAvail: number;
    review: boolean;
  }>;
}) {
  const total = courses.reduce(
    (sum, course) => (course.review ? sum + course.due + course.newAvail : sum),
    0,
  );
  return (
    <>
      <ul className="uplist">
        {courses.map((course) => (
          <li key={course.id}>
            <Link href={`/study/${course.id}/cards`}>
              <span className="ud">{course.due}</span>
              <span className="uc">{course.code}</span>
              <span className="ut">{course.name}</span>
              <span className="uw">
                {course.review
                  ? `${course.due} due, ${course.newAvail} new`
                  : 'Not in Daily review'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="go-row" style={{ marginTop: '0.875rem' }}>
        <Link
          href="/study/daily"
          className={cn('pill', total > 0 && 'pill-primary')}
        >
          {total > 0 ? `Start Daily review (${total})` : 'Open Daily review'}
        </Link>
        <Link href="/settings#study" className="pill">
          Study settings
        </Link>
      </div>
    </>
  );
}

/** Every exam from today on, across courses, soonest first (artifact "Coming up"). */
export function ComingUp({
  courses,
  today,
}: {
  courses: UpcomingCourse[];
  today: string;
}) {
  return (
    <WithProgress seeds={courses}>
      {(states) => {
        const upcoming = courses
          .flatMap((course, index) =>
            examsOf(course.exams, states[index]).map((item) => ({
              ...item,
              course,
              state: states[index],
            })),
          )
          .filter((item) => dayDiff(item.date, today) >= 0)
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .slice(0, 6);
        if (!upcoming.length)
          return <p className="emptystate">No exams ahead this term.</p>;
        return (
          <ul className="uplist">
            {upcoming.map(({ exam, date, course, state }) => {
              const days = dayDiff(date, today);
              const week = course.examWeeks[exam.id];
              return (
                <li key={`${course.id}-${exam.id}`}>
                  <Link
                    href={
                      week
                        ? weekHref(course.id, week, `x-${exam.id}`)
                        : `/study/${course.id}`
                    }
                  >
                    <span className="ud">
                      {days === 0 ? 'Today' : plural(days, 'day')}
                    </span>
                    <span className="uc">{course.code}</span>
                    <span className="ut">{exam.title}</span>
                    <span className="uw">{fmtExamDate(state, exam)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        );
      }}
    </WithProgress>
  );
}

/** One course's current week: title, progress, and a pill per tab. */
export function ThisWeekRow({
  course,
  initial,
  today,
}: {
  course: StudyCourse;
  initial: StudyCourseState;
  today: string;
}) {
  const { state } = useStudyProgress(course.id, initial);
  const week = course.weeks[0];
  const { pct } = weekProg(state, week);
  return (
    <li>
      <div className="wk-h">
        <span className="uc">{course.code}</span>
        <span className="wk-t">
          {weekName(week)}: {week.title}
        </span>
        <span className="wk-p">
          {topicStatus(course.labels, state, week, today).complete ? (
            <span className="st-done">Complete ✓</span>
          ) : (
            `${pct}%`
          )}
        </span>
      </div>
      <TabPills course={course} state={state} />
    </li>
  );
}

/** Pills that open each tab of the course's (first) week; Lecture is primary. */
export function TabPills({
  course,
  state,
}: {
  course: StudyCourse;
  state: StudyCourseState;
}) {
  const week = course.weeks[0];
  return (
    <div className="go-row">
      {tabsFor(course, state, week).map((tab) => (
        <Link
          key={tab.id}
          href={weekHref(course.id, week.n, tab.id)}
          className={cn('pill', tab.id === 'lecture' && 'pill-primary')}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
