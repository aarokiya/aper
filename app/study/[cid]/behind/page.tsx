import type { Metadata } from 'next';
import { BehindView } from '@/components/study/behind';
import { catchUpCourse } from '@/components/study/catch-up';
import { loadStudyPage } from '@/components/study/load';
import { getStudyCourse } from '@/lib/study/hub';
import { behindWeeks, localDayKey } from '@/lib/study/model';
import { getStudyProgress } from '@/lib/study/progress';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cid: string }>;
}): Promise<Metadata> {
  const course = getStudyCourse((await params).cid);
  if (!course) return { title: 'Course not found' };
  const behind = behindWeeks(
    course.labels,
    getStudyProgress(course.id),
    course.weeks,
    localDayKey(),
  ).length;
  return { title: behind ? 'Behind' : 'Caught up' };
}

export default async function StudyBehindPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { course, state, today } = await loadStudyPage(params);
  return (
    <BehindView course={catchUpCourse(course)} initial={state} today={today} />
  );
}
