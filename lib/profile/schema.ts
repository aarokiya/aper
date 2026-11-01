import { z } from 'zod';
import { appearanceSchema } from '@/lib/appearance/schema';
import { careerProfileSchema } from '@/lib/handshake/relevance';
import { studyPrefsSchema } from '@/lib/study/prefs-schema';

/**
 * `aper.profile.json`: what a student (or their coding agent) self-reports to
 * personalize a fresh copy. Every section is optional; `pnpm profile:apply`
 * merges each one into its local store, so a partial profile never resets
 * settings it doesn't mention.
 */

const percent = z.number().min(0).max(100);

/** The student's own description, kept under the `student-profile` setting. */
export const studentSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional().describe('Full or preferred name; the first word becomes the greeting name.'),
    major: z.string().trim().min(1).max(120).optional().describe('Degree program, e.g. "BS Industrial Engineering".'),
    threads: z.array(z.string().trim().min(1).max(80)).max(6).optional().describe('Threads or concentrations.'),
    minors: z.array(z.string().trim().min(1).max(80)).max(6).optional(),
    classStanding: z
      .enum(['first-year', 'second-year', 'third-year', 'fourth-year', 'fifth-year-plus', 'graduate'])
      .optional(),
    catalogYear: z.string().trim().regex(/^\d{4}-\d{4}$/).optional().describe('Catalog year from Degree Works, e.g. "2026-2027".'),
    timeZone: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe('IANA time zone, e.g. "America/New_York"; written to .env as APER_TIME_ZONE (restart to apply).'),
  })
  .strict()
  .describe('Who the student is. Saved for reference; name and timeZone also configure the app.');
export type StudentProfile = z.output<typeof studentSchema>;

export const profileCourseSchema = z
  .object({
    code: z.string().trim().min(3).max(40).describe('Course code as on Canvas or the registrar, e.g. "ISYE 2027" or "ISYE-2027-A"; matched by department and number.'),
    alias: z.string().trim().min(1).max(80).optional().describe("Short name shown across the app instead of Canvas's code."),
    credits: z.number().min(0).max(12).optional().describe('Credit hours, for GPA.'),
    cutoffs: z.tuple([percent, percent, percent, percent]).optional().describe('Where A, B, C, and D start, e.g. [90, 80, 70, 60].'),
    syllabus: z
      .string()
      .trim()
      .min(1)
      .max(200_000)
      .optional()
      .describe('A syllabus file (PDF, HTML, or text; path relative to the profile) or its pasted grading section. Adopted as the grading rules only when every part matches Canvas work.'),
    studyZone: z.boolean().optional().describe("Whether the class sits in the rail's Study zone; needs a Study Hub course with this code."),
  })
  .strict();
export type ProfileCourse = z.output<typeof profileCourseSchema>;

/**
 * Validates a section against a store schema without keeping the parsed
 * value: the raw input is merged onto what is saved, so the store's
 * defaults never overwrite settings the profile leaves out.
 */
const partialOf = (schema: z.ZodType, label: string) =>
  z.record(z.string(), z.unknown()).superRefine((value, context) => {
    const result = schema.safeParse(value);
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({
          code: 'custom',
          path: issue.path as PropertyKey[] as (string | number)[],
          message: `${label}: ${issue.message}`,
        });
  });

export const profileSchema = z
  .object({
    $schema: z.string().optional(),
    student: studentSchema.optional(),
    appearance: partialOf(appearanceSchema, 'appearance').optional(),
    careers: careerProfileSchema
      .partial()
      .strict()
      .optional()
      .describe('Handshake ranking: interests to boost and phrases to leave out. Both start empty.'),
    study: partialOf(studyPrefsSchema, 'study').optional(),
    planner: z
      .union([z.string().trim().min(1), z.record(z.string(), z.unknown())])
      .optional()
      .describe('A planner file path (relative to the profile) or the planner file inline; see docs/planner-file.md.'),
    studyHub: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('A Study Hub path: a courses .json, a folder with courses.json, or a hub .html; see docs/study-hub-format.md.'),
    courses: z
      .array(profileCourseSchema)
      .max(20)
      .optional()
      .describe('Current classes. Entries that need Canvas (alias, credits, cutoffs, syllabus) apply after pnpm sync.'),
    groqApiKey: z.string().trim().min(1).optional().describe('Optional Groq key (gsk_…) for the AI features; written to .env.'),
  })
  .strict();
export type Profile = z.output<typeof profileSchema>;
