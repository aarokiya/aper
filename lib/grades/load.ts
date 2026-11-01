import { z } from 'zod';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { readSetting, writeSetting } from '@/lib/db/settings';
import {
  assignmentMatchKey,
  categoryKey,
  DEFAULT_CALCULATOR_STATE,
  type CalculatorState,
  type GradeCategory,
  type GradeCourse,
  type GradeItem,
  type GradescopeScore,
} from '@/lib/grades/calculator';
import {
  gradescopeObservationSchema,
  readGradescopeScores,
} from '@/lib/grades/gradescope-scores';
import { KINDS, kindsOf, titleStem } from '@/lib/grades/kinds';
import { getGradePolicy, syllabusSources } from '@/lib/grades/policy-store';

type CourseRow = {
  id: number;
  provider: string;
  alias: string | null;
  courseCode: string | null;
  name: string;
  shortName: string | null;
  term: string | null;
  canvasScore: number | null;
  weighted: number | null;
};
type GroupRow = {
  id: number;
  courseId: number;
  name: string;
  weight: number | null;
  rulesJson: string | null;
};
type AssignmentRow = {
  id: number;
  sourceId: string;
  provider: string;
  courseId: number;
  groupId: number | null;
  title: string;
  possible: number | null;
  sourceUrl: string | null;
  /** The submission row's score (Canvas's, or Gradescope's for Gradescope rows and fills). */
  score: number | null;
  /** Canvas's own score for Canvas rows, without any Gradescope fill. */
  canvasScore: number | null;
  /** `submissions.provider_json.gradescope` written by the Gradescope sync. */
  gradescopeJson: string | null;
};

const GRADESCOPE_BUCKET = 'gradescope';

/**
 * Current-term courses with Canvas categories and gradeable items, merged with
 * Gradescope per assignment: Canvas's score counts when it has one, otherwise
 * Gradescope's scaled to Canvas points. Gradescope-only assignments are placed
 * in the Canvas category their title suggests (or a "Gradescope" bucket), and
 * Gradescope courses join the Canvas class with the same department and number.
 * Canvas "Default Term" shells (orientation, career services, honors program)
 * are organizations rather than graded courses, so they are left out.
 */
export function loadGradeCourses(): GradeCourse[] {
  initializeDatabase();
  const { sqlite } = getDb();
  const rows = sqlite
    .prepare(
      `SELECT id,source_provider AS provider,local_alias AS alias,course_code AS courseCode,name,short_name AS shortName,term_name AS term,current_score AS canvasScore,json_extract(provider_json,'$.apply_assignment_group_weights') AS weighted
       FROM courses WHERE is_current=1 AND COALESCE(term_name,'')<>'Default Term'
       ORDER BY COALESCE(local_alias,course_code,name)`,
    )
    .all() as CourseRow[];
  if (!rows.length) return [];

  // Each course row's grades land in one course: a Gradescope course joins the
  // Canvas class with its department and number, or stands alone when it is
  // from a term Canvas is showing.
  const canvasCourses = rows.filter((row) => row.provider === 'canvas');
  const canvasByKey = new Map<string, number>();
  for (const course of canvasCourses) {
    const key = courseKeyOf(course);
    if (key && !canvasByKey.has(key)) canvasByKey.set(key, course.id);
  }
  const canvasTerms = new Set(
    canvasCourses.map((course) => normalizedTerm(course.term)).filter(Boolean),
  );
  const owner = new Map<number, number>();
  const gradescopeCourses: CourseRow[] = [];
  for (const row of rows) {
    if (row.provider === 'canvas') owner.set(row.id, row.id);
    else {
      const key = courseKeyOf(row);
      const canvasId = key ? canvasByKey.get(key) : undefined;
      if (canvasId != null) owner.set(row.id, canvasId);
      else if (canvasTerms.has(normalizedTerm(row.term))) {
        owner.set(row.id, row.id);
        gradescopeCourses.push(row);
      }
    }
  }

  const courseIds = [...owner.keys()];
  if (!courseIds.length) return [];
  const placeholders = courseIds.map(() => '?').join(',');
  const groups = sqlite
    .prepare(
      `SELECT id,course_id AS courseId,name,group_weight AS weight,rules_json AS rulesJson
       FROM assignment_groups WHERE course_id IN (${placeholders}) ORDER BY position,id`,
    )
    .all(...courseIds) as GroupRow[];
  // Items Canvas leaves out of the final grade are excluded here: unpublished,
  // omitted, hidden from the gradebook, not graded, and excused. A Canvas
  // submission row carries Canvas's own JSON (with `workflow_state`), whose
  // score is Canvas's even when the score column holds a Gradescope fill. A
  // submission pending review (a quiz awaiting manual grading) carries only a
  // partial auto-score that Canvas's own total leaves out, so it isn't a score.
  const assignments = sqlite
    .prepare(
      `SELECT a.id,a.source_id AS sourceId,a.source_provider AS provider,a.course_id AS courseId,a.assignment_group_id AS groupId,a.title,a.points_possible AS possible,a.source_url AS sourceUrl,s.score,
         CASE WHEN json_extract(s.provider_json,'$.workflow_state')='pending_review' THEN NULL
              WHEN json_type(s.provider_json,'$.workflow_state') IS NOT NULL THEN json_extract(s.provider_json,'$.score')
              WHEN json_type(s.provider_json,'$.gradescope') IS NOT NULL THEN NULL
              ELSE s.score END AS canvasScore,
         json_extract(s.provider_json,'$.gradescope') AS gradescopeJson
       FROM assignments a LEFT JOIN submissions s ON s.assignment_id=a.id
       WHERE a.course_id IN (${placeholders})
         AND COALESCE(a.published,1)=1
         AND COALESCE(json_extract(a.provider_json,'$.omit_from_final_grade'),0)=0
         AND COALESCE(json_extract(a.provider_json,'$.hide_in_gradebook'),0)=0
         AND COALESCE(a.grading_type,'')<>'not_graded'
         AND COALESCE(s.excused,0)=0
       ORDER BY COALESCE(a.due_at,'9999'),a.id`,
    )
    .all(...courseIds) as AssignmentRow[];
  const ledger = readGradescopeScores();

  const syllabi = syllabusSources(
    [...canvasCourses, ...gradescopeCourses].map((course) => course.id),
  );
  const built = [...canvasCourses, ...gradescopeCourses].flatMap((course) => {
    const isCanvas = course.provider === 'canvas';
    const weighted = isCanvas && course.weighted === 1;
    const categories = new Map<
      number | null | typeof GRADESCOPE_BUCKET,
      GradeCategory
    >();
    for (const group of groups) {
      if (group.courseId !== course.id) continue;
      const rules = parseRules(group.rulesJson);
      categories.set(group.id, {
        id: group.id,
        name: group.name,
        weight: group.weight ?? 0,
        dropLowest: rules.drop_lowest ?? 0,
        dropHighest: rules.drop_highest ?? 0,
        neverDrop: (rules.never_drop ?? []).map(String),
        items: [],
      });
    }
    const categoryFor = (id: number | null | typeof GRADESCOPE_BUCKET) => {
      let category = categories.get(id);
      if (!category) {
        category = {
          id,
          name:
            id === GRADESCOPE_BUCKET
              ? 'Gradescope'
              : weighted
                ? 'Other assignments'
                : 'Assignments',
          weight: 0,
          dropLowest: 0,
          dropHighest: 0,
          neverDrop: [],
          items: [],
        };
        categories.set(id, category);
      }
      return category;
    };

    // Gradescope rows that were not merged into a Canvas assignment at sync
    // time, by title key. One that matches a Canvas title here (e.g. "Exam 1"
    // and "Exam 01") is the same assignment; the rest are Gradescope-only.
    const gradescopeRows = new Map<string, AssignmentRow[]>();
    for (const row of assignments)
      if (
        row.provider === 'gradescope' &&
        owner.get(row.courseId) === course.id
      ) {
        const key = assignmentMatchKey(row.title);
        gradescopeRows.set(key, [...(gradescopeRows.get(key) ?? []), row]);
      }

    const canvasItems: Array<{ item: GradeItem; groupId: number | null }> = [];
    if (isCanvas)
      for (const row of assignments) {
        if (row.courseId !== course.id || row.provider !== 'canvas') continue;
        const key = assignmentMatchKey(row.title);
        const twins = gradescopeRows.get(key);
        gradescopeRows.delete(key);
        const twin = twins && bestRow(twins);
        const observation =
          ledger[String(row.id)] ??
          parseObservation(row.gradescopeJson) ??
          (twin ? rowObservation(twin) : null);
        canvasItems.push({
          item: mergedItem(row, observation),
          groupId: row.groupId,
        });
      }
    for (const { item, groupId } of canvasItems)
      categoryFor(groupId).items.push(item);

    const onlyGradescope = [...gradescopeRows.values()].map(bestRow);
    if (onlyGradescope.length) {
      const bucketKey = categoryKey(course.id, { id: GRADESCOPE_BUCKET });
      categoryFor(GRADESCOPE_BUCKET);
      const targets = [...categories.values()].filter(
        (category) =>
          category.id !== GRADESCOPE_BUCKET &&
          (!weighted || category.weight > 0),
      );
      const siblings = canvasItems.map(({ item, groupId }) => ({
        item,
        category: categories.get(groupId)!,
      }));
      for (const row of onlyGradescope) {
        const estimate =
          row.possible ??
          estimatePossible(row.title, [
            ...siblings.map(({ item }) => item),
            ...onlyGradescope
              .filter((other) => other !== row)
              .map(gradescopeOnlyItem),
          ]);
        const target = inferCategory(row.title, targets, siblings);
        const item: GradeItem = {
          ...gradescopeOnlyItem(row),
          possible: estimate ?? 0,
          possibleEstimated: row.possible == null && estimate != null,
          placement: {
            inferred: target ? categoryKey(course.id, target) : bucketKey,
            confident: Boolean(target),
          },
        };
        (target ?? categoryFor(GRADESCOPE_BUCKET)).items.push(item);
      }
    }

    const kept = [...categories.values()].filter(
      (category) =>
        category.items.length > 0 ||
        (weighted && category.weight > 0) ||
        (category.id === GRADESCOPE_BUCKET && onlyGradescope.length > 0),
    );
    if (
      !kept.some((category) => category.items.length > 0 || category.weight > 0)
    )
      return [];
    const code = course.alias ?? displayCode(course.courseCode ?? course.name);
    return [
      {
        id: course.id,
        code,
        name: course.alias
          ? course.name
          : displayName(course.name, course.courseCode),
        origin: isCanvas ? ('canvas' as const) : ('gradescope' as const),
        weighted,
        canvasScore: isCanvas ? course.canvasScore : null,
        categories: kept,
        policy: getGradePolicy(course.id),
        syllabi: syllabi.get(course.id) ?? [],
      },
    ];
  });
  return built.sort((a, b) => a.code.localeCompare(b.code));
}

/** A Canvas item merged with Gradescope's observation of the same assignment. */
function mergedItem(
  row: AssignmentRow,
  gradescope: GradescopeScore | null,
): GradeItem {
  const possible = row.possible ?? 0;
  const scaled =
    gradescope?.score != null && (gradescope.possible ?? 0) > 0 && possible > 0
      ? (gradescope.score / gradescope.possible!) * possible
      : null;
  const score = row.canvasScore ?? scaled;
  return {
    id: row.id,
    sourceId: row.sourceId,
    title: row.title,
    possible,
    possibleEstimated: false,
    score,
    scoreSource:
      row.canvasScore != null ? 'canvas' : scaled != null ? 'gradescope' : null,
    source: gradescope ? 'both' : 'canvas',
    canvasScore: row.canvasScore,
    gradescope,
    sourceUrl: row.sourceUrl ?? gradescope?.url ?? null,
    placement: null,
  };
}

function gradescopeOnlyItem(row: AssignmentRow): GradeItem {
  return {
    id: row.id,
    sourceId: row.sourceId,
    title: row.title,
    possible: row.possible ?? 0,
    possibleEstimated: false,
    score: row.score,
    scoreSource: row.score == null ? null : 'gradescope',
    source: 'gradescope',
    canvasScore: null,
    gradescope: {
      score: row.score,
      possible: row.possible,
      url: row.sourceUrl,
    },
    sourceUrl: row.sourceUrl,
    placement: null,
  };
}

/** Of several Gradescope rows with one title key, the graded one with points. */
function bestRow(rows: AssignmentRow[]) {
  return (
    rows.find((row) => row.score != null && (row.possible ?? 0) > 0) ?? rows[0]
  );
}

function rowObservation(row: AssignmentRow): GradescopeScore {
  return { score: row.score, possible: row.possible, url: row.sourceUrl };
}

function parseObservation(json: string | null): GradescopeScore | null {
  if (!json) return null;
  try {
    const parsed = gradescopeObservationSchema.safeParse(JSON.parse(json));
    return parsed.success
      ? {
          score: parsed.data.score,
          possible: parsed.data.possible,
          url: parsed.data.url,
        }
      : null;
  } catch {
    return null;
  }
}

/** Points possible of the latest similar item, for Gradescope work posted without points. */
function estimatePossible(title: string, items: GradeItem[]) {
  const stem = titleStem(title);
  if (!stem) return null;
  const similar = items.filter(
    (item) =>
      item.possible > 0 &&
      !item.possibleEstimated &&
      titleStem(item.title) === stem,
  );
  return similar.length ? similar[similar.length - 1].possible : null;
}

/**
 * The Canvas category a Gradescope-only assignment most likely counts toward,
 * or null when no single category is a confident match. Canvas items with the
 * same title stem decide first ("Programming Exercise 05" goes where 00–04
 * are); otherwise the assignment kinds in the title and the group names.
 */
function inferCategory(
  title: string,
  targets: GradeCategory[],
  siblings: Array<{ item: GradeItem; category: GradeCategory }>,
): GradeCategory | null {
  const stem = titleStem(title);
  if (stem) {
    const homes = new Set(
      siblings
        .filter(
          ({ item, category }) =>
            targets.includes(category) && titleStem(item.title) === stem,
        )
        .map(({ category }) => category),
    );
    if (homes.size === 1) return [...homes][0];
  }
  const kinds = kindsOf(title);
  if (!kinds.size) return null;
  let best: GradeCategory | null = null;
  let bestScore = 0;
  let tied = false;
  for (const category of targets) {
    const groupKinds = kindsOf(category.name);
    let score = 0;
    for (const kind of kinds)
      if (groupKinds.has(kind)) score += KINDS[kind].weight;
    // "Exam 2" belongs with midterms, not a final-exam group (and vice versa).
    if (
      groupKinds.has('final') !== kinds.has('final') &&
      (groupKinds.has('exam') || kinds.has('exam'))
    )
      score -= 2;
    if (score > bestScore) {
      best = category;
      bestScore = score;
      tied = false;
    } else if (score === bestScore && score > 0) tied = true;
  }
  return best && bestScore >= 2 && !tied ? best : null;
}

const rulesSchema = z
  .object({
    drop_lowest: z.number().int().min(0).optional(),
    drop_highest: z.number().int().min(0).optional(),
    never_drop: z.array(z.union([z.string(), z.number()])).optional(),
  })
  .catch({});

function parseRules(json: string | null) {
  try {
    return rulesSchema.parse(JSON.parse(json ?? '{}'));
  } catch {
    return {};
  }
}

/** "ABC 1234", "ABC-1234-B", "abc1234" → "ABC1234"; null without a department and number. */
function courseKeyOf(
  course: Pick<CourseRow, 'courseCode' | 'shortName' | 'alias' | 'name'>,
) {
  for (const value of [
    course.courseCode,
    course.shortName,
    course.alias,
    course.name,
  ]) {
    const match = value?.toUpperCase().match(/\b([A-Z]{2,5})\s*-?\s*(\d{4})/);
    if (match) return `${match[1]}${match[2]}`;
  }
  return null;
}

function normalizedTerm(term: string | null) {
  return (term ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "ABC-1234-B" → "ABC 1234"; anything unrecognized is shown as Canvas has it. */
function displayCode(code: string) {
  const match = code.match(/^([A-Z]{2,5})[ -](\d{4}[A-Z]?)/);
  return match ? `${match[1]} ${match[2]}` : code;
}

/** Canvas names end with " - ABC-1234-B"; the code is already shown separately. */
function displayName(name: string, code: string | null) {
  return code && name.endsWith(` - ${code}`)
    ? name.slice(0, -(code.length + 3))
    : name;
}

const STATE_KEY = 'grade-calculator';
const cutoffValue = z.number().min(0).max(100);

export const calculatorStateSchema = z.object({
  assume: z.number().min(0).max(100),
  whatIf: z.record(z.string(), z.number().min(0).max(100_000)),
  categoryWhatIf: z.record(z.string(), z.number().min(0).max(200)),
  credits: z.record(z.string(), z.number().min(0).max(12)),
  cutoffs: z.record(
    z.string(),
    z.tuple([cutoffValue, cutoffValue, cutoffValue, cutoffValue]),
  ),
  open: z.record(z.string(), z.boolean()),
  // Added with Gradescope-only placement; states saved before then have none.
  placement: z.record(z.string(), z.string().max(64)).default({}),
}) satisfies z.ZodType<CalculatorState>;

export function getCalculatorState(): CalculatorState {
  return readSetting(
    STATE_KEY,
    calculatorStateSchema,
    DEFAULT_CALCULATOR_STATE,
  );
}

export function saveCalculatorState(state: CalculatorState) {
  writeSetting(STATE_KEY, state);
}
