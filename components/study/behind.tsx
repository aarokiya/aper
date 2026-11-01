'use client';

import Link from 'next/link';
import { behindWeeks, topicStatus } from '@/lib/study/model';
import { useStudyProgress } from '@/lib/study/progress-client';
import type { StudyCourseState } from '@/lib/study/types';
import type { CatchUpCourse } from './catch-up';
import { weekHref, weekName } from './format';
import { CheckMark } from './marks';
import { WithProgress } from './with-progress';

/**
 * Weeks that ended incomplete (artifact behindHTML): each with a Catch up
 * pill to its first missing item, its lecture names (full list only), and a
 * link per thing left. Shows a caught-up line when nothing is behind.
 */
export function BehindList({
  course,
  state,
  today,
  compact,
}: {
  course: CatchUpCourse;
  state: StudyCourseState;
  today: string;
  compact: boolean;
}) {
  const list = behindWeeks(course.labels, state, course.weeks, today);
  if (!list.length)
    return (
      <div className="caught">
        <CheckMark decorative />
        <span>
          You&apos;re caught up in {course.code}. Every past topic is complete.
        </span>
      </div>
    );
  return (
    <ul className="behind">
      {list.map((week) => {
        const { miss } = topicStatus(course.labels, state, week, today);
        return (
          <li key={week.n}>
            <div className="bh-h">
              <span className="bh-w">{weekName(week)}</span>
              <span className="bh-t">{week.title}</span>
              <Link
                href={weekHref(course.id, week.n, miss[0]?.tab ?? 'lecture')}
                className="pill"
              >
                Catch up
              </Link>
            </div>
            {!compact && (
              <div className="bh-l">
                {week.names.map((name, i) => (
                  <span key={`${i}-${name}`}>{name}</span>
                ))}
              </div>
            )}
            <div className="bh-m">
              {miss.map((item) => (
                <Link
                  key={item.text}
                  href={weekHref(course.id, week.n, item.tab)}
                  className="textlink"
                >
                  {item.text}
                </Link>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Course home's catch-up block (artifact renderHome): heading, compact list, spacer. */
export function CourseCatchUp({
  course,
  initial,
  today,
}: {
  course: CatchUpCourse;
  initial: StudyCourseState;
  today: string;
}) {
  const { state } = useStudyProgress(course.id, initial);
  const behind = behindWeeks(course.labels, state, course.weeks, today).length;
  return (
    <>
      <h3 className="grp">
        {behind
          ? `Behind on ${behind} week${behind === 1 ? '' : 's'}`
          : 'Catch-up status'}
      </h3>
      <BehindList course={course} state={state} today={today} compact />
      <div className="sp-lg" />
    </>
  );
}

/** The Behind view (artifact renderBehind): every week left incomplete, with what is left. */
export function BehindView({
  course,
  initial,
  today,
}: {
  course: CatchUpCourse;
  initial: StudyCourseState;
  today: string;
}) {
  const { state } = useStudyProgress(course.id, initial);
  const behind = behindWeeks(course.labels, state, course.weeks, today).length;
  return (
    <div className="wrap">
      <div className="vhead">
        <h2>{behind ? 'Behind' : 'Caught up'}</h2>
        <p>
          {course.code} weeks that have ended but aren&apos;t complete, with the
          lectures they covered and exactly what&apos;s left. A week counts as
          complete when its lecture is marked reviewed, every practice question
          is correct, every studio problem is rated Got it, and every card and
          checklist item is done.
        </p>
      </div>
      <div className="sheet">
        <BehindList course={course} state={state} today={today} compact={false} />
      </div>
    </div>
  );
}

/** The overview's Catch up list (artifact renderOverview): one row per course. */
export function CatchUpAll({
  courses,
  today,
}: {
  courses: Array<CatchUpCourse & { initial: StudyCourseState }>;
  today: string;
}) {
  return (
    <WithProgress seeds={courses}>
      {(states) => (
        <ul className="catchall">
          {courses.map((course, index) => {
            const state = states[index];
            const list = behindWeeks(course.labels, state, course.weeks, today);
            return (
              <li key={course.id}>
                <span className="uc">{course.code}</span>
                {list.length ? (
                  <>
                    <span className="st-behind">
                      Behind on {list.length} week{list.length === 1 ? '' : 's'}
                    </span>
                    <span className="ca-w">
                      {list.map((week) => (
                        <Link
                          key={week.n}
                          href={weekHref(
                            course.id,
                            week.n,
                            topicStatus(course.labels, state, week, today)
                              .miss[0]?.tab ?? 'lecture',
                          )}
                          className="textlink"
                        >
                          {weekName(week)}
                        </Link>
                      ))}
                    </span>
                  </>
                ) : (
                  <span className="st-done">Caught up ✓</span>
                )}
                <Link
                  href={`/study/${course.id}/behind`}
                  className="textlink ca-all"
                >
                  See details
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WithProgress>
  );
}
