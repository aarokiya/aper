import { readSetting, writeSetting } from '@/lib/db/settings';
import {
  planSchema,
  plannerFileSchema,
  type Plan,
  type PlannerFile,
} from './types';

/**
 * The course planner's local state: the imported planner file
 * (`planner-file`) and the plan you edit (`planner-plan`). Sync never
 * touches either.
 */
const FILE_KEY = 'planner-file';
const PLAN_KEY = 'planner-plan';

/** The imported planner file (requirements and the starting plan), if any. */
export function getPlannerFile(): PlannerFile | null {
  return readSetting(FILE_KEY, plannerFileSchema.nullable(), null);
}

/** Your plan: the saved copy, or the starting plan before your first change. */
export function getPlan(file: PlannerFile): Plan {
  return readSetting(PLAN_KEY, planSchema.nullable(), null) ?? file.plan;
}

/** Saves your plan. Throws a ZodError when the value isn't a plan. */
export function savePlan(value: unknown): Plan {
  const plan = planSchema.parse(value);
  writeSetting(PLAN_KEY, plan);
  return plan;
}

/** Puts the starting plan back, stamped now so it beats older browser copies. */
export function resetPlan(file: PlannerFile): Plan {
  const plan = { ...file.plan, t: Date.now() };
  writeSetting(PLAN_KEY, plan);
  return plan;
}

/**
 * Imports a planner file. Your saved plan stays when it is at least as new
 * as the file's starting plan (the Study Hub's rule for progress), so
 * importing an updated file never discards your changes. Throws a ZodError
 * when the file isn't valid.
 */
export function importPlannerFile(value: unknown) {
  const file = plannerFileSchema.parse(value);
  writeSetting(FILE_KEY, file);
  const saved = readSetting(PLAN_KEY, planSchema.nullable(), null);
  const plan = saved && saved.t >= file.plan.t ? saved : file.plan;
  if (plan === file.plan) writeSetting(PLAN_KEY, plan);
  return { file, plan, keptSaved: plan === saved };
}
