import type { StudyCourse, StudyWeek } from '@/lib/study/types';

/** Option letters for multiple choice (artifact `'ABCDEFGH'[i]`). */
export const LETTERS = 'ABCDEFGH';

/** "Week 3", or the week's own label ("Finals") when it is not a number. */
export const weekName = (week: { n: number; label: string }) =>
  week.label === String(week.n) ? `Week ${week.n}` : week.label;

/** URL of a week page; without `tab` it opens the course's default week tab (Settings → Study). */
export function weekHref(
  courseId: string,
  n: number,
  tab?: string,
  anchor?: string,
) {
  let href = `/study/${courseId}/week/${n}`;
  if (tab) href += `?tab=${encodeURIComponent(tab)}`;
  if (anchor) href += `#${anchor}`;
  return href;
}

export const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape plain text for splicing into content HTML. */
export const esc = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ESCAPES[char]);

/**
 * A course restricted to the given weeks and the exams those weeks hold, for
 * handing to client views without shipping the whole hub. Guides and
 * materials are server-rendered, so they are left out.
 */
export function clientCourse(
  course: StudyCourse,
  weeks: StudyWeek[],
): StudyCourse {
  const exams: StudyCourse['exams'] = {};
  for (const week of weeks)
    for (const id of week.exams)
      if (course.exams[id]) exams[id] = course.exams[id];
  return { ...course, weeks, exams, pages: [], materials: [] };
}
