'use client';

import Link from 'next/link';
import { reviewItems, stripHtml } from '@/lib/study/model';
import { useStudyProgress } from '@/lib/study/progress-client';
import type { StudyCourse, StudyCourseState } from '@/lib/study/types';
import { esc, weekHref } from './format';
import { Html } from './html';

/** Review queue (artifact renderReview): missed practice and studio problems rated Shaky or Missed. */
export function ReviewView({
  course,
  initial,
}: {
  course: StudyCourse;
  initial: StudyCourseState;
}) {
  const { state } = useStudyProgress(course.id, initial);
  const items = reviewItems(course, state);
  return (
    <div className="wrap">
      <div className="vhead">
        <h2>Review queue</h2>
        <p>
          {course.code} problems you missed or marked Shaky or Missed. Clear
          this before every exam.
        </p>
      </div>
      <div className="sheet">
        {items.length ? (
          items.map((item) => {
            const label =
              item.tab === 'practice'
                ? course.labels.practice
                : course.labels.studio;
            return (
              <div
                className="rq"
                key={`${item.tab}-${item.week.n}-${item.index}`}
              >
                <div className="src">
                  <span className="tag">{item.tag}</span>. Week{' '}
                  {item.week.label}, {label} {item.index + 1}
                </div>
                <Html
                  className="qq"
                  html={esc(stripHtml(item.q).slice(0, 260))}
                  math={course.math}
                />
                <Link
                  className="pill go"
                  href={weekHref(
                    course.id,
                    item.week.n,
                    item.tab,
                    `${item.tab === 'practice' ? 'p' : 's'}${item.week.n}-${item.index}`,
                  )}
                  aria-label={`Retry week ${item.week.label}, ${label} ${item.index + 1}`}
                >
                  Retry
                </Link>
              </div>
            );
          })
        ) : (
          <p className="emptystate">
            Nothing to review yet. Missed practice questions and studio problems
            you rate Shaky or Missed will show up here.
          </p>
        )}
      </div>
    </div>
  );
}
