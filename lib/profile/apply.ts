import fs from 'node:fs';
import path from 'node:path';
import { appearanceSchema } from '@/lib/appearance/schema';
import { getAppearance, saveAppearance } from '@/lib/appearance/store';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { readSetting, writeSetting } from '@/lib/db/settings';
import { readEnvValue, setEnvValue } from '@/lib/env-file';
import { saveGradePolicy, getGradePolicy } from '@/lib/grades/policy-store';
import { buildPolicy } from '@/lib/grades/policy';
import type { GradeCourse } from '@/lib/grades/calculator';
import { getCalculatorState, loadGradeCourses, saveCalculatorState } from '@/lib/grades/load';
import { parseSyllabus } from '@/lib/grades/syllabus-parse';
import { syllabusTextFromFile, SyllabusTextError } from '@/lib/grades/syllabus-text';
import { isGroqKey, saveGroqKey } from '@/lib/groq/key-store';
import { getCareerProfile, saveCareerProfile } from '@/lib/handshake/profile';
import { rescoreHandshake } from '@/lib/handshake/store';
import { getPlannerFile, importPlannerFile } from '@/lib/planner/store';
import { plannerFileSchema } from '@/lib/planner/types';
import { rebuildSearchIndex } from '@/lib/search/index';
import { importStudyHubPath, loadStudyHub, previewStudyHubPath } from '@/lib/study/hub';
import { courseKey, getStudyZone, saveStudyZone } from '@/lib/study/nav';
import { getStudyPrefs, saveStudyPrefs, studyPrefsSchema } from '@/lib/study/prefs';
import {
  profileSchema,
  studentSchema,
  type Profile,
  type ProfileCourse,
  type StudentProfile,
} from './schema';

export type ApplyReport = { applied: string[]; skipped: string[]; warnings: string[] };

const STUDENT_KEY = 'student-profile';

/** The student block saved by the last apply, or null. */
export function getStudentProfile(): StudentProfile | null {
  return readSetting(STUDENT_KEY, studentSchema.nullable(), null);
}

/** Reads and validates a profile file; throws a ZodError or a file error. */
export function readProfileFile(file: string): Profile {
  return profileSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** Objects merge key by key; arrays and plain values replace. */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return base;
  const mergeable = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!mergeable(base) || !mergeable(patch)) return patch;
  const from = base as Record<string, unknown>;
  const out: Record<string, unknown> = { ...from };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>))
    out[key] = deepMerge(from[key], value);
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function validZone(zone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

type CanvasCourse = { id: number; code: string | null; name: string; alias: string | null };

function currentCanvasCourses(): CanvasCourse[] {
  initializeDatabase();
  return getDb()
    .sqlite.prepare(
      `SELECT id,course_code AS code,name,local_alias AS alias FROM courses
       WHERE is_current=1 AND source_provider='canvas' AND COALESCE(term_name,'')<>'Default Term'
       ORDER BY id`,
    )
    .all() as CanvasCourse[];
}

/** The synced Canvas course a profile code names: by department and number, else exactly. */
function matchCourse(code: string, courses: CanvasCourse[]) {
  const key = courseKey(code);
  const wanted = code.trim().toLowerCase();
  return (
    courses.find((course) =>
      key
        ? courseKey(course.code) === key || courseKey(course.name) === key
        : [course.code, course.alias].some((value) => value?.trim().toLowerCase() === wanted),
    ) ?? null
  );
}

/**
 * Writes a profile into the local stores. Each section merges onto what is
 * saved, so rerunning is safe and anything the profile leaves out keeps its
 * value. `baseDir` resolves relative paths (the profile file's folder).
 * Nothing is written with `dryRun`.
 */
export async function applyProfile(
  profile: Profile,
  { baseDir = process.cwd(), dryRun = false }: { baseDir?: string; dryRun?: boolean } = {},
): Promise<ApplyReport> {
  const report: ApplyReport = { applied: [], skipped: [], warnings: [] };
  const write = !dryRun;
  const resolve = (target: string) => path.resolve(baseDir, target);
  const done = (message: string) => report.applied.push(dryRun ? `would set ${message}` : message);

  const { student } = profile;
  if (student) {
    const saved = getStudentProfile();
    const next = studentSchema.parse({ ...saved, ...student });
    if (same(saved, next)) report.skipped.push('student: unchanged');
    else {
      if (write) writeSetting(STUDENT_KEY, next);
      done(`student: ${[next.name, next.major].filter(Boolean).join(', ') || 'saved'}`);
    }
    if (student.timeZone) {
      const zone = validZone(student.timeZone);
      if (!zone) report.warnings.push(`student.timeZone "${student.timeZone}" is not an IANA time zone; .env was left alone.`);
      else if (readEnvValue('APER_TIME_ZONE') === zone) report.skipped.push(`time zone: already ${zone}`);
      else {
        if (write) setEnvValue('APER_TIME_ZONE', zone, '# Time zone for deadlines, day boundaries, and event times.');
        done(`time zone: ${zone} in .env`);
        if (write) report.warnings.push('Time zone saved to .env; run ./stop.sh && ./start.sh to apply it.');
      }
    }
  }

  if (profile.appearance || student?.name) {
    const current = getAppearance();
    let patch: unknown = profile.appearance ?? {};
    // profileSchema already checked `appearance` against the appearance schema.
    const greeting = profile.appearance?.greeting as { name?: string } | undefined;
    // The greeting uses a first name unless the profile or the app already set one.
    if (student?.name && !greeting?.name && !current.greeting.name)
      patch = deepMerge(patch, { greeting: { name: student.name.split(/\s+/)[0] } });
    const next = appearanceSchema.parse(deepMerge(current, patch));
    if (same(current, next)) report.skipped.push('appearance: unchanged');
    else {
      if (write) saveAppearance(next);
      done(`appearance${next.greeting.name ? ` (greeting name "${next.greeting.name}")` : ''}`);
    }
  }

  if (profile.careers) {
    const current = getCareerProfile();
    const next = { ...current, ...profile.careers };
    if (same(current, next)) report.skipped.push('careers: unchanged');
    else {
      if (write) {
        saveCareerProfile(next);
        rescoreHandshake();
      }
      done(`careers: ${next.interests.length} interests, ${next.excludes.length} phrases left out`);
    }
  } else if (student?.major && !getCareerProfile().interests.length)
    report.warnings.push('No careers.interests: Handshake events rank by Handshake and event type until you add some.');

  if (profile.study) {
    const current = getStudyPrefs();
    const next = studyPrefsSchema.parse(deepMerge(current, profile.study));
    if (same(current, next)) report.skipped.push('study: unchanged');
    else {
      if (write) saveStudyPrefs(next);
      done('study preferences');
    }
  }

  if (profile.planner) {
    const raw = typeof profile.planner === 'string'
      ? JSON.parse(fs.readFileSync(resolve(profile.planner), 'utf8'))
      : profile.planner;
    const file = plannerFileSchema.parse(raw);
    if (same(getPlannerFile(), file)) report.skipped.push('planner: already imported');
    else if (write) {
      const { keptSaved } = importPlannerFile(file);
      done(`planner: "${file.program}"${keptSaved ? ' (your newer saved plan was kept)' : ''}`);
    } else done(`planner: "${file.program}"`);
  }

  // The hub this profile imports; a dry run checks studyZone entries against it.
  let hubCourses: Array<{ id: string; code: string }> | undefined;
  if (profile.studyHub) {
    const target = resolve(profile.studyHub);
    const preview = previewStudyHubPath(target);
    hubCourses = preview.courses;
    const codes = preview.courses.map((course) => course.code).join(', ');
    if (preview.current) report.skipped.push(`Study Hub: already imported (${codes})`);
    else {
      if (write) {
        importStudyHubPath(target);
        rebuildSearchIndex();
      }
      done(`Study Hub: ${codes}`);
    }
  }

  if (profile.courses?.length) await applyCourses(profile.courses, { resolve, write, report, done, hubCourses });
  else if (student && !profile.courses) report.skipped.push('courses: none in the profile');

  if (profile.groqApiKey) {
    if (!isGroqKey(profile.groqApiKey)) report.warnings.push('groqApiKey does not look like a Groq key (gsk_…); .env was left alone.');
    else if (readEnvValue('GROQ_API_KEY') === profile.groqApiKey.trim()) report.skipped.push('Groq key: unchanged');
    else {
      if (write) saveGroqKey(profile.groqApiKey);
      done('Groq key in .env');
    }
  }

  return report;
}

async function applyCourses(
  entries: ProfileCourse[],
  ctx: {
    resolve: (target: string) => string;
    write: boolean;
    report: ApplyReport;
    done: (message: string) => void;
    /** courses of the hub this profile imports (already imported unless dry run) */
    hubCourses?: Array<{ id: string; code: string }>;
  },
) {
  const { write, report, done } = ctx;
  const canvas = currentCanvasCourses();
  const state = getCalculatorState();
  let credits = state.credits;
  let cutoffs = state.cutoffs;
  const hubCourses = ctx.hubCourses ?? loadStudyHub()?.courses ?? [];
  let zone = getStudyZone(hubCourses.map((course) => course.id));
  const zoneBefore = [...zone];
  let gradeCourses: GradeCourse[] | null = null;

  for (const entry of entries) {
    const label = entry.code;
    if (entry.studyZone != null) {
      const key = courseKey(entry.code);
      const hubCourse = hubCourses.find((course) =>
        key ? courseKey(course.code) === key : course.code.toLowerCase() === entry.code.toLowerCase(),
      );
      if (!hubCourse) report.skipped.push(`${label}: studyZone needs a Study Hub course with this code`);
      else if (entry.studyZone && !zone.includes(hubCourse.id)) zone = [...zone, hubCourse.id];
      else if (!entry.studyZone) zone = zone.filter((id) => id !== hubCourse.id);
    }

    const wantsCanvas = entry.alias != null || entry.credits != null || entry.cutoffs != null || entry.syllabus != null;
    if (!wantsCanvas) continue;
    const course = matchCourse(entry.code, canvas);
    if (!course) {
      report.skipped.push(`${label}: no current Canvas course with this code yet (run pnpm sync, then apply again)`);
      continue;
    }
    const id = String(course.id);
    const name = `${label} (Canvas ${course.code ?? course.name})`;

    if (entry.alias != null && entry.alias !== course.alias) {
      if (write)
        getDb().sqlite.prepare(`UPDATE courses SET local_alias=? WHERE id=?`).run(entry.alias, course.id);
      done(`${name}: alias "${entry.alias}"`);
    }
    if (entry.credits != null && credits[id] !== entry.credits) {
      credits = { ...credits, [id]: entry.credits };
      done(`${name}: ${entry.credits} credit hours`);
    }
    if (entry.cutoffs && !same(cutoffs[id], entry.cutoffs)) {
      cutoffs = { ...cutoffs, [id]: entry.cutoffs };
      done(`${name}: cutoffs ${entry.cutoffs.join('/')}`);
    }
    if (entry.syllabus) {
      gradeCourses ??= loadGradeCourses();
      await applySyllabus(entry.syllabus, course.id, name, gradeCourses, ctx);
    }
  }

  if (credits !== state.credits || cutoffs !== state.cutoffs)
    if (write) saveCalculatorState({ ...getCalculatorState(), credits, cutoffs });
  if (!same(zone, zoneBefore)) {
    if (write) saveStudyZone(zone);
    done(`Study zone: ${zone.length ? zone.join(', ') : 'empty'}`);
  }
}

async function applySyllabus(
  syllabus: string,
  courseId: number,
  name: string,
  gradeCourses: GradeCourse[],
  { resolve, write, report, done }: { resolve: (target: string) => string; write: boolean; report: ApplyReport; done: (message: string) => void },
) {
  const course = gradeCourses.find((entry) => entry.id === courseId);
  if (!course) {
    report.skipped.push(`${name}: syllabus skipped, the class has no gradeable Canvas work yet`);
    return;
  }
  const filePath = resolve(syllabus);
  const isFile = syllabus.length < 1024 && !syllabus.includes('\n') && fs.existsSync(filePath);
  let text: string;
  let source: string;
  try {
    if (isFile) {
      text = await syllabusTextFromFile(new Uint8Array(fs.readFileSync(filePath)), path.basename(filePath));
      source = path.basename(filePath);
    } else if (syllabus.length >= 20 && /\s/.test(syllabus)) {
      text = syllabus;
      source = 'Pasted text';
    } else {
      report.warnings.push(`${name}: syllabus "${syllabus}" is not a file next to the profile, nor pasted text.`);
      return;
    }
  } catch (error) {
    if (error instanceof SyllabusTextError) {
      report.warnings.push(`${name}: ${error.message}`);
      return;
    }
    throw error;
  }
  const existing = getGradePolicy(courseId);
  if (existing?.source === source) {
    report.skipped.push(`${name}: grading rules from ${source} already adopted (edit them under Grades)`);
    return;
  }
  const { policy, report: found } = buildPolicy(parseSyllabus(text), course, source);
  if (!policy) {
    report.warnings.push(`${name}: no grading breakdown found in ${source}; paste the section with the percentages instead.`);
    return;
  }
  if (found.unmatched.length) {
    report.warnings.push(
      `${name}: not adopted; no Canvas work matched ${found.unmatched.join(', ')}. Finish it under Grades → Read the syllabus.`,
    );
    return;
  }
  if (Math.abs(found.total - 100) > 0.01)
    report.warnings.push(`${name}: the syllabus weights add up to ${+found.total.toFixed(2)}%, not 100%.`);
  if (write) saveGradePolicy(courseId, policy);
  done(`${name}: graded by ${source} (${policy.components.map((part) => `${part.name} ${part.weight}%`).join(', ')})`);
}
