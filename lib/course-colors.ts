export type CourseColorSource = { id: number };

export const courseColors = [
  'var(--course-blue)',
  'var(--course-gold)',
  'var(--course-violet)',
  'var(--course-teal)',
] as const;

const personalColor = 'var(--muted-foreground)';

/**
 * Resolves the one canonical color for a course. The sidebar's ordered course
 * list is the source of truth, so every view can match it by course id rather
 * than accidentally coloring individual rows by position.
 */
export function getCourseColor(
  courseId: number | null | undefined,
  courses: readonly CourseColorSource[],
) {
  if (courseId == null) return personalColor;
  const courseIndex = courses.findIndex((course) => course.id === courseId);
  const paletteIndex =
    courseIndex >= 0
      ? courseIndex % courseColors.length
      : Math.abs(courseId) % courseColors.length;
  return courseColors[paletteIndex];
}
