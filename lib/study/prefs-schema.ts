import { z } from 'zod';

/**
 * Study preferences (settings key `study-prefs`): scheduler, daily limits,
 * per-course options, saved custom sessions, and the focus timer. Pure, so
 * client views can parse and read them; `prefs.ts` loads and saves them.
 * Out-of-range numbers are clamped rather than rejected.
 */

export const ITEM_KINDS = [
  'card',
  'quick',
  'practice',
  'parsons',
  'mine',
] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

/** A finite number clamped to [min, max] (rounded when `int`), with a default. */
const clamped = (min: number, max: number, fallback: number, int = true) =>
  z
    .number()
    .transform((value) =>
      Math.min(max, Math.max(min, int ? Math.round(value) : value)),
    )
    .default(fallback);

/** Learning steps in whole minutes (1 minute to 1 day), at most 10. */
const steps = (fallback: number[]) =>
  z
    .array(z.number())
    .transform((list) =>
      list
        .slice(0, 10)
        .map((minutes) => Math.min(1440, Math.max(1, Math.round(minutes)))),
    )
    .default(() => [...fallback]);

const kindEnum = z.enum(ITEM_KINDS);

export const customSessionSchema = z.object({
  /** [] = every course included in review */
  cids: z
    .array(z.string().max(64))
    .max(50)
    .default(() => []),
  /** inclusive week-number range; null = all weeks that have started */
  weeks: z
    .tuple([z.number().int(), z.number().int()])
    .transform(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number])
    .nullable()
    .default(null),
  kinds: z
    .array(kindEnum)
    .transform((kinds) => [...new Set(kinds)])
    .default(() => [...ITEM_KINDS]),
  /** weak = lapses ≥ 1, retrievability < 0.85, or last legacy answer wrong */
  pick: z.enum(['due', 'new', 'weak', 'all', 'ahead']).default('due'),
  /** for `ahead` */
  aheadDays: clamped(1, 60, 3),
  /** 0 = no limit */
  limit: clamped(0, 2000, 0),
  order: z.enum(['mixed', 'week']).default('mixed'),
  /** false = practice only, schedule untouched */
  reschedule: z.boolean().default(true),
});

export type CustomSession = z.output<typeof customSessionSchema>;

const sourcesSchema = z
  .object({
    card: z.boolean().default(true),
    quick: z.boolean().default(true),
    practice: z.boolean().default(true),
    parsons: z.boolean().default(true),
    mine: z.boolean().default(true),
  })
  .prefault({});

const coursePrefsSchema = z.object({
  /** include in Daily review */
  review: z.boolean().default(true),
  /** Notes tab mode */
  notes: z.enum(['key', 'full']).default('key'),
  /** week tab ids to hide */
  hiddenTabs: z
    .array(z.string().max(64))
    .max(40)
    .default(() => []),
  /** week tab opened without ?tab= (null = lecture) */
  defaultTab: z.string().max(64).nullable().default(null),
  /** overrides of the global sources */
  sources: z
    .object({
      card: z.boolean().optional(),
      quick: z.boolean().optional(),
      practice: z.boolean().optional(),
      parsons: z.boolean().optional(),
      mine: z.boolean().optional(),
    })
    .optional(),
});

export type CoursePrefs = z.output<typeof coursePrefsSchema>;

export const studyPrefsSchema = z.object({
  /** FSRS request_retention */
  retention: clamped(0.7, 0.97, 0.9, false),
  /** days */
  maxInterval: clamped(1, 36500, 180),
  /** minutes */
  learningSteps: steps([1, 10]),
  /** minutes */
  relearningSteps: steps([10]),
  /** per course */
  newPerDay: clamped(0, 9999, 15),
  /** per course */
  reviewsPerDay: clamped(0, 99999, 150),
  /** hour 0–23 a study day starts at */
  dayStartsAt: clamped(0, 23, 4),
  /** current-first = newest started week first */
  newOrder: z
    .enum(['current-first', 'oldest-first', 'random'])
    .default('current-first'),
  /** mix courses/weeks/kinds in sessions */
  interleave: z.boolean().default(true),
  /** shuffle mc options in review (why[] permuted with them) */
  shuffleChoices: z.boolean().default(true),
  showIntervals: z.boolean().default(true),
  sources: sourcesSchema,
  /** per course id; a missing entry = defaults */
  courses: z.record(z.string().max(64), coursePrefsSchema).default(() => ({})),
  /** saved custom sessions, at most 30 */
  presets: z
    .array(
      customSessionSchema.extend({
        id: z.string().min(1).max(64),
        name: z.string().trim().min(1).max(80),
      }),
    )
    .transform((presets) => presets.slice(0, 30))
    .default(() => []),
  /** minutes */
  timer: z
    .object({
      focus: clamped(1, 180, 25),
      short: clamped(1, 60, 5),
      long: clamped(1, 120, 15),
      longEvery: clamped(1, 12, 4),
      autoBreak: z.boolean().default(false),
      sound: z.boolean().default(true),
    })
    .prefault({}),
});

export type StudyPrefs = z.output<typeof studyPrefsSchema>;

export const DEFAULT_STUDY_PREFS: StudyPrefs = studyPrefsSchema.parse({});

/** A course's options, defaults filled in (a fresh object when the course has none). */
export const coursePrefs = (prefs: StudyPrefs, cid: string): CoursePrefs =>
  prefs.courses[cid] ?? coursePrefsSchema.parse({});

/** Global item sources with the course's overrides applied. */
export function effectiveSources(
  prefs: StudyPrefs,
  cid: string,
): Record<ItemKind, boolean> {
  const sources = { ...prefs.sources };
  const overrides = prefs.courses[cid]?.sources ?? {};
  for (const kind of ITEM_KINDS) {
    const value = overrides[kind];
    if (value !== undefined) sources[kind] = value;
  }
  return sources;
}
