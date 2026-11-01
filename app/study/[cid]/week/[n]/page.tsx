import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clientCourse, weekName } from '@/components/study/format';
import { loadStudyPage } from '@/components/study/load';
import { WeekView } from '@/components/study/week-view';
import { condenseWeek } from '@/lib/study/condense';
import { getStudyCourse } from '@/lib/study/hub';
import { curWeek, weekByNumber } from '@/lib/study/model';
import { getStudyPrefs } from '@/lib/study/prefs';

export const dynamic = 'force-dynamic';

type Params = Promise<{ cid: string; n: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { cid, n } = await params;
  const course = getStudyCourse(cid);
  const week = course ? weekByNumber(course, Number(n)) : undefined;
  return {
    title:
      course && week
        ? `${course.code}, ${weekName(week).toLowerCase()}: ${week.title}`
        : 'Week not found',
  };
}

export default async function StudyWeekPage({ params }: { params: Params }) {
  const { n } = await params;
  const { course, state, today } = await loadStudyPage(params);
  const number = /^\d+$/.test(n) ? Number(n) : NaN;
  const index = course.weeks.findIndex((week) => week.n === number);
  if (index < 0) notFound();
  const week = course.weeks[index];
  const current = curWeek(course.weeks, today);
  return (
    <WeekView
      key={week.n}
      course={clientCourse(course, [week])}
      initial={state}
      prefs={getStudyPrefs()}
      condensed={condenseWeek(week)}
      today={today}
      relation={
        week.n === current
          ? 'this week'
          : week.n < current
            ? 'past'
            : 'coming up'
      }
      prev={course.weeks[index - 1]?.n ?? null}
      next={course.weeks[index + 1]?.n ?? null}
    />
  );
}
