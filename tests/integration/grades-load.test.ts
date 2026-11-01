import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type * as DbClient from '@/lib/db/client';
import * as calculator from '@/lib/grades/calculator';
import type * as GradeLoad from '@/lib/grades/load';
import type * as CanvasProvider from '@/lib/canvas/provider';
import type * as GradescopeProvider from '@/lib/gradescope/provider';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aper-grades-'));
process.env.ACADEMIC_DATA_DIR = sandbox;
process.env.ACADEMIC_DB_PATH = path.join(sandbox, 'academic.db');

let dbModule: typeof DbClient;
let loadModule: typeof GradeLoad;
let provider: typeof GradescopeProvider;
let canvas: typeof CanvasProvider;
const ids: Record<string, number> = {};
const at = '2026-09-01T12:00:00.000Z';

describe('grade calculator loader', () => {
  beforeAll(async () => {
    // Imported after the env vars above: the client resolves the database path at module load.
    dbModule = await import('@/lib/db/client');
    loadModule = await import('@/lib/grades/load');
    provider = await import('@/lib/gradescope/provider');
    canvas = await import('@/lib/canvas/provider');
    const { sqlite } = dbModule.initializeDatabase();
    const insertId = (sql: string, ...params: unknown[]) => {
      const row = sqlite.prepare(`${sql} RETURNING id`).get(...params) as {
        id: number;
      }; // RETURNING id always yields this row
      return row.id;
    };
    const addCourse = (
      providerName: string,
      sourceId: string,
      name: string,
      code: string,
      term: string,
      weighted = true,
    ) =>
      insertId(
        `INSERT INTO courses (source_provider,source_id,first_seen_at,last_seen_at,last_synced_at,name,course_code,term_name,is_current,provider_json) VALUES (?,?,?,?,?,?,?,?,1,?)`,
        providerName,
        sourceId,
        at,
        at,
        at,
        name,
        code,
        term,
        JSON.stringify({ apply_assignment_group_weights: weighted }),
      );
    const addGroup = (
      courseId: number,
      sourceId: string,
      name: string,
      weight: number,
      rules = '{}',
    ) =>
      insertId(
        `INSERT INTO assignment_groups (course_id,source_id,name,position,group_weight,rules_json) VALUES (?,?,?,1,?,?)`,
        courseId,
        sourceId,
        name,
        weight,
        rules,
      );
    const addAssignment = (
      courseId: number,
      providerName: string,
      sourceId: string,
      title: string,
      possible: number,
      score: number | null,
      options: {
        group?: number | null;
        providerJson?: string;
        excused?: number;
        submission?: string | false;
      } = {},
    ) => {
      const id = insertId(
        `INSERT INTO assignments (source_provider,source_id,first_seen_at,last_seen_at,last_synced_at,course_id,assignment_group_id,title,points_possible,provider_json) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        providerName,
        sourceId,
        at,
        at,
        at,
        courseId,
        options.group ?? null,
        title,
        possible,
        options.providerJson ?? '{}',
      );
      if (options.submission !== false)
        sqlite
          .prepare(
            `INSERT INTO submissions (assignment_id,provider_state,score,late,missing,excused,last_synced_at,provider_json) VALUES (?,?,?,0,0,?,?,?)`,
          )
          .run(
            id,
            score == null ? 'UNSUBMITTED' : 'GRADED',
            score,
            options.excused ?? 0,
            at,
            options.submission ?? null,
          );
      ids[sourceId] = id;
      return id;
    };

    const oop = addCourse(
      'canvas',
      'c1',
      'Probability and Stats - ISYE-2027-A',
      'ISYE-2027-A',
      'Spring 2027',
    );
    ids.oop = oop;
    addCourse(
      'canvas',
      'c2',
      'Career Services',
      'Career Services',
      'Default Term',
    );
    const exams = addGroup(oop, 'g1', 'Exams', 70, '{"drop_lowest":1}');
    ids.quizzes = addGroup(oop, 'g2', 'Quizzes', 30);
    addAssignment(oop, 'canvas', 'a1', 'Exam 01', 50, null, { group: exams });
    addAssignment(oop, 'canvas', 'a2', 'Exam 02', 100, 70, { group: exams });
    addAssignment(oop, 'canvas', 'a3', 'Exam 03', 100, null, {
      group: exams,
      excused: 1,
    });
    addAssignment(oop, 'canvas', 'a4', 'Practice exam', 100, 10, {
      group: exams,
      providerJson: '{"omit_from_final_grade":true}',
    });
    // Gradescope rows the sync did not merge into Canvas assignments.
    addAssignment(oop, 'gradescope', 'gs1', 'Exam 1', 100, 98);
    addAssignment(oop, 'gradescope', 'gs2', 'Exam 2', 100, 100);
    addAssignment(oop, 'gradescope', 'gs3', 'Quiz 7', 10, 9);
    addAssignment(oop, 'gradescope', 'gs4', 'Quiz 8', 10, null);
    addAssignment(oop, 'gradescope', 'gs5', 'Bonus reflection', 5, 5);
    // A Gradescope course row for the same class joins it by department and number.
    const gradescopeTwin = addCourse(
      'gradescope',
      'gc1',
      'Probability and Statistics',
      'ISYE 2027',
      'Spring 2027',
      false,
    );
    addAssignment(gradescopeTwin, 'gradescope', 'gs6', 'Quiz 9', 10, 8);
    // Gradescope-only classes: this term's stands alone, an old term's is ignored.
    const pathways = addCourse(
      'gradescope',
      'gc2',
      'Multivariable Calculus',
      'MATH 2551',
      'Spring 2027',
      false,
    );
    addAssignment(pathways, 'gradescope', 'gs7', 'Week 1 Participation', 5, 5);
    const old = addCourse(
      'gradescope',
      'gc3',
      'Intro to Computing',
      'CS 1301',
      'Spring 2026',
      false,
    );
    addAssignment(old, 'gradescope', 'gs8', 'Homework 1', 100, 100);

    // Canvas assignments for the sync-merge path, with Canvas's own submission JSON.
    const dsa = addCourse(
      'canvas',
      'c3',
      'Physics I - PHYS-2211-C',
      'PHYS-2211-C',
      'Spring 2027',
      false,
    );
    addAssignment(dsa, 'canvas', 'h1', 'Homework 1', 50, 40, {
      submission: '{"workflow_state":"graded","score":40}',
    });
    addAssignment(dsa, 'canvas', 'h2', 'Homework 2', 50, null, {
      submission: '{"workflow_state":"unsubmitted","score":null}',
    });
    addAssignment(dsa, 'canvas', 'h3', 'Homework 3', 50, null, {
      submission: false,
    });
    // A quiz awaiting manual grading: Canvas reports a partial auto-score of 0.
    addAssignment(dsa, 'canvas', 'q1', 'Workshop sign-in', 1, 0, {
      submission: '{"workflow_state":"pending_review","score":0}',
    });
  });

  afterAll(() => {
    dbModule.closeDatabaseForTests();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  const course = (code: string) => {
    const found = loadModule
      .loadGradeCourses()
      .find((entry) => entry.code === code);
    if (!found) throw new Error(`${code} not loaded`);
    return found;
  };
  const itemsOf = (entry: calculator.GradeCourse) =>
    entry.categories.flatMap((category) => category.items);
  const itemTitled = (entry: calculator.GradeCourse, title: string) => {
    const found = itemsOf(entry).find((item) => item.title === title);
    if (!found) throw new Error(`${title} not loaded`);
    return found;
  };

  it('loads current classes, merging a Gradescope course into its Canvas class', () => {
    const courses = loadModule.loadGradeCourses();
    expect(courses.map((entry) => entry.code)).toEqual([
      'ISYE 2027',
      'MATH 2551',
      'PHYS 2211',
    ]);
    const oop = course('ISYE 2027');
    expect(oop).toMatchObject({
      name: 'Probability and Stats',
      weighted: true,
      origin: 'canvas',
    });
    expect(itemsOf(oop).map((item) => item.title)).toEqual([
      'Exam 01',
      'Exam 02',
      'Quiz 7',
      'Quiz 8',
      'Quiz 9',
      'Bonus reflection',
    ]);
    expect(oop.categories[0].dropLowest).toBe(1);
    const pathways = course('MATH 2551');
    expect(pathways).toMatchObject({ origin: 'gradescope', weighted: false });
    expect(
      calculator.courseGrade(
        pathways,
        'current',
        calculator.DEFAULT_CALCULATOR_STATE,
      ),
    ).toBeCloseTo(100);
  });

  it("counts Canvas's score when both have one and Gradescope's when Canvas has none", () => {
    const oop = course('ISYE 2027');
    // Gradescope 98/100 scaled to the 50-point Canvas item.
    expect(itemTitled(oop, 'Exam 01')).toMatchObject({
      score: 49,
      scoreSource: 'gradescope',
      source: 'both',
      canvasScore: null,
      gradescope: { score: 98, possible: 100 },
    });
    // Canvas keeps its own score when Gradescope disagrees, and both values stay visible.
    expect(itemTitled(oop, 'Exam 02')).toMatchObject({
      score: 70,
      scoreSource: 'canvas',
      source: 'both',
      canvasScore: 70,
      gradescope: { score: 100, possible: 100 },
    });
  });

  it('does not count a partial score Canvas still has pending review', () => {
    expect(itemTitled(course('PHYS 2211'), 'Workshop sign-in')).toMatchObject({
      score: null,
      scoreSource: null,
      canvasScore: null,
    });
  });

  it('places Gradescope-only work in an inferred category and counts ungraded work as remaining', () => {
    const oop = course('ISYE 2027');
    const quizzes = oop.categories.find(
      (category) => category.id === ids.quizzes,
    )!;
    expect(quizzes.items.map((item) => item.title)).toEqual([
      'Quiz 7',
      'Quiz 8',
      'Quiz 9',
    ]);
    expect(itemTitled(oop, 'Quiz 7')).toMatchObject({
      source: 'gradescope',
      score: 9,
      placement: { inferred: `${oop.id}:${ids.quizzes}`, confident: true },
    });
    // No category fits, so it waits in the Gradescope bucket, which a weighted course does not count.
    expect(itemTitled(oop, 'Bonus reflection').placement).toEqual({
      inferred: `${oop.id}:gradescope`,
      confident: false,
    });

    const state = calculator.DEFAULT_CALCULATOR_STATE;
    // Exams: Exam 01 49/50 (Exam 02's 70% is dropped) = 98%. Quizzes: 17/20 = 85%.
    expect(calculator.courseGrade(oop, 'current', state)).toBeCloseTo(
      0.7 * 98 + 0.3 * 85,
    );
    // Quiz 8 is projected at the 90% assumption: 26/30.
    expect(calculator.courseGrade(oop, 'projected', state)).toBeCloseTo(
      0.7 * 98 + 0.3 * ((26 / 30) * 100),
    );
  });

  it('applies and persists a category override for a Gradescope-only item', () => {
    const oop = course('ISYE 2027');
    const saved = {
      ...loadModule.getCalculatorState(),
      placement: { [String(ids.gs5)]: `${oop.id}:${ids.quizzes}` },
    };
    loadModule.saveCalculatorState(saved);
    const state = loadModule.getCalculatorState();
    expect(state.placement).toEqual(saved.placement);
    // Quizzes: (9 + 8 + 5) / 25 = 88%.
    expect(calculator.courseGrade(oop, 'current', state)).toBeCloseTo(
      0.7 * 98 + 0.3 * 88,
    );
  });

  it('never lets a Gradescope sync overwrite a Canvas score', () => {
    const { sqlite } = dbModule.getDb();
    const submission = (id: number) =>
      sqlite
        .prepare(
          `SELECT score,json_extract(provider_json,'$.gradescope.score') AS gradescopeScore,json_extract(provider_json,'$.gradescope.filled') AS filled,json_extract(provider_json,'$.workflow_state') AS workflowState FROM submissions WHERE assignment_id=?`,
        )
        .get(id) as {
        score: number | null;
        gradescopeScore: number | null;
        filled: number;
        workflowState: string | null;
      };
    const observe = (id: number, title: string, score: number | null) =>
      provider.mergeGradescopeIntoCanvasSubmission(
        id,
        {
          sourceId: `gs-${title}`,
          title,
          sourceUrl: 'https://www.gradescope.com/courses/1/assignments/2',
          score,
          pointsPossible: 50,
        },
        score == null ? 'SUBMITTED' : 'GRADED',
        0,
        at,
      );

    // Canvas graded 40; Gradescope says 48. Canvas's score and JSON survive.
    observe(ids.h1, 'Homework 1', 48);
    expect(submission(ids.h1)).toEqual({
      score: 40,
      gradescopeScore: 48,
      filled: 0,
      workflowState: 'graded',
    });
    expect(itemTitled(course('PHYS 2211'), 'Homework 1')).toMatchObject({
      score: 40,
      scoreSource: 'canvas',
    });

    // Canvas has no score yet: Gradescope fills it.
    observe(ids.h2, 'Homework 2', 45);
    expect(submission(ids.h2)).toMatchObject({
      score: 45,
      gradescopeScore: 45,
      filled: 1,
    });
    // No Canvas submission row at all: one is created from Gradescope.
    observe(ids.h3, 'Homework 3', 30);
    expect(submission(ids.h3)).toMatchObject({ score: 30, filled: 1 });
    expect(itemTitled(course('PHYS 2211'), 'Homework 3')).toMatchObject({
      score: 30,
      scoreSource: 'gradescope',
    });

    // A later Canvas sync rewrites the row without a score; the Gradescope score still counts.
    sqlite
      .prepare(
        `UPDATE submissions SET score=NULL,provider_json='{"workflow_state":"unsubmitted","score":null}' WHERE assignment_id=?`,
      )
      .run(ids.h2);
    expect(itemTitled(course('PHYS 2211'), 'Homework 2')).toMatchObject({
      score: 45,
      scoreSource: 'gradescope',
      canvasScore: null,
    });

    // Canvas posts its own score, and the next Gradescope sync leaves it alone.
    sqlite
      .prepare(
        `UPDATE submissions SET score=42,provider_json='{"workflow_state":"graded","score":42}' WHERE assignment_id=?`,
      )
      .run(ids.h2);
    observe(ids.h2, 'Homework 2', 47);
    expect(submission(ids.h2)).toMatchObject({
      score: 42,
      gradescopeScore: 47,
      filled: 0,
    });
    expect(itemTitled(course('PHYS 2211'), 'Homework 2')).toMatchObject({
      score: 42,
      scoreSource: 'canvas',
      canvasScore: 42,
      gradescope: { score: 47, possible: 50 },
    });
  });

  it('reads calculator state saved before placements existed and ignores a corrupt value', () => {
    const { sqlite } = dbModule.getDb();
    sqlite
      .prepare(`UPDATE settings SET value=? WHERE key='grade-calculator'`)
      .run(
        JSON.stringify({
          assume: 75,
          whatIf: { '1': 42 },
          categoryWhatIf: {},
          credits: {},
          cutoffs: {},
          open: {},
        }),
      );
    expect(loadModule.getCalculatorState()).toMatchObject({
      assume: 75,
      whatIf: { '1': 42 },
      placement: {},
    });
    sqlite
      .prepare(
        `UPDATE settings SET value='{"assume":"high"}' WHERE key='grade-calculator'`,
      )
      .run();
    expect(loadModule.getCalculatorState().assume).toBe(90);
  });

  it('drops a class Canvas stops listing, though Gradescope still lists it', () => {
    // The student withdrew from PHYS 2211 (c3): Canvas's course list leaves it out.
    canvas.retireUnlistedCanvasCourses(['c1', 'c2']);
    expect(loadModule.loadGradeCourses().map((entry) => entry.code)).toEqual([
      'ISYE 2027',
      'MATH 2551',
    ]);
    const roster = (title: string, term: string | null = 'Spring 2027') => ({
      title,
      description: title,
      term,
    });
    expect(provider.isDroppedGradescopeCourse(roster('PHYS-2211-C'))).toBe(true);
    expect(provider.isDroppedGradescopeCourse(roster('ISYE-2027-A'))).toBe(
      false,
    );
    // Another term's section (a retake) and a class Canvas never had are synced.
    expect(
      provider.isDroppedGradescopeCourse(roster('PHYS-2211-C', 'Fall 2027')),
    ).toBe(false);
    expect(provider.isDroppedGradescopeCourse(roster('MATH-2551-A1'))).toBe(
      false,
    );
  });
});
