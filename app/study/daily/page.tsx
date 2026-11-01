import type { Metadata } from 'next';
import Link from 'next/link';
import { DailyReview, type ReviewCourse } from '@/components/study/review/daily';
import { loadStudyHub } from '@/lib/study/hub';
import { curWeek, localDayKey } from '@/lib/study/model';
import { getStudyPrefs } from '@/lib/study/prefs';
import { getStudyProgress } from '@/lib/study/progress';
import { courseItems } from '@/lib/study/srs';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Daily review' };

export default function StudyDailyPage() {
  const hub = loadStudyHub();
  if (!hub)
    return (
      <div className="study-main top">
        <div className="wrap home">
          <h2>Daily review</h2>
          <p className="emptystate">
            No Study Hub is imported yet. Open{' '}
            <Link
              href="/settings#study-hub"
              className="underline decoration-rule-2 underline-offset-[3px] hover:decoration-ink"
            >
              Settings, Study Hub
            </Link>{' '}
            and upload the artifact&apos;s .html file.
          </p>
        </div>
      </div>
    );

  const today = localDayKey();
  const courses: ReviewCourse[] = hub.courses.map((course) => ({
    cid: course.id,
    code: course.code,
    name: course.name,
    math: course.math,
    codeLang: course.code_lang,
    initial: getStudyProgress(course.id),
    items: courseItems(course),
    weeks: course.weeks.map(({ n, label, title, start, end, exams }) => ({
      n,
      label,
      title,
      start,
      end,
      exams,
    })),
    exams: Object.values(course.exams).map(({ id, title }) => ({ id, title })),
    current: curWeek(course.weeks, today),
  }));
  return (
    <DailyReview courses={courses} prefs={getStudyPrefs()} now={Date.now()} />
  );
}
