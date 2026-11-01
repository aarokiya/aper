import { describe, expect, it } from 'vitest';
import {
  arrangeCourse,
  assignmentMatchKey,
  categoryKey,
  categoryResult,
  courseGrade,
  DEFAULT_CALCULATOR_STATE,
  gpa,
  LEAVE_OUT,
  neededOnRemaining,
  type CalculatorState,
  type GradeCategory,
  type GradeCourse,
  type GradeItem,
} from '@/lib/grades/calculator';
import { matchCanvasAssignment } from '@/lib/gradescope/provider';

let nextId = 1;
const item = (score: number | null, possible: number, sourceId = String(nextId)): GradeItem => ({
  id: nextId++,
  sourceId,
  title: `Item ${sourceId}`,
  possible,
  possibleEstimated: false,
  score,
  scoreSource: score == null ? null : 'canvas',
  source: 'canvas',
  canvasScore: score,
  gradescope: null,
  sourceUrl: null,
  placement: null,
});
/** A Gradescope-only item the loader placed in `inferred`. */
const gradescopeItem = (score: number | null, possible: number, inferred: string): GradeItem => ({
  ...item(score, possible),
  scoreSource: score == null ? null : 'gradescope',
  source: 'gradescope',
  canvasScore: null,
  gradescope: { score, possible, url: null },
  placement: { inferred, confident: true },
});
const category = (weight: number, items: GradeItem[], extra: Partial<GradeCategory> = {}): GradeCategory => ({
  id: nextId++,
  name: `Category ${weight}`,
  weight,
  dropLowest: 0,
  dropHighest: 0,
  neverDrop: [],
  items,
  ...extra,
});
const course = (weighted: boolean, categories: GradeCategory[]): GradeCourse => ({
  id: nextId++,
  code: 'CS 0000',
  name: 'Fixture',
  origin: 'canvas',
  weighted,
  canvasScore: null,
  categories,
  policy: null,
  syllabi: [],
});
const state = (patch: Partial<CalculatorState> = {}): CalculatorState => ({ ...DEFAULT_CALCULATOR_STATE, ...patch });

describe('grade calculator', () => {
  it('rescales current weights over categories that have released scores', () => {
    const fixture = course(true, [category(20, [item(18, 20)]), category(80, [item(null, 100)])]);
    expect(courseGrade(fixture, 'current', state())).toBeCloseTo(90);
    // Projection fills the ungraded exam with the assumption: 0.2*90 + 0.8*70.
    expect(courseGrade(fixture, 'projected', state({ assume: 70 }))).toBeCloseTo(0.2 * 90 + 0.8 * 70);
  });

  it('pools points across categories when the course is not weighted', () => {
    const fixture = course(false, [category(0, [item(10, 10)]), category(0, [item(30, 90)])]);
    expect(courseGrade(fixture, 'current', state())).toBeCloseTo(40);
  });

  it('drops the lowest scores but never a protected item or the last remaining one', () => {
    const protectedItem = item(0, 10, 'keep');
    const graded = category(100, [protectedItem, item(2, 10), item(9, 10)], { dropLowest: 1, neverDrop: ['keep'] });
    const fixture = course(true, [graded]);
    const result = categoryResult(fixture, graded, 'current', state());
    expect(result.dropped.has(protectedItem.id)).toBe(false);
    expect(result.percent).toBeCloseTo(45);

    const single = category(100, [item(3, 10)], { dropLowest: 2 });
    expect(categoryResult(course(true, [single]), single, 'current', state()).percent).toBeCloseTo(30);
  });

  it('uses an item what-if before the assumption and a category what-if for empty categories', () => {
    const pending = item(null, 50);
    const empty = category(50, []);
    const fixture = course(true, [category(50, [pending]), empty]);
    const whatIfs = state({
      assume: 100,
      whatIf: { [String(pending.id)]: 40 },
      categoryWhatIf: { [`${fixture.id}:${empty.id}`]: 60 },
    });
    expect(courseGrade(fixture, 'projected', whatIfs)).toBeCloseTo(0.5 * 80 + 0.5 * 60);
    expect(courseGrade(fixture, 'current', whatIfs)).toBeNull();
  });

  it('solves for the uniform score needed on the remaining work', () => {
    const fixture = course(true, [category(50, [item(80, 100)]), category(50, [item(null, 100)])]);
    const needed = neededOnRemaining(fixture, 90, state());
    expect(needed.state).toBe('need');
    if (needed.state === 'need') expect(needed.percent).toBeCloseTo(100);
    expect(neededOnRemaining(fixture, 80, state()).state).toBe('need');
    expect(neededOnRemaining(fixture, 95, state()).state).toBe('out');
    expect(neededOnRemaining(fixture, 40, state()).state).toBe('locked');
  });

  it('weights GPA by credit hours using per-course cutoffs', () => {
    const strong = course(true, [category(100, [item(95, 100)])]);
    const weak = course(true, [category(100, [item(75, 100)])]);
    const custom = state({ credits: { [String(strong.id)]: 1 }, cutoffs: { [String(weak.id)]: [93, 75, 60, 50] } });
    // A (4) for 1 credit, B (3) for 3 credits.
    expect(gpa([strong, weak], 'current', custom)).toBeCloseTo((4 * 1 + 3 * 3) / 4);
  });

  it('moves a Gradescope-only item to the category the user picks, or leaves it out', () => {
    const homework = category(50, [item(10, 10)]);
    const quizzes = category(50, [item(5, 10)]);
    const fixture = course(true, [homework, quizzes]);
    // Inferred as homework: homework 10/10 + 0/10 = 50%, quizzes 50%.
    const stray = gradescopeItem(0, 10, categoryKey(fixture.id, homework));
    homework.items.push(stray);
    expect(courseGrade(fixture, 'current', state())).toBeCloseTo(50);

    const moved = state({ placement: { [String(stray.id)]: categoryKey(fixture.id, quizzes) } });
    const arranged = arrangeCourse(fixture, moved);
    expect(arranged.categories[1].items.map((entry) => entry.id)).toContain(stray.id);
    // Homework 100%, quizzes 5/20 = 25%.
    expect(courseGrade(fixture, 'current', moved)).toBeCloseTo(62.5);

    const leftOut = state({ placement: { [String(stray.id)]: LEAVE_OUT } });
    expect(arrangeCourse(fixture, leftOut).leftOut.map((entry) => entry.id)).toEqual([stray.id]);
    expect(courseGrade(fixture, 'current', leftOut)).toBeCloseTo(75);
  });

  it('ignores placement overrides on Canvas items and stale category keys', () => {
    const canvasItem = item(2, 10);
    const first = category(50, [canvasItem]);
    const fixture = course(true, [first, category(50, [item(10, 10)])]);
    const stray = gradescopeItem(10, 10, categoryKey(fixture.id, first));
    first.items.push(stray);
    const overrides = state({
      placement: { [String(canvasItem.id)]: LEAVE_OUT, [String(stray.id)]: `${fixture.id}:999999` },
    });
    // Both stay in the first category: 12/20 = 60%, second 100%.
    expect(courseGrade(fixture, 'current', overrides)).toBeCloseTo(80);
  });

  it('counts an ungraded Gradescope-only item as remaining work', () => {
    const quizzes = category(100, [item(8, 10)]);
    const fixture = course(true, [quizzes]);
    quizzes.items.push(gradescopeItem(null, 10, categoryKey(fixture.id, quizzes)));
    expect(courseGrade(fixture, 'current', state())).toBeCloseTo(80);
    expect(courseGrade(fixture, 'projected', state({ assume: 100 }))).toBeCloseTo(90);
    const needed = neededOnRemaining(fixture, 85, state());
    expect(needed.state).toBe('need');
    if (needed.state === 'need') expect(needed.percent).toBeCloseTo(90);
  });
});

describe('Gradescope to Canvas matching', () => {
  const canvas = (id: number, title: string, dueAt: string | null, tool = '') => ({ id, title, dueAt, tool });

  it('matches the same title due within five minutes', () => {
    const match = matchCanvasAssignment({ title: 'Homework 1', dueAt: '2026-09-05T03:59:00Z' }, [
      canvas(1, 'Homework 1', '2026-09-12T03:59:59Z'),
      canvas(2, 'homework 1 ', '2026-09-05T03:59:59Z'),
    ]);
    expect(match?.id).toBe(2);
  });

  it('matches a Turnitin Gradescope LTI link despite zero padding or a timezone-shifted due date', () => {
    const proxy = 'https://lti.int.turnitin.com/launch/gs-proxy external tool';
    expect(matchCanvasAssignment({ title: 'Exam 1', dueAt: null }, [canvas(7, 'Exam 01', null, proxy)])?.id).toBe(7);
    expect(
      matchCanvasAssignment({ title: 'Programming Exercise 00', dueAt: '2026-09-03T03:59:00Z' }, [
        canvas(8, 'Programming Exercise 00', '2026-09-03T00:00:00Z', proxy),
      ])?.id,
    ).toBe(8);
    expect(matchCanvasAssignment({ title: 'Exam 10', dueAt: null }, [canvas(9, 'Exam 1', null, proxy)])).toBeUndefined();
  });

  it('stays conservative without an LTI link', () => {
    // Same title, four hours apart, and Gradescope has a date: not the same assignment.
    expect(
      matchCanvasAssignment({ title: 'Quiz 3', dueAt: '2026-09-03T03:59:00Z' }, [
        canvas(1, 'Quiz 3', '2026-09-03T00:00:00Z'),
      ]),
    ).toBeUndefined();
    // Undated on Gradescope: an exact, unique title is enough.
    expect(matchCanvasAssignment({ title: 'Quiz 3', dueAt: null }, [canvas(1, 'Quiz 3', '2026-09-03T00:00:00Z')])?.id).toBe(1);
    expect(
      matchCanvasAssignment({ title: 'Quiz 3', dueAt: null }, [
        canvas(1, 'Quiz 3', '2026-09-03T00:00:00Z'),
        canvas(2, 'Quiz 3', '2026-10-03T00:00:00Z'),
      ]),
    ).toBeUndefined();
    expect(matchCanvasAssignment({ title: 'Quiz 03', dueAt: null }, [canvas(1, 'Quiz 3', null)])).toBeUndefined();
  });

  it('matches Gradescope and Canvas titles that differ only in zero padding and punctuation', () => {
    expect(assignmentMatchKey('Exam 01')).toBe(assignmentMatchKey('Exam 1'));
    expect(assignmentMatchKey('Programming Exercise 00')).toBe(assignmentMatchKey('programming exercise 0'));
    expect(assignmentMatchKey('Exam 1')).not.toBe(assignmentMatchKey('Exam 10'));
  });
});
