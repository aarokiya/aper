import type { Metadata } from 'next';
import { clientCourse } from '@/components/study/format';
import { GraderView } from '@/components/study/grader-view';
import { loadStudyPage } from '@/components/study/load';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Grader' };

export default async function StudyGraderPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { course, state } = await loadStudyPage(params);
  return <GraderView course={clientCourse(course, [])} initial={state} />;
}
