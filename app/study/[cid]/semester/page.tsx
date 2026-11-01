import type { Metadata } from 'next';
import { loadStudyPage } from '@/components/study/load';
import { SemesterView } from '@/components/study/semester-view';
import { curWeek } from '@/lib/study/model';
import { outlineCourse } from '@/lib/study/nav';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Semester at a glance' };

export default async function StudySemesterPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { course, state, today } = await loadStudyPage(params);
  const outline = outlineCourse(course, null);
  return (
    <SemesterView
      courseId={course.id}
      code={course.code}
      rows={outline.weeks.map((week, i) => ({
        ...week,
        events: course.weeks[i].events,
      }))}
      current={curWeek(course.weeks, today)}
      initial={state}
    />
  );
}
