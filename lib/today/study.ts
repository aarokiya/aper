import {
  curWeek,
  dayDiff,
  examWeek,
  examsOf,
  fmtExamDate,
} from '@/lib/study/model';
import type { StudyNav, StudyWeekOutline } from '@/lib/study/nav';
import type { StudyCourseState } from '@/lib/study/types';

/** Study Hub facts Today shows: upcoming exams and each course's current week. */
export type TodayExam = {
  key: string;
  courseId: string;
  code: string;
  title: string;
  /** "Wed Oct 14, 6:30 PM (estimated)" */
  when: string;
  days: number;
  href: string;
};

export type TodayStudyCourse = {
  id: string;
  code: string;
  week: StudyWeekOutline;
  /** "Week 6: Induction" */
  heading: string;
  tabs: Array<{ id: string; label: string; href: string }>;
  state: StudyCourseState;
};

export type TodayStudy = {
  exams: TodayExam[];
  courses: TodayStudyCourse[];
  /** due + learning across the courses in Daily review */
  dailyDue: number;
};

const weekHref = (courseId: string, n: number, tab: string) =>
  `/study/${courseId}/week/${n}?tab=${tab}`;

/** Mirrors the artifact overview: next six exams across courses, then "This week". */
export function todayStudy(nav: StudyNav, today: string): TodayStudy {
  const exams: TodayExam[] = [];
  const courses: TodayStudyCourse[] = [];
  for (const outline of Object.values(nav.outlines)) {
    const state = nav.progress[outline.id];
    for (const { exam, date } of examsOf(outline.exams, state)) {
      const days = dayDiff(date, today);
      if (days < 0) continue;
      const week = examWeek(outline.weeks, exam.id);
      exams.push({
        key: `${outline.id}:${exam.id}`,
        courseId: outline.id,
        code: outline.code,
        title: exam.title,
        when: fmtExamDate(state, exam),
        days,
        href: week
          ? weekHref(outline.id, week.n, `x-${exam.id}`)
          : `/study/${outline.id}`,
      });
    }
    const n = curWeek(outline.weeks, today);
    const week = outline.weeks.find((item) => item.n === n);
    if (!week) continue;
    const tabs = [
      { id: 'lecture', label: outline.labels.lecture },
      ...(week.practice
        ? [{ id: 'practice', label: outline.labels.practice }]
        : []),
      ...(week.studio ? [{ id: 'studio', label: outline.labels.studio }] : []),
      ...(week.cards ? [{ id: 'cards', label: 'Cards' }] : []),
      ...week.exams.flatMap((id) => {
        const title = outline.exams.find((exam) => exam.id === id)?.title;
        return title ? [{ id: `x-${id}`, label: title }] : [];
      }),
    ].map((tab) => ({ ...tab, href: weekHref(outline.id, week.n, tab.id) }));
    courses.push({
      id: outline.id,
      code: outline.code,
      week,
      heading: `${week.label === String(week.n) ? `Week ${week.n}` : week.label}: ${week.title}`,
      tabs,
      state,
    });
  }
  exams.sort((a, b) => a.days - b.days);
  return { exams: exams.slice(0, 6), courses, dailyDue: nav.dailyDue };
}
