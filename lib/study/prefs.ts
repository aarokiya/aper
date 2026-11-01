import { readSetting, writeSetting } from '@/lib/db/settings';
import {
  DEFAULT_STUDY_PREFS,
  studyPrefsSchema,
  type StudyPrefs,
} from './prefs-schema';

/**
 * Server side of the study preferences (settings key `study-prefs`). The
 * schema and the pure helpers live in `prefs-schema.ts` so client views can
 * import them without the database.
 */
export {
  coursePrefs,
  DEFAULT_STUDY_PREFS,
  effectiveSources,
  studyPrefsSchema,
} from './prefs-schema';
export type {
  CoursePrefs,
  CustomSession,
  ItemKind,
  StudyPrefs,
} from './prefs-schema';

const STUDY_PREFS_KEY = 'study-prefs';

export function getStudyPrefs(): StudyPrefs {
  return readSetting(STUDY_PREFS_KEY, studyPrefsSchema, DEFAULT_STUDY_PREFS);
}

/** Validate (clamping numbers) and store; throws a ZodError for invalid input. */
export function saveStudyPrefs(input: unknown): StudyPrefs {
  const prefs = studyPrefsSchema.parse(input);
  writeSetting(STUDY_PREFS_KEY, prefs);
  return prefs;
}
