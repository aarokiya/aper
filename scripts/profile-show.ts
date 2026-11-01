import { getAppearance } from '@/lib/appearance/store';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { readEnvValue } from '@/lib/env-file';
import { getCalculatorState, loadGradeCourses } from '@/lib/grades/load';
import { getCareerProfile } from '@/lib/handshake/profile';
import { getPlannerFile } from '@/lib/planner/store';
import { getStudentProfile } from '@/lib/profile/apply';
import { loadStudyHub } from '@/lib/study/hub';
import { getStudyZone } from '@/lib/study/nav';
import { APP_TIME_ZONE } from '@/lib/time-zone';

// What this copy is configured with, as JSON: an agent runs this to verify `profile:apply`.
initializeDatabase();
const state = getCalculatorState();
const hub = loadStudyHub();
const planner = getPlannerFile();
const synced = getDb()
  .sqlite.prepare(
    `SELECT MAX(finished_at) AS at FROM sync_runs WHERE provider='canvas' AND status IN ('SUCCESS','PARTIAL')`,
  )
  .get() as { at: string | null };

console.log(
  JSON.stringify(
    {
      student: getStudentProfile(),
      timeZone: APP_TIME_ZONE,
      greetingName: getAppearance().greeting.name || null,
      careers: getCareerProfile(),
      groqKey: readEnvValue('GROQ_API_KEY') ? 'set in .env' : process.env.GROQ_API_KEY ? 'set in the environment' : null,
      lastCanvasSync: synced.at,
      courses: loadGradeCourses().map((course) => ({
        id: course.id,
        code: course.code,
        name: course.name,
        credits: state.credits[String(course.id)] ?? course.policy?.credits ?? null,
        cutoffs: state.cutoffs[String(course.id)] ?? course.policy?.cutoffs ?? null,
        gradedBy: course.policy ? `syllabus (${course.policy.source})` : 'Canvas groups',
      })),
      planner: planner ? { program: planner.program, terms: planner.plan.terms.map((term) => term.id) } : null,
      studyHub: hub
        ? {
            title: hub.title,
            courses: hub.courses.map((course) => course.code),
            studyZone: getStudyZone(hub.courses.map((course) => course.id)),
          }
        : null,
    },
    null,
    2,
  ),
);
