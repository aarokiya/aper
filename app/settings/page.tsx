import { PageFrame } from '@/components/page-frame';
import { SettingsClient } from '@/components/settings-client';
import type { StudyPrefsCourse } from '@/components/study/study-prefs-settings';
import { getDashboardData } from '@/lib/db/queries';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { groqKeyStatus } from '@/lib/groq/key-store';
import { loadStudyHub } from '@/lib/study/hub';
import { getStudyPrefs } from '@/lib/study/prefs';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const data = getDashboardData();
  initializeDatabase();
  const { sqlite } = getDb();
  const assignments = sqlite
    .prepare(
      `SELECT id,course_id AS courseId,title FROM assignments ORDER BY title`,
    )
    .all() as Array<{ id: number; courseId: number; title: string }>;
  const gradescopeProvider = (sqlite
    .prepare(
      `SELECT auth_status AS authStatus,last_success_at AS lastSuccessAt,last_error AS lastError FROM providers WHERE key='gradescope'`,
    )
    .get() as
    | {
        authStatus: string;
        lastSuccessAt: string | null;
        lastError: string | null;
      }
    | undefined) ?? {
    authStatus: 'AUTHENTICATION_REQUIRED',
    lastSuccessAt: null,
    lastError: null,
  };
  const imports = sqlite
    .prepare(
      `SELECT i.id,i.filename,i.imported_at AS importedAt,COALESCE(c.local_alias,c.course_code,c.name) AS course,a.title AS assignment FROM imported_artifacts i LEFT JOIN courses c ON c.id=i.course_id LEFT JOIN assignments a ON a.id=i.assignment_id WHERE i.provider='gradescope' ORDER BY i.imported_at DESC LIMIT 25`,
    )
    .all() as Array<{
    id: number;
    filename: string;
    importedAt: string;
    course: string | null;
    assignment: string | null;
  }>;
  const studyCourses: StudyPrefsCourse[] = (loadStudyHub()?.courses ?? []).map(
    (course) => {
      const has = (count: (week: (typeof course.weeks)[number]) => number) =>
        course.weeks.some((week) => count(week) > 0);
      return {
        id: course.id,
        code: course.code,
        name: course.name,
        tabs: [
          { id: 'lecture', label: course.labels.lecture },
          ...(has((week) => week.practice.length)
            ? [{ id: 'practice', label: course.labels.practice }]
            : []),
          ...(has((week) => week.studio.length)
            ? [{ id: 'studio', label: course.labels.studio }]
            : []),
          ...(has((week) => week.cards.length)
            ? [{ id: 'cards', label: 'Cards' }]
            : []),
          ...(has((week) => week.parsons?.length ?? 0)
            ? [{ id: 'parsons', label: 'Arrange' }]
            : []),
        ],
      };
    },
  );
  return (
    <PageFrame title="Settings" eyebrow="Everything stays on this computer" width="reading">
      <SettingsClient
        provider={data.provider}
        gradescopeProvider={gradescopeProvider}
        courses={data.courses.map(({ id, code }) => ({ id, code }))}
        assignments={assignments}
        initialImports={imports}
        initialGroq={groqKeyStatus()}
        studyPrefs={getStudyPrefs()}
        studyCourses={studyCourses}
      />
    </PageFrame>
  );
}
