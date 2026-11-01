import { PageFrame } from '@/components/page-frame';
import { AcademicCalendar } from '@/components/academic-calendar';
import { getCalendarItems, getDashboardData } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default function CalendarPage() {
  const items = getCalendarItems();
  const courses = getDashboardData().courses;
  return (
    <PageFrame
      title="Calendar"
      eyebrow={`${items.length} events from Canvas, Gradescope, and your tasks`}
    >
      <AcademicCalendar initialItems={items} courses={courses} />
    </PageFrame>
  );
}
