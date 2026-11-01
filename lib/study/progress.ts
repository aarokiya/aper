import { z } from 'zod';
import { readSetting, writeSetting } from '@/lib/db/settings';
import { blankState, normalizeState } from './model';
import { newerProgress } from './progress-file';
import type { StudyCourseState } from './types';

const stateSchema = z
  .record(z.string(), z.unknown())
  .transform((value) => normalizeState(value));

const progressKey = (courseId: string) => `study-progress:${courseId}`;

/** Local study progress for one Study Hub course (never touched by sync). */
export function getStudyProgress(courseId: string): StudyCourseState {
  return readSetting(progressKey(courseId), stateSchema, blankState());
}

export function saveStudyProgress(
  courseId: string,
  value: unknown,
): StudyCourseState {
  const state = normalizeState(value);
  writeSetting(progressKey(courseId), state);
  return state;
}

/** Blank progress stamped now, so it wins over every older copy (including a browser's). */
export function resetStudyProgress(courseId: string) {
  writeSetting(progressKey(courseId), { ...blankState(), t: Date.now() });
}

/** Progress for each listed course, in order. */
export function getAllStudyProgress(courseIds: readonly string[]) {
  return Object.fromEntries(
    courseIds.map((id) => [id, getStudyProgress(id)] as const),
  );
}

/**
 * **Import progress**: replaces each course's progress with the file's,
 * stamped `now` so it is the newest copy everywhere (the hub does the same).
 */
export function replaceStudyProgress(
  courses: Record<string, StudyCourseState>,
  now = Date.now(),
) {
  return Object.fromEntries(
    Object.entries(courses).map(
      ([id, state]) => [id, saveStudyProgress(id, { ...state, t: now })] as const,
    ),
  );
}

/**
 * Progress bundled with a Study Hub (`src/progress.json`): per course, the
 * newer copy wins, so saved work is never replaced by an older snapshot.
 * Returns the course ids it replaced.
 */
export function seedHubProgress(seed: Record<string, StudyCourseState>) {
  const newer = newerProgress(getAllStudyProgress(Object.keys(seed)), seed);
  for (const [id, state] of Object.entries(newer)) saveStudyProgress(id, state);
  return Object.keys(newer);
}
