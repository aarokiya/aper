'use client';

import Link from 'next/link';
import {
  dayDiff,
  fmtExamDate,
  nextExam,
  reviewCount,
  weekProg,
} from '@/lib/study/model';
import type { StudyCourseOutline } from '@/lib/study/nav';
import { useStudyProgress } from '@/lib/study/progress-client';
import type { StudyCourseState } from '@/lib/study/types';

/** "Next up: Midterm 1, Wed Sep 16. That's 5 days away. This week is 40% done." */
export function CourseLede({
  outline,
  initial,
  today,
  week,
}: {
  outline: StudyCourseOutline;
  initial: StudyCourseState;
  today: string;
  /** current week number */
  week: number;
}) {
  const { state } = useStudyProgress(outline.id, initial);
  const current = outline.weeks.find((item) => item.n === week);
  const upcoming = nextExam(outline.exams, state, today);
  const days = upcoming ? dayDiff(upcoming.date, today) : null;
  return (
    <p className="lede">
      {upcoming && days === 0 && (
        <>
          <strong>{upcoming.exam.title}</strong> is today.
        </>
      )}
      {upcoming && days !== null && days > 0 && (
        <>
          Next up: <strong>{upcoming.exam.title}</strong>,{' '}
          {fmtExamDate(state, upcoming.exam)}. That&apos;s {days} day
          {days === 1 ? '' : 's'} away.
        </>
      )}
      {upcoming && days !== null && days < 0 && 'All exams are done.'}
      {current &&
        `${upcoming ? ' ' : ''}This week is ${weekProg(state, current).pct}% done.`}
    </p>
  );
}

/** The course's study tools, with the live review-queue count and today's flashcard reviews. */
export function StudyTools({
  outline,
  initial,
  cardsDue,
}: {
  outline: StudyCourseOutline;
  initial: StudyCourseState;
  /** due + learning flashcard reviews today (server count) */
  cardsDue: number;
}) {
  const { state } = useStudyProgress(outline.id, initial);
  const base = `/study/${outline.id}`;
  return (
    <div className="tools-row">
      <Link href={`${base}/grader`} className="pill pill-primary">
        Grade a proof or answer
      </Link>
      <Link href={`${base}/review`} className="pill">
        Review queue ({reviewCount(outline.weeks, state)})
      </Link>
      <Link href={`${base}/cards`} className="pill">
        Flashcards · {cardsDue} due
      </Link>
      <Link href={`${base}/formulas`} className="pill">
        {outline.hasFormulas ? 'Formula sheet' : 'Cheat sheet'}
      </Link>
      {outline.hasPages && (
        <Link href={`${base}/guides`} className="pill">
          Guides
        </Link>
      )}
      <Link href={`${base}/semester`} className="pill">
        Semester at a glance
      </Link>
      {outline.hasGrading && (
        <Link href={`${base}/grades`} className="pill">
          Grades
        </Link>
      )}
    </div>
  );
}
