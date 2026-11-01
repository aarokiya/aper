import { cn } from '@/lib/utils';
import { getCourseColor, type CourseColorSource } from '@/lib/course-colors';

export function CourseColorDot({
  courseId,
  courses,
  color,
  className,
}: {
  courseId: number | null | undefined;
  courses?: readonly CourseColorSource[];
  color?: string;
  className?: string;
}) {
  const resolvedColor = color ?? getCourseColor(courseId, courses ?? []);
  return (
    <span
      aria-hidden="true"
      className={cn('size-2.5 shrink-0 rounded-full', className)}
      data-course-color={resolvedColor}
      data-course-id={courseId ?? 'personal'}
      style={{ backgroundColor: resolvedColor }}
    />
  );
}
