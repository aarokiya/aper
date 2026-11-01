import { format } from 'date-fns';
import { PageFrame } from '@/components/page-frame';
import { GradeCalculator } from '@/components/grade-calculator';
import { getDashboardData } from '@/lib/db/queries';
import { getCalculatorState, loadGradeCourses } from '@/lib/grades/load';

export const dynamic = 'force-dynamic';

export default function GradesPage() {
  const { provider, courses } = getDashboardData();
  return (
    <PageFrame title="Grade calculator" eyebrow="Grades">
      <GradeCalculator
        courses={loadGradeCourses()}
        initialState={getCalculatorState()}
        syncedAt={provider.lastSuccessAt ? format(new Date(provider.lastSuccessAt), 'MMM d, h:mm a') : null}
        colorCourses={courses.map((course) => ({ id: course.id }))}
      />
    </PageFrame>
  );
}
