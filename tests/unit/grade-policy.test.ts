import { describe, expect, it } from 'vitest';
import {
  categoryResult,
  courseCategories,
  courseGrade,
  creditsFor,
  cutoffsFor,
  DEFAULT_CALCULATOR_STATE,
  type CalculatorState,
  type GradeCategory,
  type GradeCourse,
  type GradeItem,
} from '@/lib/grades/calculator';
import {
  buildPolicy,
  gradePolicySchema,
  resolvePolicy,
  type GradePolicy,
  type PolicyComponent,
} from '@/lib/grades/policy';
import type {
  ParsedSyllabus,
  SyllabusComponent,
} from '@/lib/grades/syllabus-parse';

let nextId = 1000;
const item = (
  title: string,
  score: number | null,
  possible: number,
): GradeItem => {
  const id = nextId++;
  return {
    id,
    sourceId: String(id),
    title,
    possible,
    possibleEstimated: false,
    score,
    scoreSource: score == null ? null : 'canvas',
    source: 'canvas',
    canvasScore: score,
    gradescope: null,
    sourceUrl: null,
    placement: null,
  };
};
const group = (
  name: string,
  weight: number,
  items: GradeItem[],
  dropLowest = 0,
): GradeCategory & { id: number } => ({
  id: nextId++,
  name,
  weight,
  dropLowest,
  dropHighest: 0,
  neverDrop: [],
  items,
});
const course = (
  categories: GradeCategory[],
  policy: GradePolicy | null = null,
  weighted = true,
): GradeCourse => ({
  id: nextId++,
  code: 'TEST 1000',
  name: 'Fixture',
  origin: 'canvas',
  weighted,
  canvasScore: null,
  categories,
  policy,
  syllabi: [],
});
const part = (
  patch: Partial<PolicyComponent> &
    Pick<PolicyComponent, 'key' | 'weight' | 'sources'>,
): PolicyComponent => ({
  name: patch.key,
  scoring: { kind: 'points' },
  dropLowest: 0,
  quote: null,
  ...patch,
});
const policyOf = (
  components: PolicyComponent[],
  extra: Partial<GradePolicy> = {},
): GradePolicy => ({
  source: 'syllabus.pdf',
  savedAt: '2026-10-02T12:00:00.000Z',
  components,
  cutoffs: null,
  cutoffsQuote: null,
  credits: null,
  notes: [],
  ...extra,
});
const state = (patch: Partial<CalculatorState> = {}): CalculatorState => ({
  ...DEFAULT_CALCULATOR_STATE,
  ...patch,
});

describe('syllabus policy sources', () => {
  it('counts each assignment once: named first, then words or kind, then whole groups, then the rest', () => {
    const proposal = item('Project Proposal', 5, 5);
    const outline = item('Final Project: Outline', 8, 10);
    const quiz = item('Film techniques quiz', 4, 5);
    const questions = [item('Questions #1', 1, 1), item('Questions #2', 0, 1)];
    const projects = group('Final Project Assignments', 0, [proposal, outline]);
    const mixed = group('Questions & other assignments', 0, [
      quiz,
      ...questions,
    ]);
    const fixture = course([projects, mixed], null, false);
    const policy = policyOf([
      part({
        key: 'rest',
        weight: 10,
        sources: [{ group: mixed.id, rest: true }],
      }),
      part({ key: 'board', weight: 15, sources: [{ group: projects.id }] }),
      part({
        key: 'film',
        weight: 5,
        sources: [{ group: mixed.id, words: ['film', 'technique', 'quiz'] }],
      }),
      part({ key: 'proposal', weight: 5, sources: [{ item: proposal.id }] }),
    ]);
    const { parts, counted } = resolvePolicy(policy, fixture.categories);
    expect(
      parts.map((sources) =>
        sources.flatMap((entry) => entry.items.map((found) => found.title)),
      ),
    ).toEqual([
      ['Questions #1', 'Questions #2'],
      ['Final Project: Outline'],
      ['Film techniques quiz'],
      ['Project Proposal'],
    ]);
    expect(counted.size).toBe(5);
  });

  it('lists what no component counts and grades a policy course by its components', () => {
    const exam = item('Exam 1', 39, 50);
    const placeholder = item('Final Course Grade', null, 100);
    const exams = group('Midterm Exams', 60, [exam]);
    const bookkeeping = group('Course Grade', 20, [placeholder]);
    const fixture = course(
      [exams, bookkeeping],
      policyOf([
        part({ key: 'midterms', weight: 60, sources: [{ group: exams.id }] }),
      ]),
    );
    const view = courseCategories(fixture, state());
    expect(view.categories.map((category) => category.id)).toEqual([
      'policy:midterms',
    ]);
    expect(view.uncounted.map((found) => found.title)).toEqual([
      'Final Course Grade',
    ]);
    expect(courseGrade(fixture, 'current', state())).toBeCloseTo(78);
  });
});

describe('syllabus scoring rules', () => {
  it('weighs equal-count items the same whatever their points', () => {
    const exams = group('Exams', 100, [
      item('Exam 1', 10, 10),
      item('Exam 2', 50, 100),
    ]);
    const fixture = course(
      [exams],
      policyOf([
        part({
          key: 'exams',
          weight: 100,
          sources: [{ group: exams.id }],
          scoring: { kind: 'equal' },
        }),
      ]),
    );
    // (100% + 50%) / 2, where points would give 60/110.
    expect(courseGrade(fixture, 'current', state())).toBeCloseTo(75);
  });

  it('ranks midterms best first once all are scored, and averages until then', () => {
    const first = item('Exam 1', 39, 50);
    const second = item('Exam 2', null, 50);
    const third = item('Exam 3', null, 50);
    const midterms = group('Midterm Exams', 60, [first, second, third]);
    const fixture = course(
      [midterms],
      policyOf([
        part({
          key: 'midterms',
          weight: 60,
          sources: [{ group: midterms.id }],
          scoring: { kind: 'ranked', weights: [25, 20, 15] },
        }),
      ]),
    );
    const [ranked] = courseCategories(fixture, state()).categories;
    expect(
      categoryResult(fixture, ranked, 'current', state()).percent,
    ).toBeCloseTo(78);
    const whatIfs = state({
      whatIf: { [String(second.id)]: 45, [String(third.id)]: 30 },
    });
    // Ordered 90, 78, 60 → (25·90 + 20·78 + 15·60) / 60.
    expect(
      categoryResult(fixture, ranked, 'projected', whatIfs).percent,
    ).toBeCloseTo((25 * 90 + 20 * 78 + 15 * 60) / 60);
  });

  it('drops ranked items beyond the last rank', () => {
    const midterms = group('Midterm Exams', 50, [
      item('Exam 1', 10, 10),
      item('Exam 2', 8, 10),
      item('Makeup', 2, 10),
    ]);
    const fixture = course(
      [midterms],
      policyOf([
        part({
          key: 'm',
          weight: 50,
          sources: [{ group: midterms.id }],
          scoring: { kind: 'ranked', weights: [30, 20] },
        }),
      ]),
    );
    const [ranked] = courseCategories(fixture, state()).categories;
    const result = categoryResult(fixture, ranked, 'current', state());
    expect(result.percent).toBeCloseTo((30 * 100 + 20 * 80) / 50);
    expect(result.dropped.has(midterms.items[2].id)).toBe(true);
  });

  it('pools scaled points, keeps the larger of either/or sources, and caps at full credit', () => {
    const webwork = group('WeBWorK', 0, [
      item('WebWork 1', 40, 40),
      item('WebWork 2', null, 60),
    ]);
    const mymathlab = group('MyMathLab', 0, [item('MML 1', null, 100)]);
    const quizzes = group('Studio Quizzes', 0, [
      item('Quiz 1', 3, 3),
      item('Quiz 2', 0, 3),
      item('Quiz 3', null, 60),
    ]);
    const fixture = course(
      [webwork, mymathlab, quizzes],
      policyOf([
        part({
          key: 'mqew',
          weight: 20,
          scoring: { kind: 'pool', cap: 20 },
          sources: [
            { group: mymathlab.id, scale: 0.2, choice: 'either-1' },
            { group: webwork.id, scale: 0.2, choice: 'either-1' },
            { group: quizzes.id },
          ],
        }),
      ]),
    );
    const [pool] = courseCategories(fixture, state()).categories;
    // Earned 8 + 3 = 11 of 8 + 6 = 14 available so far; MyMathLab (nothing earned) is the loser.
    const now = categoryResult(fixture, pool, 'current', state());
    expect(now.percent).toBeCloseTo((100 * 11) / 14);
    expect(now.dropped.has(mymathlab.items[0].id)).toBe(true);
    // Projected at 90%: 11 + 0.9·(60·0.2) + 0.9·60 = 75.8, capped at 20.
    expect(
      categoryResult(fixture, pool, 'projected', state({ assume: 90 })).percent,
    ).toBe(100);
    // Projected at 0%: 11 of 20.
    expect(
      categoryResult(fixture, pool, 'projected', state({ assume: 0 })).percent,
    ).toBeCloseTo(55);
  });

  it('caps a pool that already has enough points', () => {
    const quizzes = group('Quizzes', 0, [item('Quiz', 30, 30)]);
    const fixture = course(
      [quizzes],
      policyOf([
        part({
          key: 'q',
          weight: 10,
          scoring: { kind: 'pool', cap: 20 },
          sources: [{ group: quizzes.id }],
        }),
      ]),
    );
    const [pool] = courseCategories(fixture, state()).categories;
    expect(categoryResult(fixture, pool, 'current', state()).percent).toBe(100);
  });

  it('prefers the user’s cutoffs and credits, then the syllabus’s, then the defaults', () => {
    const fixture = course(
      [group('All', 100, [item('A', 1, 1)])],
      policyOf([part({ key: 'a', weight: 100, sources: [] })], {
        cutoffs: [93, 83, 73, 63],
        credits: 4,
      }),
    );
    expect(cutoffsFor(fixture, state())).toEqual([93, 83, 73, 63]);
    expect(creditsFor(fixture, state())).toBe(4);
    const mine = state({
      cutoffs: { [String(fixture.id)]: [90, 80, 70, 60] },
      credits: { [String(fixture.id)]: 1 },
    });
    expect(cutoffsFor(fixture, mine)).toEqual([90, 80, 70, 60]);
    expect(creditsFor(fixture, mine)).toBe(1);
    expect(cutoffsFor(course([]), state())).toEqual([90, 80, 70, 60]);
    expect(creditsFor(course([]), state())).toBe(3);
  });
});

const parsed = (
  components: Array<
    Partial<SyllabusComponent> & Pick<SyllabusComponent, 'label' | 'weight'>
  >,
  extra: Partial<ParsedSyllabus> = {},
): ParsedSyllabus => ({
  components: components.map((component) => ({
    count: null,
    each: null,
    rank: null,
    quote: component.label,
    ...component,
  })),
  cutoffs: [90, 80, 70, 60],
  cutoffsQuote: 'A: 90–100',
  credits: null,
  drops: [],
  pools: [],
  notes: [],
  ...extra,
});

describe('proposing a policy from a syllabus', () => {
  it('maps parts to Canvas groups by name, weight, and kind, keeping Canvas splits and drops', () => {
    const quizzes = group('Participation', 4, [item('Miniquiz 1', 5, 5)]);
    const homework = group('Homework', 12, [item('Homework 1', 90, 100)]);
    const midterms = group('Midterm Exams', 42, [item('Exam 01', 98, 100)]);
    const part1 = group('Final Exam - Part 1', 18, []);
    const part2 = group('Final Exam - Part 2', 24, [], 0);
    const activities = group(
      'Participation Activities',
      0,
      [item('Lecture quiz', 5, 5)],
      3,
    );
    const fixture = course([
      quizzes,
      homework,
      midterms,
      part1,
      part2,
      activities,
    ]);
    const { policy, report } = buildPolicy(
      parsed(
        [
          { label: 'Weekly Canvas Quizzes', weight: 4 },
          { label: 'Homework', weight: 12 },
          { label: 'Assessments', weight: 42, count: 3, each: 14 },
          { label: 'Final Exam', weight: 42 },
        ],
        {
          drops: [
            {
              target: 'homework',
              count: 1,
              quote: 'The lowest homework grade will be dropped',
            },
          ],
        },
      ),
      fixture,
      'syllabus.pdf',
    );
    expect(report).toEqual({ unmatched: [], total: 100 });
    expect(
      policy!.components.map((component) => [
        component.name,
        component.weight,
        component.sources,
        component.scoring.kind,
        component.dropLowest,
      ]),
    ).toEqual([
      ['Weekly Canvas Quizzes', 4, [{ group: quizzes.id }], 'points', 0],
      ['Homework', 12, [{ group: homework.id }], 'points', 1],
      ['Assessments', 42, [{ group: midterms.id }], 'equal', 0],
      ['Final Exam - Part 1', 18, [{ group: part1.id }], 'points', 0],
      ['Final Exam - Part 2', 24, [{ group: part2.id }], 'points', 0],
    ]);
    expect(policy!.cutoffs).toEqual([90, 80, 70, 60]);
  });

  it('claims named assignments, assignments of a kind, and leaves the rest to the last part', () => {
    const tests = [
      item('Test 1 -- MC', 24, 25),
      item('Test 1 -- essay', 25, 25),
    ];
    const diaries = [
      item('Week 1 -- Introduction', 4, 4),
      item('Week 2 -- Brains', 4, 4),
    ];
    const assignments = group('Assignments', 0, [...tests, ...diaries]);
    const fixture = course([assignments], null, false);
    const { policy, report } = buildPolicy(
      parsed([
        { label: 'Exams', weight: 75, count: 3, each: 25 },
        { label: 'Weekly class diaries', weight: 25 },
      ]),
      fixture,
      'syllabus.pdf',
    );
    expect(report.unmatched).toEqual([]);
    expect(policy!.components.map((component) => component.sources)).toEqual([
      [{ group: assignments.id, kind: 'exam' }],
      [{ group: assignments.id, rest: true }],
    ]);
    const adopted = { ...fixture, policy: policy! };
    // Exams (96% + 100%) / 2 = 98% at 75%, diaries 100% at 25%.
    expect(courseGrade(adopted, 'current', state())).toBeCloseTo(
      0.75 * 98 + 0.25 * 100,
    );
  });

  it('merges ranked lines and builds a points pool from the groups its sources name', () => {
    const midterms = group('Midterm Exams', 60, [item('Exam 1', 39, 50)]);
    const finalGroup = group('Course Grade', 20, [
      item('Final Course Grade', null, 100),
      item('Final Exam (includes bonus)', null, 100),
    ]);
    const webwork = group('WeBWorK', 0, [item('WebWork 1.1', 11, 11)]);
    const mymathlab = group('MyMathLab', 0, [item('MML 1.1', null, 11)]);
    const studio = group('Studio Quizzes', 0, [item('Quiz 9/1', 3, 3)]);
    const review = group(
      'WeBWorK Review Sets (not part of your course grade)',
      0,
      [item('Review', null, 5)],
    );
    const fixture = course([
      midterms,
      finalGroup,
      webwork,
      mymathlab,
      studio,
      review,
    ]);
    const { policy } = buildPolicy(
      parsed(
        [
          { label: 'MQEW Score', weight: 20 },
          { label: 'Best Midterm', weight: 25, rank: 'best' },
          { label: 'Middle Midterm', weight: 20, rank: 'middle' },
          { label: 'Worst Midterm', weight: 15, rank: 'worst' },
          { label: 'Final Exam', weight: 20 },
        ],
        {
          pools: [
            {
              target: 'MQEW',
              cap: 70,
              sources: ['MyMathLab', 'WeBWorK', 'In-studio Quizzes'],
              rates: { MyMathLab: 0.2, WeBWorK: 0.2 },
              alternatives: [['MyMathLab', 'WeBWorK']],
              quote: 'MQEW pts out of 70pts possible as a maximum',
            },
          ],
        },
      ),
      fixture,
      'syllabus.pdf',
    );
    expect(
      policy!.components.map((component) => [
        component.name,
        component.weight,
        component.scoring,
      ]),
    ).toEqual([
      ['MQEW Score', 20, { kind: 'pool', cap: 70 }],
      ['Midterms', 60, { kind: 'ranked', weights: [25, 20, 15] }],
      ['Final Exam', 20, { kind: 'points' }],
    ]);
    expect(policy!.components[0].sources).toEqual([
      { group: mymathlab.id, scale: 0.2, choice: 'either-1' },
      { group: webwork.id, scale: 0.2, choice: 'either-1' },
      { group: studio.id },
    ]);
    expect(policy!.components[2].sources).toEqual([
      { group: finalGroup.id, words: ['final', 'exam'] },
    ]);
    const view = courseCategories({ ...fixture, policy: policy! }, state());
    expect(view.uncounted.map((found) => found.title).sort()).toEqual([
      'Final Course Grade',
      'Review',
    ]);
  });

  it('proposes nothing without a grading breakdown', () => {
    expect(buildPolicy(parsed([]), course([]), 'syllabus.pdf')).toEqual({
      policy: null,
      report: { unmatched: [], total: 0 },
    });
  });
});

describe('policy validation', () => {
  it('accepts a proposal and rejects sources that mix a group and an assignment', () => {
    const valid = policyOf([
      part({
        key: 'homework',
        weight: 100,
        sources: [{ group: 1, kind: 'homework' }, { item: 2 }],
      }),
    ]);
    expect(gradePolicySchema.safeParse(valid).success).toBe(true);
    const mixed = policyOf([
      part({ key: 'homework', weight: 100, sources: [{ group: 1, item: 2 }] }),
    ]);
    expect(gradePolicySchema.safeParse(mixed).success).toBe(false);
    const narrowedItem = policyOf([
      part({
        key: 'homework',
        weight: 100,
        sources: [{ item: 2, words: ['final'] }],
      }),
    ]);
    expect(gradePolicySchema.safeParse(narrowedItem).success).toBe(false);
    const unknownKind = policyOf([
      part({
        key: 'homework',
        weight: 100,
        sources: [{ group: 1, kind: 'essays-and-stuff' }],
      }),
    ]);
    expect(gradePolicySchema.safeParse(unknownKind).success).toBe(false);
  });
});
