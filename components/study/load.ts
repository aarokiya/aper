import { notFound } from 'next/navigation';
import { getStudyCourse } from '@/lib/study/hub';
import { localDayKey } from '@/lib/study/model';
import { getStudyProgress } from '@/lib/study/progress';

/** Course, saved progress, and today's local date for a course page; 404 for unknown ids. */
export async function loadStudyPage(params: Promise<{ cid: string }>) {
  const course = getStudyCourse((await params).cid);
  if (!course) notFound();
  return { course, state: getStudyProgress(course.id), today: localDayKey() };
}
