import { lectureNames } from '@/lib/study/model';
import type { StudyCourse } from '@/lib/study/types';

/** A week as the catch-up list reads it: item counts plus its lecture names. */
export type CatchUpWeek = {
  n: number;
  label: string;
  title: string;
  end: string;
  lectures: number;
  practice: number;
  studio: number;
  cards: number;
  checks: number;
  /** lectureNames(week), computed on the server */
  names: string[];
};

export type CatchUpCourse = Pick<StudyCourse, 'id' | 'code' | 'labels'> & {
  weeks: CatchUpWeek[];
};

/** What the behind list needs about a course, without the content. */
export function catchUpCourse(course: StudyCourse): CatchUpCourse {
  return {
    id: course.id,
    code: course.code,
    labels: course.labels,
    weeks: course.weeks.map((week) => ({
      n: week.n,
      label: week.label,
      title: week.title,
      end: week.end,
      lectures: week.lectures.length,
      practice: week.practice.length,
      studio: week.studio.length,
      cards: week.cards.length,
      checks: week.checks.length,
      names: lectureNames(week),
    })),
  };
}
