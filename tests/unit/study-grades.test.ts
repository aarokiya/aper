import { describe, expect, it } from 'vitest';
import { fmtPct, gradeModel, scorePct } from '@/lib/study/grades';
import { normalizeState } from '@/lib/study/model';
import type { StudyGrading, StudyGradingGroup } from '@/lib/study/types';

const group = (
  id: string,
  weight: number,
  ids: string[],
  extra: Partial<StudyGradingGroup> = {},
): StudyGradingGroup => ({
  id,
  h: id,
  weight,
  drop: 0,
  note: '',
  items: ids.map((item) => ({ id: item, t: item })),
  ...extra,
});

/** A common syllabus shape: Exam 4's optional Part B is averaged into the lowest of Exams 1–3. */
const exams = (weight = 100) =>
  group('exam', weight, ['e1', 'e2', 'e3', 'e4a'], {
    items: [
      ...['e1', 'e2', 'e3', 'e4a'].map((id) => ({ id, t: id })),
      { id: 'e4b', t: 'e4b', avgLowest: ['e1', 'e2', 'e3'] },
    ],
  });

const grading = (groups: StudyGradingGroup[]): StudyGrading => ({
  source: '',
  note: '',
  letters: { A: 90, B: 80, C: 70, D: 60, F: 0 },
  groups,
});

describe('typed scores', () => {
  it('reads points, percents, and bare numbers, and flags anything else', () => {
    expect(scorePct('17/20')).toBe(85);
    expect(scorePct(' 8 / 10 ')).toBe(80);
    expect(scorePct('95%')).toBe(95);
    expect(scorePct('17.5/25')).toBe(70);
    expect(scorePct('')).toBeNull();
    expect(scorePct('   ')).toBeNull();
    expect(scorePct('abc')).toBeNaN();
    expect(scorePct('17/0')).toBeNaN();
    expect(scorePct('1/2/3')).toBeNaN();
  });

  it('keeps typed scores through normalizeState and drops a malformed gb', () => {
    const gb = { hw1: '18/20', e4b: '90' };
    expect(normalizeState({ gb }).gb).toEqual(gb);
    expect(normalizeState({ gb: 'oops' }).gb).toEqual({});
    expect(normalizeState({}).gb).toEqual({});
  });
});

describe('the avgLowest (Part B) rule', () => {
  it('averages Part B into the lowest listed exam, never Part A', () => {
    const model = gradeModel(grading([exams()]), {
      e1: '72',
      e2: '88',
      e4a: '50',
      e4b: '90',
    });
    const rows = Object.fromEntries(
      model.groups[0].rows.map((row) => [row.item.id, row]),
    );
    expect(rows.e1.eff).toBe(81);
    expect(rows.e4a.eff).toBe(50);
    expect(rows.e4b.effect).toMatchObject({
      before: 72,
      after: 81,
      used: true,
    });
    // Part B isn't a fifth exam: (81 + 88 + 50) / 3
    expect(model.groups[0].avg).toBeCloseTo(73, 9);
  });

  it('changes nothing when Part B is not above the lowest exam', () => {
    const model = gradeModel(grading([exams()]), {
      e1: '72',
      e2: '88',
      e4b: '72',
    });
    expect(model.groups[0].rows[4].effect?.used).toBe(false);
    expect(model.groups[0].avg).toBe(80);
  });

  it('has no effect before any listed exam is scored', () => {
    const model = gradeModel(grading([exams()]), { e4a: '70', e4b: '95' });
    expect(model.groups[0].rows[4].effect).toBeUndefined();
    expect(model.groups[0].avg).toBe(70);
  });
});

describe('the course grade', () => {
  it('drops the lowest homework only once more than one is scored', () => {
    const hw = grading([group('hw', 100, ['hw1', 'hw2'], { drop: 1 })]);
    expect(gradeModel(hw, { hw1: '60' }).total).toBe(60);
    const both = gradeModel(hw, { hw1: '60', hw2: '90' });
    expect(both.total).toBe(90);
    expect(both.groups[0].rows[0].dropped).toBe(true);
  });

  it('leaves unscored groups out, ignores unreadable scores, and never rounds up', () => {
    const model = gradeModel(
      grading([group('quiz', 4, ['q1']), group('hw', 12, ['hw1']), exams(84)]),
      { hw1: 'abc', e1: '89.999' },
    );
    expect(model.total).toBeCloseTo(89.999, 9);
    expect(model.letter).toBe('B');
    expect(fmtPct(model.total ?? 0)).toBe('89.99%');
  });

  it('matches the standalone hub for the same scores', () => {
    // The hub's Grades view showed 86.11% B with Exam 1 raised to 81.00% for these scores.
    const model = gradeModel(
      grading([
        group('quiz', 4, ['sq', 'mq1', 'mq2']),
        group('hw', 12, ['hw1', 'hw2', 'hw3', 'hw4'], { drop: 1 }),
        exams(84),
      ]),
      {
        sq: '100',
        mq1: '10/10',
        mq2: '8 / 10',
        hw1: '18/20',
        hw2: '95%',
        hw3: '60',
        hw4: '100',
        e1: '72',
        e2: '88',
        e4b: '90',
      },
    );
    expect(fmtPct(model.total ?? 0)).toBe('86.11%');
    expect(model.letter).toBe('B');
  });
});
