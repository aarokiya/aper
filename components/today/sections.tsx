'use client';

import Link from 'next/link';
import { CourseColorDot } from '@/components/course-color-dot';
import type { DashboardData } from '@/lib/db/queries';
import { weekProg } from '@/lib/study/model';
import { useStudyProgress } from '@/lib/study/progress-client';
import type { TodayExam, TodayStudyCourse } from '@/lib/today/study';
import { cn } from '@/lib/utils';

/** A Today section: muted sentence-case label (artifact `h3.grp`), optional action, content. */
export function Section({
  id,
  title,
  note,
  action,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`today-${id}`}>
      <div className="mb-3.5 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h2 id={`today-${id}`} className="section-label">
            {title}
          </h2>
          {note && <p className="mt-0.5 text-[12px] text-ink-4">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Artifact overview "Coming up": countdown, course, exam, date. */
export function ExamList({ exams }: { exams: TodayExam[] }) {
  return (
    <ul className="rule-rows">
      {exams.map((exam) => (
        <li key={exam.key}>
          <Link
            href={exam.href}
            className="group grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-2.5 py-2.5 sm:grid-cols-[4.875rem_5.375rem_minmax(0,1fr)_auto] sm:gap-x-3"
          >
            <span className="numeral row-span-3 text-[18px] text-ink sm:row-span-1">
              {exam.days === 0
                ? 'Today'
                : `${exam.days} ${exam.days === 1 ? 'day' : 'days'}`}
            </span>
            <span className="text-[12.5px] text-ink-3">{exam.code}</span>
            <span className="text-[15px] text-ink underline-offset-[3px] group-hover:underline">
              {exam.title}
            </span>
            <span className="text-[12.5px] text-ink-3 sm:text-right">
              {exam.when}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StudyWeekRow({ course }: { course: TodayStudyCourse }) {
  const { state } = useStudyProgress(course.id, course.state);
  const { week } = course;
  const progress = weekProg(state, week);
  const finished = (tab: string) => {
    const every = (count: number, done: (i: number) => boolean) =>
      count > 0 && Array.from({ length: count }, (_, i) => i).every(done);
    if (tab === 'lecture') return Boolean(state.lec[week.n]);
    if (tab === 'practice')
      return every(week.practice, (i) =>
        Boolean(state.ww[`${week.n}-${i}`]?.ok),
      );
    if (tab === 'studio')
      return every(week.studio, (i) => state.st[`${week.n}-${i}`] === 'got');
    if (tab === 'cards')
      return every(
        week.cards,
        (i) => state.cards[`w${week.n}-${i}`] === 'know',
      );
    return Boolean(state.ex[tab.slice(2)]?.done);
  };
  return (
    <li className="py-3.5">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-[4.625rem] text-[12.5px] text-ink-3">
          {course.code}
        </span>
        <Link
          href={course.tabs[0].href}
          className="min-w-0 flex-1 font-serif text-[17px] leading-snug text-ink underline-offset-[3px] hover:underline"
        >
          {course.heading}
        </Link>
        <span
          className="text-[12.5px] text-ink-3 tabular-nums"
          aria-label={`${progress.pct}% of this week done`}
        >
          {progress.pct}%
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:pl-[5.375rem]">
        {course.tabs.map((tab) => {
          const done = finished(tab.id);
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                'pill',
                done ? 'pill-on' : tab.id === 'lecture' && 'pill-primary',
              )}
              aria-label={done ? `${tab.label}, done` : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </li>
  );
}

/** Artifact overview "This week": each course's current week, live progress, and its tabs. */
export function StudyWeekList({ courses }: { courses: TodayStudyCourse[] }) {
  return (
    <ul className="rule-rows">
      {courses.map((course) => (
        <StudyWeekRow key={course.id} course={course} />
      ))}
    </ul>
  );
}

export function GradedList({
  items,
  courses,
}: {
  items: DashboardData['recentlyGraded'];
  courses: DashboardData['courses'];
}) {
  if (!items.length)
    return (
      <p className="border-y border-rule py-4 text-[13px] text-ink-3">
        No grades have been released recently.
      </p>
    );
  return (
    <ul className="rule-rows">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/assignments/${item.id}`}
            className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:gap-x-4"
          >
            <span className="hidden min-w-0 items-center gap-1.5 text-[12.5px] text-ink-3 sm:flex">
              <CourseColorDot
                courseId={item.courseId}
                courses={courses}
                className="size-1.5"
              />
              <span className="truncate">{item.course}</span>
            </span>
            <span className="min-w-0 truncate text-[15px] text-ink underline-offset-[3px] group-hover:underline">
              {item.title}
            </span>
            <span className="numeral text-[17px] whitespace-nowrap text-ink">
              {item.score ?? '—'}
              {item.possible != null && (
                <span className="text-[13px] text-ink-3">/{item.possible}</span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const CHANGE_DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

export function ChangesList({
  items,
  courses,
}: {
  items: DashboardData['changes'];
  courses: DashboardData['courses'];
}) {
  if (!items.length)
    return (
      <p className="border-y border-rule py-4 text-[13px] text-ink-3">
        No changes from Canvas or Gradescope yet.
      </p>
    );
  return (
    <ul className="rule-rows">
      {items.map((change) => (
        <li
          key={change.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:gap-x-4"
        >
          <span className="col-span-2 flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-3 sm:col-span-1">
            <CourseColorDot
              courseId={change.courseId}
              courses={courses}
              className="size-1.5"
            />
            <span className="truncate">{change.course ?? 'Personal'}</span>
          </span>
          <p className="text-[14px] leading-normal text-ink-2">
            {change.summary}
          </p>
          <time
            dateTime={change.detectedAt}
            className="text-[12.5px] whitespace-nowrap text-ink-4"
          >
            {CHANGE_DAY.format(new Date(change.detectedAt))}
          </time>
        </li>
      ))}
    </ul>
  );
}
