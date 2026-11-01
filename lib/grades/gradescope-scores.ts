import { z } from 'zod';
import { readSetting, writeSetting } from '@/lib/db/settings';

// Gradescope's view of Canvas assignments it was matched to, kept apart from
// the Canvas submission row. Canvas sync rewrites that row wholesale, so the
// grade calculator reads Gradescope's score from here and never loses it when
// Canvas has not posted its own.

export const gradescopeObservationSchema = z.object({
  score: z.number().nullable(),
  possible: z.number().nullable(),
  observedAt: z.string(),
  url: z.string().nullable(),
  title: z.string(),
  gradescopeId: z.string(),
});
export type GradescopeObservation = z.infer<typeof gradescopeObservationSchema>;

const KEY = 'gradescope-scores';
const ledgerSchema = z.record(z.string(), gradescopeObservationSchema);

/** Canvas assignment id → latest Gradescope observation. */
export function readGradescopeScores(): Record<string, GradescopeObservation> {
  return readSetting(KEY, ledgerSchema, {});
}

export function recordGradescopeScore(
  canvasAssignmentId: number,
  observation: GradescopeObservation,
) {
  writeSetting(KEY, {
    ...readGradescopeScores(),
    [canvasAssignmentId]: observation,
  });
}
