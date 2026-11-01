import type { Metadata } from 'next';
import { clientCourse } from '@/components/study/format';
import { loadStudyPage } from '@/components/study/load';
import { ReviewView } from '@/components/study/review-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Review queue' };

export default async function StudyReviewPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { course, state } = await loadStudyPage(params);
  // The queue only reads practice and studio questions; lecture notes and cards stay on the server.
  const weeks = course.weeks.map((week) => ({
    ...week,
    lectures: [],
    cards: [],
    note: '',
  }));
  return <ReviewView course={clientCourse(course, weeks)} initial={state} />;
}
