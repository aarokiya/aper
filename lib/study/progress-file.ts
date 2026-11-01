/**
 * The Study Hub's progress file: what its **Export progress** writes, what
 * **Import progress** reads, and what it bundles as `src/progress.json`
 * (`window.SEED_PROGRESS` in the built `index.html`). _aper reads and writes
 * the same format, so progress moves between the hub and _aper both ways.
 * Pure and isomorphic.
 */
import { normalizeState } from './model';
import type { StudyCourseState } from './types';

export const PROGRESS_FORMAT = 'gt-study-hub-progress';

export type StudyProgressFile = {
  format: typeof PROGRESS_FORMAT;
  version: 1;
  exportedAt: string;
  /** the hub's own light/dark choice; null follows the system */
  theme: 'light' | 'dark' | null;
  /** the course the hub opens to */
  course: string | null;
  /** newest change across courses (ms) */
  t: number;
  c: Record<string, StudyCourseState>;
};

export class ProgressFileError extends Error {}

/** A progress file for `states`, in the order given. */
export function buildProgressFile(
  states: Record<string, StudyCourseState>,
  {
    course = null,
    now = new Date(),
  }: { course?: string | null; now?: Date } = {},
): StudyProgressFile {
  return {
    format: PROGRESS_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    theme: null,
    course,
    t: Math.max(0, ...Object.values(states).map((state) => state.t)),
    c: states,
  };
}

/** `study-hub-progress-2026-10-02.json`, the hub's export name. */
export const progressFileName = (now = new Date()) => {
  const day = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return `study-hub-progress-${day}.json`;
};

/**
 * The courses in a parsed progress file that `known` has, normalized. Throws
 * with the hub's own wording when the file isn't a progress export or holds
 * none of these courses.
 */
export function readProgressFile(
  value: unknown,
  known: readonly string[],
): Record<string, StudyCourseState> {
  const file = value as Partial<StudyProgressFile> | null;
  if (
    !file ||
    typeof file !== 'object' ||
    file.format !== PROGRESS_FORMAT ||
    !file.c ||
    typeof file.c !== 'object' ||
    Array.isArray(file.c)
  )
    throw new ProgressFileError(
      'That file is not a study hub progress export.',
    );
  const courses: Record<string, StudyCourseState> = {};
  for (const id of known)
    if (Object.hasOwn(file.c, id)) courses[id] = normalizeState(file.c[id]);
  if (!Object.keys(courses).length)
    throw new ProgressFileError('That file has no progress for these courses.');
  return courses;
}

/**
 * The hub's seed rule for bundled progress: per course, the copy with the
 * larger `t` wins, so local work is never overwritten by an older snapshot.
 * Returns the seed's courses that should replace the current ones.
 */
export function newerProgress(
  current: Record<string, StudyCourseState>,
  seed: Record<string, StudyCourseState>,
): Record<string, StudyCourseState> {
  return Object.fromEntries(
    Object.entries(seed).filter(
      ([id, state]) => state.t > (current[id]?.t ?? 0),
    ),
  );
}
