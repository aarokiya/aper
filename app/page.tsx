import { TodayEvents } from '@/components/careers/today-careers';
import { classGrades } from '@/components/study/canvas';
import { TodayView } from '@/components/today/today-view';
import { getDashboardData } from '@/lib/db/queries';
import { getCareersDigest } from '@/lib/handshake/queries';
import { localDayKey } from '@/lib/study/model';
import { currentClasses, displayCode, getStudyNav } from '@/lib/study/nav';
import { todayStudy } from '@/lib/today/study';

export const dynamic = 'force-dynamic';

export default function Home() {
  const now = new Date();
  const today = localDayKey(now);
  const careers = getCareersDigest();
  const dashboard = getDashboardData();
  // The grade calculator's grade (by the syllabus when adopted), not Canvas's.
  const grades = classGrades();
  // Short codes like the rail's ("ABC-1234-A1/A2" → "ABC 1234"); aliases pass through.
  const data = {
    ...dashboard,
    tasks: dashboard.tasks.map((task) => ({ ...task, course: displayCode(task.course) })),
    courses: dashboard.courses.map((course) => {
      const grade = grades.get(course.id);
      return {
        ...course,
        code: displayCode(course.code),
        grade: grade ? grade.letter : course.grade,
        score: grade ? grade.percent : course.score,
      };
    }),
    recentlyGraded: dashboard.recentlyGraded.map((item) => ({ ...item, course: displayCode(item.course) })),
    changes: dashboard.changes.map((change) => ({ ...change, course: change.course && displayCode(change.course) })),
  };
  return (
    <TodayView
      data={data}
      today={today}
      hour={now.getHours()}
      classIds={currentClasses().map((item) => item.id)}
      study={todayStudy(getStudyNav(), today)}
      careers={{
        events: <TodayEvents key="events" digest={careers} />,
      }}
    />
  );
}
