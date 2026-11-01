import type { Metadata } from 'next';
import { FlashcardsHub } from '@/components/study/flashcards/hub';
import { loadStudyPage } from '@/components/study/load';
import { curWeek } from '@/lib/study/model';
import { getStudyPrefs } from '@/lib/study/prefs';
import { courseItems } from '@/lib/study/srs';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Flashcards' };

export default async function StudyCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ cid: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { course, state, today } = await loadStudyPage(params);
  const { tab } = await searchParams;
  return (
    <FlashcardsHub
      course={{
        cid: course.id,
        code: course.code,
        name: course.name,
        math: course.math,
        codeLang: course.code_lang,
        initial: state,
        items: courseItems(course),
        weeks: course.weeks.map(({ n, label, title, start, end, exams }) => ({
          n,
          label,
          title,
          start,
          end,
          exams,
        })),
        exams: Object.values(course.exams).map(({ id, title }) => ({
          id,
          title,
        })),
        current: curWeek(course.weeks, today),
      }}
      prefs={getStudyPrefs()}
      tab={typeof tab === 'string' ? tab : undefined}
      now={Date.now()}
    />
  );
}
