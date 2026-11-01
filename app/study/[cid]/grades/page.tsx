import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GradesView } from '@/components/study/grades-view';
import { loadStudyPage } from '@/components/study/load';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Grades' };

export default async function StudyGradesPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { course, state } = await loadStudyPage(params);
  if (!course.grading) notFound();
  return (
    <GradesView
      courseId={course.id}
      code={course.code}
      grading={course.grading}
      exams={Object.fromEntries(
        Object.entries(course.exams).map(([key, exam]) => [
          key,
          {
            id: exam.id,
            title: exam.title,
            covers: exam.covers,
            date: exam.date,
            dateEst: exam.dateEst,
          },
        ]),
      )}
      initial={state}
    />
  );
}
