import { z } from 'zod';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { readSetting, writeSetting } from '@/lib/db/settings';
import { tallyClassWork, type ClassWork, type WorkRow } from './class-status';
import { loadStudyHub } from './hub';
import { getStudyPrefs } from './prefs';
import { coursePrefs, type StudyPrefs } from './prefs-schema';
import { getStudyProgress } from './progress';
import { courseItems, dailyCounts, userCardItems } from './srs';
import type {
  StudyCourse,
  StudyCourseState,
  StudyExam,
  StudyWeek,
} from './types';

/** `ABC 1234`, `ABC-1234-B`, `abc1234` → `ABC1234`; null when no dept+number. */
export function courseKey(value: string | null | undefined) {
  const match = value?.toUpperCase().match(/\b([A-Z]{2,5})\s*-?\s*(\d{4})/);
  return match ? `${match[1]}${match[2]}` : null;
}

/** `ABC-1234-A1/A2/A3` → `ABC 1234` (falls back to the input). */
export function displayCode(value: string) {
  const match = value.toUpperCase().match(/\b([A-Z]{2,5})\s*-?\s*(\d{4})/);
  return match ? `${match[1]} ${match[2]}` : value;
}

/** `Intro to Widgets - ABC-1234-B` → `Intro to Widgets`. */
export const canvasCourseTitle = (name: string) =>
  name.replace(/\s+-\s+[A-Z]{2,5}-\d{4}.*$/, '').trim();

export type StudyWeekOutline = Pick<
  StudyWeek,
  'n' | 'label' | 'title' | 'start' | 'end' | 'secs' | 'exams' | 'events'
> & {
  lectures: number;
  practice: number;
  studio: number;
  cards: number;
  checks: number;
};

/** Everything the rail needs about a Study Hub course, without the content. */
export type StudyCourseOutline = Pick<
  StudyCourse,
  'id' | 'code' | 'name' | 'who' | 'labels'
> & {
  canvasCourseId: number | null;
  hasFormulas: boolean;
  hasPages: boolean;
  /** has a `grading` block, so the Grades view applies */
  hasGrading: boolean;
  weeks: StudyWeekOutline[];
  exams: Array<Pick<StudyExam, 'id' | 'title' | 'date' | 'dateEst'>>;
  /** practice/studio indexes per week, for the review queue count */
};
export type ClassLink = {
  /** stable key: study id or `canvas-<id>` */
  key: string;
  code: string;
  name: string;
  /** Study Hub course id when the class has study materials */
  studyId: string | null;
  canvasCourseId: number | null;
};

/** Today's Daily-review numbers for one course (counted even when the course is left out of Daily review). */
export type StudyDueCounts = {
  due: number;
  learning: number;
  newAvail: number;
  /** included in Daily review */
  review: boolean;
};

export type StudyNav = {
  title: string | null;
  /** study courses first (hub order), then other current-term classes */
  classes: ClassLink[];
  /** Study Hub course ids in the rail's Study zone, in order */
  zone: string[];
  outlines: Record<string, StudyCourseOutline>;
  progress: Record<string, StudyCourseState>;
  prefs: StudyPrefs;
  /** per hub course id */
  due: Record<string, StudyDueCounts>;
  /** due + learning across the courses in Daily review */
  dailyDue: number;
};

type CanvasClass = {
  id: number;
  code: string | null;
  name: string;
  alias: string | null;
};

/** Current-term academic Canvas classes (excludes "Default Term" orgs). */
export function currentClasses(): CanvasClass[] {
  initializeDatabase();
  return getDb()
    .sqlite.prepare(
      `SELECT id, course_code AS code, name, local_alias AS alias FROM courses
       WHERE is_current=1 AND COALESCE(term_name,'')<>'Default Term' AND source_provider='canvas'
       ORDER BY COALESCE(local_alias, course_code, name)`,
    )
    .all() as CanvasClass[];
}

/** Canvas course id for a Study Hub course code, matched by dept+number. */
export function canvasCourseFor(studyCode: string, classes = currentClasses()) {
  const key = courseKey(studyCode);
  if (!key) return null;
  return (
    classes.find(
      (item) =>
        courseKey(item.alias) === key ||
        courseKey(item.code) === key ||
        courseKey(item.name) === key,
    )?.id ?? null
  );
}

export function outlineCourse(
  course: StudyCourse,
  canvasCourseId: number | null,
): StudyCourseOutline {
  return {
    id: course.id,
    code: course.code,
    name: course.name,
    who: course.who,
    labels: course.labels,
    canvasCourseId,
    hasFormulas: course.formulas.length > 0,
    hasPages: course.pages.length > 0,
    hasGrading: Boolean(course.grading),
    weeks: course.weeks.map((week) => ({
      n: week.n,
      label: week.label,
      title: week.title,
      start: week.start,
      end: week.end,
      secs: week.secs,
      exams: week.exams,
      events: week.events,
      lectures: week.lectures.length,
      practice: week.practice.length,
      studio: week.studio.length,
      cards: week.cards.length,
      checks: week.checks.length,
    })),
    exams: Object.values(course.exams).map((exam) => ({
      id: exam.id,
      title: exam.title,
      date: exam.date,
      dateEst: exam.dateEst,
    })),
  };
}

const ZONE_KEY = 'rail-study-zone';
const zoneSchema = z.array(z.string()).max(100);

/** `ids` in order, without repeats or ids the hub doesn't have. */
function hubOnly(ids: readonly string[], hubIds: readonly string[]) {
  const known = new Set(hubIds);
  return [...new Set(ids)].filter((id) => known.has(id));
}

/**
 * Hub course ids in the rail's Study zone, in order. Every hub course sits
 * there until the user moves one; ids no longer in the hub are dropped.
 */
export function getStudyZone(hubIds: readonly string[]) {
  const saved = readSetting(ZONE_KEY, zoneSchema.nullable(), null);
  return saved ? hubOnly(saved, hubIds) : [...hubIds];
}

/** Saves the Study zone and returns what was kept (hub courses only). */
export function saveStudyZone(ids: readonly string[]) {
  const zone = hubOnly(
    ids,
    loadStudyHub()?.courses.map((course) => course.id) ?? [],
  );
  writeSetting(ZONE_KEY, zone);
  return zone;
}

/** Open Canvas/Gradescope work per current class, in the window Today shows. */
export function getClassWork(now = new Date()): Record<number, ClassWork> {
  initializeDatabase();
  const rows = getDb()
    .sqlite.prepare(
      `SELECT a.course_id AS courseId,COALESCE(l.personal_due_at,a.due_at) AS dueAt,
              COALESCE(s.provider_state,'UNSUBMITTED') AS providerState,COALESCE(l.workflow_status,'NOT_STARTED') AS workflowStatus
       FROM assignments a JOIN courses c ON c.id=a.course_id
       LEFT JOIN submissions s ON s.assignment_id=a.id
       LEFT JOIN local_task_metadata l ON l.assignment_id=a.id
       WHERE c.is_current=1 AND COALESCE(l.personal_due_at,a.due_at) IS NOT NULL
         AND (a.due_at IS NULL OR datetime(a.due_at) >= datetime(?))`,
    )
    .all(new Date(now.getTime() - 30 * 864e5).toISOString()) as WorkRow[];
  return tallyClassWork(rows, now);
}

/**
 * Today's review counts per course: every given course is counted (so a
 * course's Flashcards view has a number even when it is left out of Daily
 * review); `review` says whether Daily review includes it.
 */
export function studyDueCounts(
  courses: ReadonlyArray<{ course: StudyCourse; state: StudyCourseState }>,
  prefs: StudyPrefs,
  now = Date.now(),
): Record<string, StudyDueCounts> {
  const everyCourse: StudyPrefs = {
    ...prefs,
    courses: Object.fromEntries(
      courses.map(({ course }) => [
        course.id,
        { ...coursePrefs(prefs, course.id), review: true },
      ]),
    ),
  };
  const counts = dailyCounts({
    courses: courses.map(({ course, state }) => ({
      cid: course.id,
      items: [
        ...courseItems(course),
        ...userCardItems(course.id, state.uc, course.weeks),
      ],
      state,
    })),
    prefs: everyCourse,
    now,
  });
  return Object.fromEntries(
    courses.map(({ course }) => {
      const count = counts[course.id];
      return [
        course.id,
        {
          due: count?.due ?? 0,
          learning: count?.learning ?? 0,
          newAvail: count?.newAvail ?? 0,
          review: coursePrefs(prefs, course.id).review,
        },
      ];
    }),
  );
}

/** Due + learning across the courses included in Daily review. */
export const dailyDueTotal = (due: Record<string, StudyDueCounts>) =>
  Object.values(due).reduce(
    (sum, count) => (count.review ? sum + count.due + count.learning : sum),
    0,
  );

export function getStudyNav(): StudyNav {
  const hub = loadStudyHub();
  const classes = currentClasses();
  const matched = new Set<number>();
  const links: ClassLink[] = [];
  const outlines: StudyNav['outlines'] = {};
  const progress: StudyNav['progress'] = {};
  for (const course of hub?.courses ?? []) {
    const canvasCourseId = canvasCourseFor(course.code, classes);
    if (canvasCourseId !== null) matched.add(canvasCourseId);
    links.push({
      key: course.id,
      code: course.code,
      name: course.name,
      studyId: course.id,
      canvasCourseId,
    });
    outlines[course.id] = outlineCourse(course, canvasCourseId);
    progress[course.id] = getStudyProgress(course.id);
  }
  for (const item of classes) {
    if (matched.has(item.id)) continue;
    links.push({
      key: `canvas-${item.id}`,
      code: item.alias ?? displayCode(item.code ?? item.name),
      name: canvasCourseTitle(item.name),
      studyId: null,
      canvasCourseId: item.id,
    });
  }
  const prefs = getStudyPrefs();
  const due = studyDueCounts(
    (hub?.courses ?? []).map((course) => ({
      course,
      state: progress[course.id],
    })),
    prefs,
  );
  return {
    title: hub?.title ?? null,
    classes: links,
    zone: getStudyZone(hub?.courses.map((course) => course.id) ?? []),
    outlines,
    progress,
    prefs,
    due,
    dailyDue: dailyDueTotal(due),
  };
}
