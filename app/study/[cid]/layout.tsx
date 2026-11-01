import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TutorProvider } from '@/components/study/ai/tutor';
import { Spine } from '@/components/study/spine';
import { groqEnabled } from '@/lib/groq/client';
import { getStudyCourse } from '@/lib/study/hub';
import { curWeek, localDayKey } from '@/lib/study/model';
import { getStudyProgress } from '@/lib/study/progress';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cid: string }>;
}): Promise<Metadata> {
  const course = getStudyCourse((await params).cid);
  return {
    title: course ? `${course.code}: ${course.name}` : 'Course not found',
  };
}

/** Every course view: the tutor (when Groq is set up) and the semester timeline. */
export default async function StudyCourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ cid: string }>;
}) {
  const course = getStudyCourse((await params).cid);
  if (!course) notFound();
  const today = localDayKey();
  return (
    <TutorProvider
      course={{
        id: course.id,
        code: course.code,
        tutor: course.tutor,
        math: course.math,
        code_lang: course.code_lang,
      }}
      enabled={groqEnabled()}
    >
      <div className="study-main">
        <Spine
          courseId={course.id}
          code={course.code}
          labels={course.labels}
          current={curWeek(course.weeks, today)}
          initial={getStudyProgress(course.id)}
          today={today}
          weeks={course.weeks.map((week) => ({
            n: week.n,
            label: week.label,
            title: week.title,
            start: week.start,
            end: week.end,
            exam: week.exams.length > 0,
            lectures: week.lectures.length,
            practice: week.practice.length,
            studio: week.studio.length,
            cards: week.cards.length,
            checks: week.checks.length,
          }))}
        />
        {children}
      </div>
    </TutorProvider>
  );
}
