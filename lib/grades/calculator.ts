// Pure grade engine shared by the server loader and the client calculator.
// "current" counts released scores only; "projected" adds what-ifs and the
// ungraded-work assumption. Categories without usable scores are left out and
// the remaining weights are rescaled, which matches Canvas's current score.
//
// Canvas and Gradescope are merged per assignment by the loader: Canvas's
// score counts when it has one, otherwise Gradescope's (scaled to Canvas
// points), and Gradescope-only assignments count in an inferred category that
// the user can override (`CalculatorState.placement`). A course with a
// syllabus policy is graded by the syllabus's components instead of Canvas's
// groups (see ./policy).
import { resolvePolicy, type GradePolicy } from '@/lib/grades/policy';

export type GradeSource = 'canvas' | 'gradescope' | 'both';

export type GradescopeScore = {
  score: number | null;
  possible: number | null;
  url: string | null;
};

export type GradeItem = {
  id: number;
  sourceId: string;
  title: string;
  possible: number;
  /** Points possible copied from similar work because Gradescope has not posted it yet. */
  possibleEstimated: boolean;
  /** The score that counts, in this item's points: Canvas's when it has one, else Gradescope's. */
  score: number | null;
  scoreSource: 'canvas' | 'gradescope' | null;
  /** Where the assignment exists. */
  source: GradeSource;
  /** Canvas's released score in Canvas points (null for Gradescope-only items). */
  canvasScore: number | null;
  /** Gradescope's own score and points, when Gradescope has the assignment. */
  gradescope: GradescopeScore | null;
  sourceUrl: string | null;
  /** Gradescope-only items: the category key the loader chose, and whether the guess is confident. */
  placement: { inferred: string; confident: boolean } | null;
};

/** How a category turns its items into a percentage. */
export type CategoryRule =
  | { kind: 'points' }
  | { kind: 'equal' }
  | { kind: 'ranked'; weights: number[] }
  | {
      kind: 'pool';
      cap: number;
      parts: Array<{ items: number[]; scale: number; choice: string | null }>;
    };

export type GradeCategory = {
  /** Canvas assignment group id; null for Canvas items without a group; 'gradescope' for the fallback bucket; `policy:<key>` for a syllabus component. */
  id: number | null | 'gradescope' | `policy:${string}`;
  name: string;
  weight: number;
  dropLowest: number;
  dropHighest: number;
  neverDrop: string[];
  items: GradeItem[];
  /** points when absent */
  rule?: CategoryRule;
  /** syllabus components: the line they came from */
  quote?: string | null;
};

/** Where the server can read a course's syllabus from. */
export type SyllabusSource =
  | { kind: 'canvas' }
  | { kind: 'file'; id: number; name: string };

export type GradeCourse = {
  id: number;
  code: string;
  name: string;
  /** 'gradescope' for a Gradescope course with no matching Canvas class. */
  origin: 'canvas' | 'gradescope';
  weighted: boolean;
  canvasScore: number | null;
  categories: GradeCategory[];
  /** the syllabus's grading rules, when the user adopted them */
  policy: GradePolicy | null;
  syllabi: SyllabusSource[];
};

export type Cutoffs = [number, number, number, number];

export type CalculatorState = {
  assume: number;
  /** Assignment id → hypothetical points. */
  whatIf: Record<string, number>;
  /** Category key → hypothetical percentage for categories with no items yet. */
  categoryWhatIf: Record<string, number>;
  credits: Record<string, number>;
  cutoffs: Record<string, Cutoffs>;
  open: Record<string, boolean>;
  /** Gradescope-only assignment id → category key it counts toward, or LEAVE_OUT. */
  placement: Record<string, string>;
};

export type Mode = 'current' | 'projected';
export type Letter = 'A' | 'B' | 'C' | 'D' | 'F';

export const DEFAULT_CREDITS = 3;
export const DEFAULT_CUTOFFS: Cutoffs = [90, 80, 70, 60];
export const DEFAULT_CALCULATOR_STATE: CalculatorState = {
  assume: 90,
  whatIf: {},
  categoryWhatIf: {},
  credits: {},
  cutoffs: {},
  open: {},
  placement: {},
};
/** Placement value for a Gradescope-only item the user chose not to count. */
export const LEAVE_OUT = 'exclude';
const LETTER_POINTS: Record<Letter, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

export function categoryKey(
  courseId: number,
  category: Pick<GradeCategory, 'id'>,
) {
  return `${courseId}:${category.id ?? 'none'}`;
}

export type ArrangedCourse = {
  categories: GradeCategory[];
  leftOut: GradeItem[];
};
const arranged = new WeakMap<
  GradeCourse,
  { placement: CalculatorState['placement']; value: ArrangedCourse }
>();

/**
 * The course's categories after the user's placement overrides: Gradescope-only
 * items move to the category they chose, and items they left out are set aside.
 * Memoized per course for the same `placement` object.
 */
export function arrangeCourse(
  course: GradeCourse,
  state: CalculatorState,
): ArrangedCourse {
  const cached = arranged.get(course);
  if (cached && cached.placement === state.placement) return cached.value;
  let value: ArrangedCourse = { categories: course.categories, leftOut: [] };
  const overridden = course.categories.some((category) =>
    category.items.some(
      (item) => item.placement && state.placement[String(item.id)] != null,
    ),
  );
  if (overridden) {
    const byKey = new Map(
      course.categories.map((category) => [
        categoryKey(course.id, category),
        { ...category, items: [] as GradeItem[] },
      ]),
    );
    const leftOut: GradeItem[] = [];
    for (const category of course.categories)
      for (const item of category.items) {
        const chosen = item.placement
          ? state.placement[String(item.id)]
          : undefined;
        if (chosen === LEAVE_OUT) leftOut.push(item);
        else
          (
            byKey.get(chosen ?? '') ??
            byKey.get(categoryKey(course.id, category))!
          ).items.push(item);
      }
    value = { categories: [...byKey.values()], leftOut };
  }
  arranged.set(course, { placement: state.placement, value });
  return value;
}

export type CourseView = ArrangedCourse & {
  /** policy courses: assignments no syllabus component counts */
  uncounted: GradeItem[];
};
const views = new WeakMap<
  GradeCourse,
  { placement: CalculatorState['placement']; value: CourseView }
>();

/**
 * The categories a course is graded by: its syllabus components when it has a
 * policy (drawn from the arranged Canvas groups), otherwise the arranged
 * Canvas groups. Memoized like `arrangeCourse`.
 */
export function courseCategories(
  course: GradeCourse,
  state: CalculatorState,
): CourseView {
  const base = arrangeCourse(course, state);
  if (!course.policy) return { ...base, uncounted: [] };
  const cached = views.get(course);
  if (cached && cached.placement === state.placement) return cached.value;
  const { parts, counted } = resolvePolicy(course.policy, base.categories);
  const neverDropOf = new Map(
    base.categories.map((category) => [category.id, category.neverDrop]),
  );
  const categories = course.policy.components.map(
    (component, index): GradeCategory => ({
      id: `policy:${component.key}`,
      name: component.name,
      weight: component.weight,
      dropLowest: component.dropLowest,
      dropHighest: 0,
      neverDrop: [
        ...new Set(
          component.sources.flatMap((source) =>
            source.group == null ? [] : (neverDropOf.get(source.group) ?? []),
          ),
        ),
      ],
      items: parts[index].flatMap((part) => part.items),
      rule:
        component.scoring.kind === 'pool'
          ? {
              kind: 'pool',
              cap: component.scoring.cap,
              parts: parts[index].map((part) => ({
                items: part.items.map((item) => item.id),
                scale: part.source.scale ?? 1,
                choice: part.source.choice ?? null,
              })),
            }
          : component.scoring,
      quote: component.quote,
    }),
  );
  const value: CourseView = {
    categories,
    leftOut: base.leftOut,
    uncounted: base.categories
      .flatMap((category) => category.items)
      .filter((item) => !counted.has(item.id)),
  };
  views.set(course, { placement: state.placement, value });
  return value;
}

export type CategoryResult = {
  percent: number | null;
  earned: number;
  possible: number;
  dropped: Set<number>;
};

type Row = { id: number; sourceId: string; earned: number; possible: number };

export function categoryResult(
  course: GradeCourse,
  category: GradeCategory,
  mode: Mode,
  state: CalculatorState,
  assume = state.assume,
): CategoryResult {
  const rule = category.rule ?? { kind: 'points' };
  if (rule.kind === 'pool')
    return poolResult(course, category, rule, mode, state, assume);
  let rows: Row[] = [];
  for (const item of category.items) {
    let earned = item.score;
    if (earned == null) {
      if (mode === 'current' || item.possible <= 0) continue;
      earned = state.whatIf[String(item.id)] ?? (assume / 100) * item.possible;
    }
    rows.push({
      id: item.id,
      sourceId: item.sourceId,
      earned,
      possible: item.possible,
    });
  }

  const dropped = new Set<number>();
  const dropFrom = (count: number, order: (a: Row, b: Row) => number) => {
    if (count <= 0) return;
    const candidates = rows
      .filter(
        (row) => row.possible > 0 && !category.neverDrop.includes(row.sourceId),
      )
      .sort(order)
      .slice(0, Math.min(count, rows.length - 1));
    for (const row of candidates) dropped.add(row.id);
    rows = rows.filter((row) => !dropped.has(row.id));
  };
  dropFrom(
    category.dropLowest,
    (a, b) => a.earned / a.possible - b.earned / b.possible,
  );
  dropFrom(
    category.dropHighest,
    (a, b) => b.earned / b.possible - a.earned / a.possible,
  );

  if (!rows.length) {
    if (mode === 'projected' && category.items.length === 0) {
      const percent =
        state.categoryWhatIf[categoryKey(course.id, category)] ?? assume;
      return { percent, earned: 0, possible: 0, dropped };
    }
    return { percent: null, earned: 0, possible: 0, dropped };
  }
  const earned = rows.reduce((sum, row) => sum + row.earned, 0);
  const possible = rows.reduce((sum, row) => sum + row.possible, 0);
  if (rule.kind === 'points')
    return {
      percent: possible > 0 ? (100 * earned) / possible : null,
      earned,
      possible,
      dropped,
    };
  const scored = rows
    .filter((row) => row.possible > 0)
    .map((row) => ({ id: row.id, percent: (100 * row.earned) / row.possible }))
    .sort((a, b) => b.percent - a.percent);
  if (!scored.length) return { percent: null, earned, possible, dropped };
  // Ranks are only settled once every ranked item has a score; until then the
  // scores so far count evenly.
  if (rule.kind === 'equal' || scored.length < rule.weights.length)
    return {
      percent:
        scored.reduce((sum, row) => sum + row.percent, 0) / scored.length,
      earned,
      possible,
      dropped,
    };
  for (const row of scored.slice(rule.weights.length)) dropped.add(row.id);
  const total = rule.weights.reduce((sum, weight) => sum + weight, 0);
  return {
    percent:
      total > 0
        ? rule.weights.reduce(
            (sum, weight, index) => sum + weight * scored[index].percent,
            0,
          ) / total
        : null,
    earned,
    possible,
    dropped,
  };
}

/**
 * A points pool ("MQEW points out of 70"): scaled points from its parts, where
 * parts sharing a choice are either/or and only the one with more points
 * earned counts. Current compares points earned with points available so far
 * (both capped); projected adds the rest at what-ifs or the assumption.
 */
function poolResult(
  course: GradeCourse,
  category: GradeCategory,
  rule: Extract<CategoryRule, { kind: 'pool' }>,
  mode: Mode,
  state: CalculatorState,
  assume: number,
): CategoryResult {
  const dropped = new Set<number>();
  const byId = new Map(category.items.map((item) => [item.id, item]));
  const tallies = rule.parts.map((part) => {
    let earned = 0;
    let possible = 0;
    let projected = 0;
    for (const id of part.items) {
      const item = byId.get(id);
      if (!item || item.possible <= 0) continue;
      if (item.score != null) {
        earned += item.score * part.scale;
        possible += item.possible * part.scale;
        projected += item.score * part.scale;
      } else
        projected +=
          (state.whatIf[String(id)] ?? (assume / 100) * item.possible) *
          part.scale;
    }
    return { part, earned, possible, projected };
  });
  const kept = tallies.filter(
    (tally, index) =>
      tally.part.choice == null ||
      !tallies.some(
        (other, otherIndex) =>
          other.part.choice === tally.part.choice &&
          (other.earned > tally.earned ||
            (other.earned === tally.earned && otherIndex < index)),
      ),
  );
  for (const tally of tallies)
    if (!kept.includes(tally))
      for (const id of tally.part.items) dropped.add(id);
  const sum = (key: 'earned' | 'possible' | 'projected') =>
    kept.reduce((total, tally) => total + tally[key], 0);
  if (mode === 'current') {
    const possible = Math.min(sum('possible'), rule.cap);
    return possible > 0
      ? {
          percent: (100 * Math.min(sum('earned'), rule.cap)) / possible,
          earned: sum('earned'),
          possible,
          dropped,
        }
      : { percent: null, earned: 0, possible: 0, dropped };
  }
  if (category.items.length === 0)
    return {
      percent: state.categoryWhatIf[categoryKey(course.id, category)] ?? assume,
      earned: 0,
      possible: 0,
      dropped,
    };
  return {
    percent: (100 * Math.min(sum('projected'), rule.cap)) / rule.cap,
    earned: sum('projected'),
    possible: rule.cap,
    dropped,
  };
}

export function courseGrade(
  course: GradeCourse,
  mode: Mode,
  state: CalculatorState,
  assume = state.assume,
): number | null {
  const { categories } = courseCategories(course, state);
  if (!course.weighted && !course.policy) {
    let earned = 0;
    let possible = 0;
    for (const category of categories) {
      const result = categoryResult(course, category, mode, state, assume);
      earned += result.earned;
      possible += result.possible;
    }
    return possible > 0 ? (100 * earned) / possible : null;
  }
  let weight = 0;
  let weighted = 0;
  for (const category of categories) {
    if (category.weight <= 0) continue;
    const { percent } = categoryResult(course, category, mode, state, assume);
    if (percent == null) continue;
    weight += category.weight;
    weighted += category.weight * percent;
  }
  return weight > 0 ? weighted / weight : null;
}

export type Needed =
  | { state: 'locked' }
  | { state: 'out' }
  | { state: 'need'; percent: number }
  | { state: 'unknown' };

/** Uniform score needed on every blank item (what-ifs held fixed) to finish at `target`. */
export function neededOnRemaining(
  course: GradeCourse,
  target: number,
  state: CalculatorState,
): Needed {
  const low = courseGrade(course, 'projected', state, 0);
  const high = courseGrade(course, 'projected', state, 100);
  if (low == null || high == null) return { state: 'unknown' };
  if (low >= target) return { state: 'locked' };
  if (high < target) return { state: 'out' };
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if ((courseGrade(course, 'projected', state, mid) ?? 0) >= target) hi = mid;
    else lo = mid;
  }
  return { state: 'need', percent: hi };
}

/** The user's cutoffs, else the syllabus's, else 90/80/70/60. */
export function cutoffsFor(
  course: GradeCourse,
  state: CalculatorState,
): Cutoffs {
  return (
    state.cutoffs[String(course.id)] ??
    course.policy?.cutoffs ??
    DEFAULT_CUTOFFS
  );
}

/** The user's credit hours, else the syllabus's, else 3. */
export function creditsFor(course: GradeCourse, state: CalculatorState) {
  return (
    state.credits[String(course.id)] ??
    course.policy?.credits ??
    DEFAULT_CREDITS
  );
}

export function letterFor(
  percent: number | null,
  cutoffs: Cutoffs,
): Letter | null {
  if (percent == null) return null;
  const [a, b, c, d] = cutoffs;
  return percent >= a
    ? 'A'
    : percent >= b
      ? 'B'
      : percent >= c
        ? 'C'
        : percent >= d
          ? 'D'
          : 'F';
}

export function gpa(
  courses: GradeCourse[],
  mode: Mode,
  state: CalculatorState,
): number | null {
  let quality = 0;
  let hours = 0;
  for (const course of courses) {
    const letter = letterFor(
      courseGrade(course, mode, state),
      cutoffsFor(course, state),
    );
    const credits = creditsFor(course, state);
    if (!letter || credits <= 0) continue;
    quality += LETTER_POINTS[letter] * credits;
    hours += credits;
  }
  return hours > 0 ? quality / hours : null;
}

/** Title key that treats "Exam 01" and "Exam 1" as the same assignment. */
export function assignmentMatchKey(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((token) => (/^\d+$/.test(token) ? String(Number(token)) : token))
    .join(' ');
}
