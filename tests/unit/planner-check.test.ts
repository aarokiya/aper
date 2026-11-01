import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  academicYears,
  checkRequirements,
  courseCodes,
  currentTermId,
  nextTermId,
  planTotals,
  term90Index,
  termStart,
} from '@/lib/planner/check';
import { planSchema, plannerFileSchema, type Plan } from '@/lib/planner/types';

const file = plannerFileSchema.parse(
  JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/planner-file.json'),
      'utf8',
    ),
  ),
);

/** A copy of the fixture plan with `change` applied. */
function planWith(change: (plan: Plan) => void) {
  const plan = structuredClone(file.plan);
  change(plan);
  return plan;
}

describe('course codes in plan rows', () => {
  it('reads shorthand lists, cross-listings, and placeholder codes', () => {
    expect(courseCodes('CS 4210 or 4220 or 4290 (Advanced Systems)')).toEqual([
      'CS 4210',
      'CS 4220',
      'CS 4290',
    ]);
    expect(courseCodes('ISYE 2027 and 3030')).toEqual([
      'ISYE 2027',
      'ISYE 3030',
    ]);
    expect(courseCodes('MATH 3215, MATH 3670, CEE/ISYE 3770')).toEqual([
      'MATH 3215',
      'MATH 3670',
      'ISYE 3770',
    ]);
    expect(courseCodes('HTS 1XXX Social Science Elective')).toEqual([
      'HTS 1XXX',
    ]);
    expect(courseCodes('PHYS 1111K and BIOS 1107/L')).toEqual([
      'PHYS 1111K',
      'BIOS 1107',
    ]);
  });

  it('ignores words and years that only look like codes', () => {
    expect(courseCodes('Junior Design (Part 1)')).toEqual([]);
    expect(courseCodes('Elective for Fall 2027')).toEqual([]);
    expect(courseCodes('cs 1332 data structures')).toEqual(['CS 1332']);
  });
});

describe('requirement matching', () => {
  it('lets each requirement take its best rows, and counts a row once', () => {
    const results = checkRequirements(file.plan, file);
    // POL 1101 (transfer) beats the planned HIST row for Political Science...
    expect(results.polsci.status).toBe('done');
    expect(results.polsci.take.map((ref) => ref.row.n)).toEqual([
      'POL 1101 Government',
    ]);
    // ...so HIST still counts toward Social Sciences: 3 in progress + 3 planned of 9.
    expect(results.socsci).toMatchObject({ status: 'miss', got: 6, need: 9 });
    expect(results.cs1332.status).toBe('plan');
    expect(results.wellness.status).toBe('plan');
  });

  it('lets shared areas double-count a course another requirement used', () => {
    const results = checkRequirements(file.plan, file);
    expect(results.glr_history.status).toBe('plan');
    expect(results.glr_history.take.map((ref) => ref.block)).toEqual(['S27']);
  });

  it('rates a requirement by its weakest counted row', () => {
    const plan = planWith((draft) => {
      draft.terms[0].rows.push({
        n: 'HIST 2112 U.S. since 1877',
        h: 3,
        k: 'IP',
      });
    });
    const results = checkRequirements(plan, file);
    // ECON 2100 (IP) + HIST 2112 (IP) + HIST 2111 (planned) = 9 hours, one still planned.
    expect(results.socsci).toMatchObject({ status: 'plan', got: 9 });
    const done = planWith((draft) => {
      draft.terms[0].rows[0].k = 'C';
      draft.terms[1].rows[1].k = 'C';
      draft.terms[0].rows.push({
        n: 'HIST 2112 U.S. since 1877',
        h: 3,
        k: 'IP',
      });
    });
    expect(checkRequirements(done, file).socsci.status).toBe('ip');
  });

  it('counts an unnamed row toward the requirement it was added for', () => {
    const unnamed = planWith((draft) => {
      // Its name matches no requirement, so only its `r` link places it.
      draft.terms[2].rows[1] = {
        n: 'Elective TBD',
        h: 3,
        k: '',
        r: 'approaches',
      };
    });
    expect(checkRequirements(unnamed, file).approaches).toMatchObject({
      status: 'miss',
      got: 1,
      need: 2,
    });
    const filled = planWith((draft) => {
      draft.terms[2].rows[1] = {
        n: 'Elective TBD',
        h: 3,
        k: '',
        r: 'approaches',
      };
      draft.terms[2].rows.push({ n: 'CS 4644 Deep Learning', h: 3, k: '' });
    });
    expect(checkRequirements(filled, file).approaches.status).toBe('plan');
  });

  it('follows a renamed row to the requirement its new code belongs to', () => {
    const plan = planWith((draft) => {
      // Added for wellness, then renamed to an Approaches course.
      draft.terms[2].rows[0] = {
        n: 'CS 4650 Natural Language',
        h: 3,
        k: '',
        r: 'wellness',
      };
    });
    const results = checkRequirements(plan, file);
    expect(results.wellness.status).toBe('miss');
    expect(results.approaches.got).toBe(2);
  });

  it('meets a lab sequence with an allowable pair, including elective credit', () => {
    expect(checkRequirements(file.plan, file).labseq.status).toBe('miss');
    const paired = planWith((draft) => {
      draft.terms[3].rows.push({ n: 'BIOS 1108/L Biology II', h: 4, k: '' });
    });
    const results = checkRequirements(paired, file);
    expect(results.labseq.status).toBe('plan');
    expect(results.labseq.take.map((ref) => ref.block).sort()).toEqual([
      'S28',
      'extra',
    ]);
    const placeholder = planWith((draft) => {
      draft.terms[3].rows.push({ n: 'Lab Science (see Note 1)', h: 4, k: '' });
    });
    expect(checkRequirements(placeholder, file).labseq.status).toBe('plan');
  });
});

describe('plan dates and totals', () => {
  it('finds the current and next terms from the date', () => {
    const fall = new Date(2026, 9, 5);
    expect(currentTermId(file.plan, fall)).toBe('F26');
    expect(nextTermId(file.plan, fall)).toBe('S27');
    const spring = new Date(2027, 1, 1);
    expect(currentTermId(file.plan, spring)).toBe('S27');
    expect(nextTermId(file.plan, spring)).toBe('F27');
    const before = new Date(2026, 4, 1);
    expect(currentTermId(file.plan, before)).toBeNull();
    expect(nextTermId(file.plan, before)).toBe('F26');
  });

  it('finds the term in which earned hours reach 90', () => {
    expect(term90Index(file.plan)).toBe(-1);
    const fall = planWith((draft) => {
      draft.xfer.push({ n: 'Prior credit', h: 74, k: 'T' });
    });
    // 85 hours before the first term (F26), 91 after it.
    expect(term90Index(fall)).toBe(0);
    const spring = planWith((draft) => {
      draft.xfer.push({ n: 'Prior credit', h: 74, k: 'T' });
      draft.terms[0].rows = [];
    });
    expect(term90Index(spring)).toBe(1);
  });

  it('totals hours by tag and leaves elective credit out of the degree', () => {
    expect(planTotals(file.plan)).toEqual({
      done: 7,
      inProgress: 6,
      planned: 11,
      total: 126,
      remaining: 113,
      surplus: 4,
    });
  });
});

describe('summer terms', () => {
  /** The fixture plan with Summer 2027 between Spring 2027 and Fall 2027. */
  const withSummer = () =>
    planWith((draft) => {
      draft.terms.splice(2, 0, {
        id: 'U27',
        label: 'Summer 2027',
        rows: [{ n: 'HIST 2112 U.S. since 1877', h: 3, k: '' }],
      });
    });

  it('accepts a summer term between spring and fall, and only in time order', () => {
    expect(planSchema.safeParse(withSummer()).success).toBe(true);
    const outOfOrder = planWith((draft) => {
      draft.terms.splice(1, 0, { id: 'U27', label: 'Summer 2027', rows: [] });
    });
    expect(planSchema.safeParse(outOfOrder).success).toBe(false);
    const badId = planWith((draft) => {
      draft.terms.push({ id: 'W28', label: 'Winter 2028', rows: [] });
    });
    expect(planSchema.safeParse(badId).success).toBe(false);
  });

  it('starts spring in January, summer in May, and fall in August', () => {
    expect(termStart('S27')).toEqual(new Date(2027, 0, 1));
    expect(termStart('U27')).toEqual(new Date(2027, 4, 15));
    expect(termStart('F27')).toEqual(new Date(2027, 7, 15));
    expect(termStart('X27')).toBeNull();
  });

  it('finds the current and next terms around a summer', () => {
    const plan = withSummer();
    const lateSpring = new Date(2027, 3, 20);
    expect(currentTermId(plan, lateSpring)).toBe('S27');
    expect(nextTermId(plan, lateSpring)).toBe('U27');
    const summer = new Date(2027, 5, 10);
    expect(currentTermId(plan, summer)).toBe('U27');
    expect(nextTermId(plan, summer)).toBe('F27');
  });

  it('counts summer courses toward requirements in term order', () => {
    const results = checkRequirements(withSummer(), file);
    // ECON 2100 (IP), HIST 2111 or 2112 (S27), and HIST 2112 (U27) make 9 hours.
    expect(results.socsci).toMatchObject({ status: 'plan', got: 9 });
    expect(results.socsci.take.map((ref) => ref.block)).toEqual([
      'F26',
      'S27',
      'U27',
    ]);
    expect(planTotals(withSummer()).planned).toBe(14);
  });

  it('groups terms into academic years with a summer column only when needed', () => {
    const plain = academicYears(file.plan.terms);
    expect(plain.seasons).toBe(2);
    expect(
      plain.years.map((year) => year.map((term) => term?.id ?? null)),
    ).toEqual([
      ['F26', 'S27'],
      ['F27', 'S28'],
    ]);
    const summer = academicYears(withSummer().terms);
    expect(summer.seasons).toBe(3);
    expect(
      summer.years.map((year) => year.map((term) => term?.id ?? null)),
    ).toEqual([
      ['F26', 'S27', 'U27'],
      ['F27', 'S28', null],
    ]);
    // A plan that starts in spring leaves its first fall empty.
    const springStart = academicYears(file.plan.terms.slice(1));
    expect(
      springStart.years.map((year) => year.map((term) => term?.id ?? null)),
    ).toEqual([
      [null, 'S27'],
      ['F27', 'S28'],
    ]);
  });
});
