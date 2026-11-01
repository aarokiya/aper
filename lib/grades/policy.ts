/**
 * A course's grading rules as its syllabus states them, mapped onto the Canvas
 * assignment groups and assignments that hold the scores. Pure and isomorphic:
 * the server proposes a policy from a parsed syllabus, the client edits it, and
 * the grade engine applies it (see `courseCategories` in ./calculator).
 */
import { z } from 'zod';
import type {
  Cutoffs,
  GradeCategory,
  GradeCourse,
  GradeItem,
} from '@/lib/grades/calculator';
import { KINDS, kindsOf } from '@/lib/grades/kinds';
import type {
  ParsedSyllabus,
  SyllabusComponent,
  SyllabusPool,
} from '@/lib/grades/syllabus-parse';

/**
 * Where a component's scores come from: one assignment, or a Canvas
 * assignment group (all of it, or only the assignments whose titles carry
 * some words or a kind, or whatever no other component claims). Group sources
 * keep matching assignments the course posts later.
 */
export type PolicySource = {
  item?: number;
  group?: number;
  words?: string[];
  kind?: string;
  rest?: boolean;
  /** pool points per point (pool scoring only) */
  scale?: number;
  /** pool sources sharing a label are alternatives: only the larger total counts */
  choice?: string;
};

export type PolicyScoring =
  /** earned over possible across the items (Canvas's way) */
  | { kind: 'points' }
  /** every item counts the same, whatever its points */
  | { kind: 'equal' }
  /** items ordered best first, each rank worth its share of the course grade */
  | { kind: 'ranked'; weights: number[] }
  /** points summed from the sources (scaled), out of `cap`, never above 100% */
  | { kind: 'pool'; cap: number };

export type PolicyComponent = {
  /** stable slug; keys what-ifs for components with no work posted yet */
  key: string;
  name: string;
  /** percent of the course grade (ranked: the sum of its rank weights) */
  weight: number;
  sources: PolicySource[];
  scoring: PolicyScoring;
  dropLowest: number;
  /** the syllabus line it came from */
  quote: string | null;
};

export type GradePolicy = {
  /** what it was read from: a file name, "Canvas syllabus", or "Pasted text" */
  source: string;
  savedAt: string;
  components: PolicyComponent[];
  cutoffs: Cutoffs | null;
  cutoffsQuote: string | null;
  credits: number | null;
  /** syllabus rules the calculator does not apply (penalties, bonuses, curves) */
  notes: string[];
};

const percent = z.number().min(0).max(100);

const sourceSchema = z
  .object({
    item: z.number().int().positive().optional(),
    group: z.number().int().positive().optional(),
    words: z.array(z.string().trim().min(1).max(40)).min(1).max(8).optional(),
    // Checked at parse time: KINDS sits across an import cycle with ./calculator.
    kind: z
      .string()
      .refine((kind) => Object.hasOwn(KINDS, kind), 'Unknown kind.')
      .optional(),
    rest: z.literal(true).optional(),
    scale: z.number().positive().max(100).optional(),
    choice: z.string().max(40).optional(),
  })
  .refine((source) => (source.group == null) !== (source.item == null), {
    message: 'Each source is either a group or an assignment.',
  })
  .refine(
    (source) =>
      [source.words, source.kind, source.rest].filter((value) => value != null)
        .length <= (source.group == null ? 0 : 1),
    { message: 'A group source narrows by words, a kind, or the rest, once.' },
  );

export const gradePolicySchema = z.object({
  source: z.string().min(1).max(200),
  savedAt: z.string().max(40),
  components: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9-]{1,48}$/),
        name: z.string().trim().min(1).max(120),
        weight: percent,
        sources: z.array(sourceSchema).max(80),
        scoring: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('points') }),
          z.object({ kind: z.literal('equal') }),
          z.object({
            kind: z.literal('ranked'),
            weights: z.array(percent).min(1).max(20),
          }),
          z.object({
            kind: z.literal('pool'),
            cap: z.number().positive().max(100_000),
          }),
        ]),
        dropLowest: z.number().int().min(0).max(50),
        quote: z.string().max(1200).nullable(),
      }),
    )
    .min(1)
    .max(30)
    .refine(
      (components) =>
        new Set(components.map((component) => component.key)).size ===
        components.length,
      { message: 'Component keys must be unique.' },
    ),
  cutoffs: z.tuple([percent, percent, percent, percent]).nullable(),
  cutoffsQuote: z.string().max(1200).nullable(),
  credits: z.number().min(0).max(12).nullable(),
  notes: z.array(z.string().max(1200)).max(20),
}) satisfies z.ZodType<GradePolicy>;

const STOP = new Set([
  'the',
  'of',
  'and',
  'a',
  'an',
  'for',
  'your',
  'all',
  'total',
  'score',
  'grade',
  'point',
  'pt',
  'each',
  'in',
  'on',
  'to',
  'x',
  'not',
  'part',
]);

/**
 * Lowercase words without stop words, roughly singular. Syllabus labels drop
 * parentheticals ("Homeworks (HWs)" → homework); Canvas names keep them, since
 * "Threads Planning (Written Assignment)" says what the group is.
 */
export function labelTokens(text: string, keepParens = false) {
  return (keepParens ? text : text.replace(/\([^)]*\)/g, ' '))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((token) =>
      token.endsWith('zzes')
        ? token.slice(0, -3)
        : token.endsWith('ies')
          ? `${token.slice(0, -3)}y`
          : token.length > 3 && token.endsWith('s') && !token.endsWith('ss')
            ? token.slice(0, -1)
            : token,
    )
    .filter((token) => token && !STOP.has(token));
}

const titleHas = (item: GradeItem, words: string[]) => {
  const title = new Set(labelTokens(item.title, true));
  return words.every((word) => title.has(word));
};

/**
 * Which assignments each component counts, in component order. An assignment
 * counts once: named assignments first, then group assignments matched by
 * words or kind, then whole groups, then each group's leftovers.
 */
export function resolvePolicy(
  policy: GradePolicy,
  categories: GradeCategory[],
): {
  parts: Array<Array<{ source: PolicySource; items: GradeItem[] }>>;
  counted: Set<number>;
} {
  const groupItems = new Map(
    categories.map((category) => [String(category.id), category.items]),
  );
  const byId = new Map(
    categories.flatMap((category) =>
      category.items.map((item) => [item.id, item] as const),
    ),
  );
  const counted = new Set<number>();
  const parts = policy.components.map((component) =>
    component.sources.map((source) => ({ source, items: [] as GradeItem[] })),
  );
  const passes: Array<(source: PolicySource) => GradeItem[] | null> = [
    (source) =>
      source.item == null
        ? null
        : [byId.get(source.item)].filter((item) => item != null),
    (source) =>
      source.group == null || (!source.words && !source.kind)
        ? null
        : (groupItems.get(String(source.group)) ?? []).filter((item) =>
            source.words
              ? titleHas(
                  item,
                  source.words.map((word) => labelTokens(word)[0] ?? word),
                )
              : kindsOf(item.title).has(source.kind!),
          ),
    (source) =>
      source.group == null || source.words || source.kind || source.rest
        ? null
        : (groupItems.get(String(source.group)) ?? []),
    (source) =>
      source.group != null && source.rest
        ? (groupItems.get(String(source.group)) ?? [])
        : null,
  ];
  for (const pass of passes)
    policy.components.forEach((component, index) =>
      component.sources.forEach((source, sourceIndex) => {
        for (const item of pass(source) ?? []) {
          if (counted.has(item.id)) continue;
          counted.add(item.id);
          parts[index][sourceIndex].items.push(item);
        }
      }),
    );
  return { parts, counted };
}

/** Groups Canvas keeps for bookkeeping rather than graded work. */
const NOT_GRADED =
  /\bnot (part of|counted|included)\b|\bno credit\b|\bimported assignments\b|\bextra credit\b/i;

export type PolicyReport = {
  /** components with no Canvas work matched yet */
  unmatched: string[];
  /** sum of component weights; 100 when the syllabus breakdown is complete */
  total: number;
};

type Group = GradeCategory & { id: number };

const sharedKinds = (a: Set<string>, b: Set<string>) =>
  [...a].filter((kind) => kind !== 'assignment' && b.has(kind));

/** Share of the label's words found in the group name (Canvas parentheticals included). */
function nameCoverage(label: string, group: GradeCategory) {
  const words = new Set(labelTokens(label));
  const name = new Set(labelTokens(group.name, true));
  return words.size
    ? [...words].filter((token) => name.has(token)).length / words.size
    : 0;
}

/** Ranked lines of one kind ("Best/Middle/Worst Midterm") become one ranked component. */
function mergeRanked(components: SyllabusComponent[]) {
  const ORDER = { best: 0, middle: 1, worst: 2 } as const;
  type Entry = {
    component: SyllabusComponent;
    ranks: Array<{ order: number; weight: number }> | null;
  };
  const merged: Entry[] = [];
  const byBase = new Map<string, Entry>();
  for (const component of components) {
    if (!component.rank) {
      merged.push({ component, ranks: null });
      continue;
    }
    const base = component.label
      .replace(/\b(best|highest|top|middle|second|worst|lowest)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const rank = { order: ORDER[component.rank], weight: component.weight };
    const entry = byBase.get(base.toLowerCase());
    if (entry) {
      entry.ranks!.push(rank);
      entry.component = {
        ...entry.component,
        weight: entry.component.weight + component.weight,
        quote: `${entry.component.quote} ${component.quote}`,
      };
    } else {
      const created: Entry = {
        component: {
          ...component,
          label: base.replace(/s?$/, 's'),
          rank: null,
        },
        ranks: [rank],
      };
      byBase.set(base.toLowerCase(), created);
      merged.push(created);
    }
  }
  return merged.map(({ component, ranks }) => ({
    component,
    ranks: ranks
      ? [...ranks].sort((a, b) => a.order - b.order).map((rank) => rank.weight)
      : null,
  }));
}

const lower = (value: string) => value.toLowerCase().trim();

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'part';

/**
 * Proposes a policy from a parsed syllabus for a course's Canvas structure.
 * Each syllabus component claims, in order of confidence: Canvas groups named
 * by every word of its label; a group's assignments named by its label; a
 * group with its weight, or sharing part of its name and its kind; a group's
 * assignments of its kind; and, for the one component still empty, what its
 * group-mates left. A points pool claims the groups its sources name. Canvas
 * drop rules carry over unless the syllabus states its own.
 */
export function buildPolicy(
  parsed: ParsedSyllabus,
  course: Pick<GradeCourse, 'categories'>,
  source: string,
  now = new Date(),
): { policy: GradePolicy | null; report: PolicyReport } {
  const merged = mergeRanked(parsed.components);
  const total = merged.reduce((sum, entry) => sum + entry.component.weight, 0);
  if (!merged.length) return { policy: null, report: { unmatched: [], total } };

  const groups = course.categories.filter(
    (category): category is Group =>
      typeof category.id === 'number' &&
      !NOT_GRADED.test(category.name) &&
      (category.items.length > 0 || category.weight > 0),
  );
  /** groups a component took whole */
  const whole = new Set<number>();
  /** groups some of whose assignments a component took */
  const partial = new Set<number>();
  const plans = merged.map(({ component, ranks }) => ({
    component,
    ranks,
    pool: parsed.pools.find((pool) =>
      labelTokens(pool.target).some((token) =>
        labelTokens(component.label).includes(token),
      ),
    ),
    sources: [] as PolicySource[],
  }));
  type Plan = (typeof plans)[number];
  const open = () =>
    plans.filter((plan) => !plan.pool && plan.sources.length === 0);
  const takeGroup = (plan: Plan, group: Group) => {
    whole.add(group.id);
    plan.sources.push({ group: group.id });
  };
  const free = (group: Group) => !whole.has(group.id);

  for (const plan of plans) if (plan.pool) poolSources(plan, groups, whole);

  // 1. Groups carrying every word of the label (several: "Final Exam - Part 1/2").
  for (const plan of open())
    for (const group of groups)
      if (free(group) && nameCoverage(plan.component.label, group) === 1)
        takeGroup(plan, group);

  // 2. A group's assignments named by a label of two or more words ("Project proposal").
  for (const plan of open()) {
    const words = labelTokens(plan.component.label);
    if (words.length < 2) continue;
    for (const group of groups.filter(free))
      if (group.items.some((item) => titleHas(item, words))) {
        partial.add(group.id);
        plan.sources.push({ group: group.id, words });
      }
  }

  // 3. A group with the same weight, or sharing part of the name and the kind.
  const candidates = open()
    .flatMap((plan) =>
      groups.filter(free).map((group) => {
        const kinds =
          sharedKinds(
            kindsOf(plan.component.label),
            new Set([
              ...kindsOf(group.name),
              ...group.items.flatMap((item) => [...kindsOf(item.title)]),
            ]),
          ).length > 0;
        const coverage = nameCoverage(plan.component.label, group);
        const weight = (other: Group) =>
          other.weight > 0 &&
          Math.abs(other.weight - plan.component.weight) < 0.01;
        const eligible =
          (weight(group) &&
            (kinds ||
              coverage > 0 ||
              groups.filter((other) => free(other) && weight(other)).length ===
                1)) ||
          (coverage >= 0.5 && kinds);
        return {
          plan,
          group,
          eligible,
          score: (weight(group) ? 1 : 0) + (kinds ? 0.5 : 0) + coverage,
        };
      }),
    )
    .filter((candidate) => candidate.eligible)
    .sort((a, b) => b.score - a.score);
  for (const { plan, group } of candidates)
    if (free(group) && !partial.has(group.id) && plan.sources.length === 0)
      takeGroup(plan, group);

  // 4. A group's assignments of the label's kind ("Exams" → "Test 1 -- MC").
  for (const plan of open()) {
    const kinds = kindsOf(plan.component.label);
    for (const group of groups.filter(free)) {
      const kind = group.items
        .flatMap((item) => sharedKinds(kinds, kindsOf(item.title)))
        .at(0);
      if (!kind) continue;
      partial.add(group.id);
      plan.sources.push({ group: group.id, kind });
    }
  }

  // 5. One component still empty: whatever its group-mates left.
  const left = open();
  if (left.length === 1)
    for (const group of groups) {
      if (whole.has(group.id) || !partial.has(group.id)) continue;
      const narrowed = plans.flatMap((plan) =>
        plan.sources.filter((entry) => entry.group === group.id),
      );
      const leftover = group.items.some(
        (item) =>
          !narrowed.some((entry) =>
            entry.words
              ? titleHas(item, entry.words)
              : kindsOf(item.title).has(entry.kind!),
          ),
      );
      if (leftover) left[0].sources.push({ group: group.id, rest: true });
    }

  const keys = new Set<string>();
  const component = (
    label: string,
    weight: number,
    plan: Plan,
    sources: PolicySource[],
  ): PolicyComponent => {
    const { ranks, pool } = plan;
    let key = slug(label);
    while (keys.has(key)) key = `${key}-2`;
    keys.add(key);
    const words = labelTokens(plan.component.label);
    const drop = parsed.drops.find(
      (entry) =>
        labelTokens(entry.target).some((token) => words.includes(token)) ||
        sharedKinds(kindsOf(entry.target), kindsOf(plan.component.label))
          .length > 0,
    );
    const canvasDrop = Math.max(
      0,
      ...sources.map((entry) =>
        entry.words || entry.kind || entry.rest
          ? 0
          : (groups.find((group) => group.id === entry.group)?.dropLowest ?? 0),
      ),
    );
    return {
      key,
      name: label,
      weight,
      sources,
      scoring: pool
        ? { kind: 'pool', cap: pool.cap }
        : ranks && ranks.length > 1
          ? { kind: 'ranked', weights: ranks }
          : plan.component.each != null || (plan.component.count ?? 0) > 1
            ? { kind: 'equal' }
            : { kind: 'points' },
      dropLowest: pool || ranks ? 0 : (drop?.count ?? canvasDrop),
      quote: plan.component.quote || null,
    };
  };
  // A part Canvas already splits into weighted groups that add up to it
  // ("Assignments 75%" = 65% + 10%) keeps Canvas's split.
  const components = plans.flatMap((plan) => {
    const split = plan.sources.map((entry) =>
      groups.find(
        (group) =>
          group.id === entry.group &&
          !entry.words &&
          !entry.kind &&
          !entry.rest &&
          group.weight > 0,
      ),
    );
    return !plan.pool &&
      !plan.ranks &&
      split.length > 1 &&
      split.every((group) => group != null) &&
      Math.abs(
        split.reduce((sum, group) => sum + group!.weight, 0) -
          plan.component.weight,
      ) < 0.5
      ? split.map((group) =>
          component(group!.name, group!.weight, plan, [{ group: group!.id }]),
        )
      : [
          component(
            plan.component.label,
            plan.component.weight,
            plan,
            plan.sources,
          ),
        ];
  });

  return {
    policy: {
      source,
      savedAt: now.toISOString(),
      components,
      cutoffs: parsed.cutoffs,
      cutoffsQuote: parsed.cutoffsQuote,
      credits: parsed.credits,
      notes: parsed.notes,
    },
    report: {
      unmatched: components
        .filter((component) => !component.sources.length)
        .map((component) => component.name),
      total,
    },
  };
}

/** A pool's sources: the best-named free group for each, with its rate and either/or set. */
function poolSources(
  plan: { pool?: SyllabusPool; sources: PolicySource[] },
  groups: Group[],
  whole: Set<number>,
) {
  const pool = plan.pool!;
  const rate = (label: string) =>
    Object.entries(pool.rates).find(
      ([key]) => lower(key) === lower(label),
    )?.[1];
  const choice = (label: string) => {
    const index = pool.alternatives.findIndex((set) =>
      set.some((entry) => lower(entry) === lower(label)),
    );
    return index >= 0 ? `either-${index + 1}` : undefined;
  };
  for (const label of pool.sources) {
    let best: { group: Group; score: number } | null = null;
    for (const group of groups) {
      if (whole.has(group.id)) continue;
      const score =
        nameCoverage(label, group) +
        (sharedKinds(kindsOf(label), kindsOf(group.name)).length ? 0.5 : 0);
      if (score >= 0.5 && (!best || score > best.score))
        best = { group, score };
    }
    if (!best) continue;
    whole.add(best.group.id);
    const scale = rate(label);
    const either = choice(label);
    plan.sources.push({
      group: best.group.id,
      ...(scale != null && scale !== 1 ? { scale } : {}),
      ...(either ? { choice: either } : {}),
    });
  }
}
