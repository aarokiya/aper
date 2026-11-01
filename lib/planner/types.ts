import { z } from 'zod';

/**
 * Course planner data. A planner file holds the degree requirements (from
 * Degree Works and the catalog) and a starting plan; you import it once.
 * The plan you edit is a separate copy. Both live in the local `settings`
 * table, never in the repository.
 */

/**
 * T transfer credit, C completed at Georgia Tech, IP in progress,
 * R recommended for next semester, ALT alternative, '' planned.
 */
export const PLAN_TAGS = ['', 'R', 'ALT', 'IP', 'C', 'T'] as const;
export type PlanTag = (typeof PLAN_TAGS)[number];

export const TAG_LABELS: Record<PlanTag, string> = {
  '': 'Planned',
  R: 'Recommended for next semester',
  ALT: 'Alternative',
  IP: 'In progress',
  C: 'Completed at Georgia Tech',
  T: 'Transfer credit',
};

const rowSchema = z.object({
  /** Course, e.g. "CS 1332 Data Structures & Algorithms" or "Thread Hours" */
  n: z.string().max(200),
  /** Credit hours */
  h: z.number().min(0).max(30),
  k: z.enum(PLAN_TAGS).default(''),
  /** Requirement the row was added for; counts when the name matches none */
  r: z.string().max(40).optional(),
});

/** Term ids: S27 Spring 2027, U27 Summer 2027, F27 Fall 2027. */
export const TERM_ID = /^([SUF])(\d\d)$/;

/**
 * A term's place in time: Spring, then Summer, then Fall within a calendar
 * year. -1 for an id that isn't a term id.
 */
export function termOrder(id: string) {
  const match = TERM_ID.exec(id);
  return match ? Number(match[2]) * 3 + 'SUF'.indexOf(match[1]) : -1;
}

const termSchema = z.object({
  /** F26 = Fall 2026, S27 = Spring 2027, U27 = Summer 2027 */
  id: z
    .string()
    .regex(TERM_ID, 'Term ids look like F26, S27, or U27 (U is summer).'),
  label: z.string().min(1).max(40),
  rows: z.array(rowSchema).max(40),
});

export const planSchema = z
  .object({
    /** Last change, in ms; the newer copy wins between browser and database */
    t: z.number().nonnegative(),
    title: z.string().max(120),
    hours: z.number().min(0).max(400),
    /** The line under the title */
    note: z.string().max(300),
    name: z.string().max(120),
    /** Printed date; blank prints the export day */
    date: z.string().max(40),
    /** "Assessment By" line */
    by: z.string().max(200),
    /**
     * In time order. An academic year is a fall, the spring after it, and
     * that summer; summers are optional.
     */
    terms: z.array(termSchema).min(1).max(24),
    /** Transfer credit that counts toward the degree */
    xfer: z.array(rowSchema).max(80),
    /** Credit that doesn't count toward the degree */
    extra: z.array(rowSchema).max(80),
    /** Degree notes, one line each; **bold**, URLs print in italics */
    notes: z.array(z.string().max(500)).max(60),
  })
  .superRefine((plan, ctx) => {
    const ids = plan.terms.map((term) => term.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Term ids must be unique.' });
    for (const [index, term] of plan.terms.entries())
      if (index && termOrder(term.id) < termOrder(plan.terms[index - 1].id))
        ctx.addIssue({
          code: 'custom',
          path: ['terms', index, 'id'],
          message: `Terms must be in time order: ${term.id} belongs before ${plan.terms[index - 1].id}.`,
        });
  });

const requirementSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, 'Requirement ids use a-z, 0-9, and _.'),
  label: z.string().min(1).max(200),
  /** Course codes that count, e.g. "CS 1332" */
  opts: z.array(z.string().max(20)).max(40).default([]),
  /** Lowercase phrases that count, for placeholder rows like "Social Science Elective" */
  keys: z.array(z.string().max(60)).max(10).default([]),
  /** Courses needed (default 1) */
  n: z.number().int().positive().max(10).optional(),
  /** Hours needed, instead of a course count */
  hrs: z.number().positive().max(60).optional(),
  /** Lab-science sequence: met by any allowable pair */
  seq: z.boolean().optional(),
  /** The row that Add creates */
  name: z.string().max(200).optional(),
  h: z.number().min(0).max(30).optional(),
  note: z.string().max(400).optional(),
});

const areaSchema = z.object({
  h: z.string().min(1).max(120),
  /** Courses double-count here (Georgia Legislative Requirements, Honors) */
  share: z.boolean().optional(),
  /** Flag courses planned in or after the term where earned hours reach 90 */
  by90: z.boolean().optional(),
  note: z.string().max(400).optional(),
  reqs: z.array(requirementSchema).min(1).max(40),
});

export const plannerFileSchema = z
  .object({
    program: z.string().max(200),
    catalog: z.string().max(40),
    /** Degree Works audit date, YYYY-MM-DD */
    audit: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'audit is a YYYY-MM-DD date.'),
    /** Allowable lab-science sequences */
    pairs: z
      .array(z.tuple([z.string(), z.string()]))
      .max(60)
      .default([]),
    areas: z.array(areaSchema).max(20),
    plan: planSchema,
  })
  .superRefine((file, ctx) => {
    const ids = file.areas.flatMap((area) => area.reqs.map((req) => req.id));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Requirement ids must be unique.',
      });
    const known = new Set(ids);
    for (const row of [
      ...file.plan.terms.flatMap((term) => term.rows),
      ...file.plan.xfer,
      ...file.plan.extra,
    ])
      if (row.r && !known.has(row.r))
        ctx.addIssue({
          code: 'custom',
          message: `"${row.n}" points at an unknown requirement, ${row.r}.`,
        });
  });

export type Plan = z.output<typeof planSchema>;
export type PlanRow = Plan['xfer'][number];
export type PlanTerm = Plan['terms'][number];
export type PlannerFile = z.output<typeof plannerFileSchema>;
/** Everything in the planner file except the starting plan. */
export type PlannerRules = Omit<PlannerFile, 'plan'>;
export type Requirement = PlannerRules['areas'][number]['reqs'][number];
