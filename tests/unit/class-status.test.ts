import { describe, expect, it } from 'vitest';
import {
  classStatus,
  tallyClassWork,
  weekRanges,
  type StudyPace,
  type WorkRow,
} from '@/lib/study/class-status';
import { blankState } from '@/lib/study/model';
import type { StudyCourseState } from '@/lib/study/types';

// Local wall time, so day boundaries hold in any test time zone.
const NOW = new Date(2026, 9, 2, 13, 0);
const at = (hours: number) => new Date(2026, 9, 2, hours, 0).toISOString();

const row = (dueAt: string, extra: Partial<WorkRow> = {}): WorkRow => ({
  courseId: 1,
  dueAt,
  providerState: 'UNSUBMITTED',
  workflowStatus: 'NOT_STARTED',
  ...extra,
});

describe('open work per class', () => {
  it('splits overdue from due later today and skips finished or later work', () => {
    expect(
      tallyClassWork(
        [
          row(at(9)),
          row(new Date(2026, 9, 1, 23, 59).toISOString()),
          row(at(23)),
          row(at(9), { providerState: 'SUBMITTED' }),
          row(at(9), { workflowStatus: 'DONE_LOCALLY' }),
          row(new Date(2026, 9, 3, 0, 30).toISOString()),
          row(at(20), { courseId: 2 }),
        ],
        NOW,
      ),
    ).toEqual({
      1: { overdue: 2, dueToday: 1 },
      2: { overdue: 0, dueToday: 1 },
    });
  });
});

type PaceWeek = StudyPace['weeks'][number];

const paceWeek = (
  n: number,
  start: string,
  end: string,
  extra: Partial<PaceWeek> = {},
): PaceWeek => ({
  n,
  start,
  end,
  events: [],
  lectures: 1,
  practice: 0,
  studio: 0,
  cards: 0,
  checks: 0,
  ...extra,
});

// Week 4 (Sep 28 – Oct 2) is the current week on Oct 2.
const pace = (): StudyPace => ({
  code: 'TEST 1000',
  labels: { lecture: 'Lecture', practice: 'Practice', studio: 'Studio' },
  weeks: [
    paceWeek(1, '2026-09-07', '2026-09-11', { practice: 1 }),
    paceWeek(2, '2026-09-14', '2026-09-18'),
    paceWeek(3, '2026-09-21', '2026-09-25'),
    paceWeek(4, '2026-09-28', '2026-10-02', {
      events: [
        ['Wed 9/30', 'Recitation'],
        ['Fri 10/2', 'Quiz 4'],
        ['Fri 10/2', 'Lecture: Graphs'],
      ],
    }),
    paceWeek(5, '2026-10-05', '2026-10-09'),
  ],
});

/** Lectures reviewed for `weeks`, plus week 1's practice answered correctly. */
const done = (...weeks: number[]): StudyCourseState => ({
  ...blankState(),
  lec: Object.fromEntries(weeks.map((n) => [n, true])),
  ww: { '1-0': { a: '1', ok: true } },
});

describe('class status', () => {
  it('is caught up with nothing open', () => {
    expect(classStatus({ today: '2026-10-02' })).toEqual({
      level: 'clear',
      behind: [],
      today: [],
      week: null,
    });
    expect(
      classStatus({ work: { overdue: 0, dueToday: 0 }, today: '2026-10-02' })
        .level,
    ).toBe('clear');
  });

  it('puts overdue work ahead of work due today', () => {
    expect(
      classStatus({ work: { overdue: 1, dueToday: 2 }, today: '2026-10-02' }),
    ).toEqual({
      level: 'behind',
      behind: ['1 overdue assignment'],
      today: ['2 assignments'],
      week: null,
    });
  });

  it('is behind on every ended week that is not complete, not just unreviewed lectures', () => {
    const answeredWrong = {
      ...done(1, 2, 3),
      ww: { '1-0': { a: '2', ok: false } },
    };
    expect(
      classStatus({
        study: { course: pace(), state: answeredWrong },
        today: '2026-10-02',
      }),
    ).toMatchObject({ level: 'behind', behind: ['week 1 not complete'] });
    expect(
      classStatus({
        study: { course: pace(), state: done(2) },
        today: '2026-10-03',
      }).behind,
    ).toEqual(['weeks 1, 3–4 not complete']);
  });

  it('shows the current week in progress with today’s schedule, and clears once it is complete', () => {
    expect(
      classStatus({
        study: { course: pace(), state: done(1, 2, 3) },
        today: '2026-10-02',
      }),
    ).toMatchObject({
      level: 'today',
      week: { n: 4, events: ['Quiz 4', 'Lecture: Graphs'] },
    });
    expect(
      classStatus({
        study: { course: pace(), state: done(1, 2, 3) },
        today: '2026-09-29',
      }).week,
    ).toEqual({ n: 4, events: [] });
    expect(
      classStatus({
        study: { course: pace(), state: done(1, 2, 3, 4) },
        today: '2026-10-02',
      }),
    ).toMatchObject({ level: 'clear', week: null });
  });

  it('is caught up between weeks when every ended week is complete', () => {
    expect(
      classStatus({
        study: { course: pace(), state: done(1, 2, 3, 4) },
        today: '2026-10-04',
      }).level,
    ).toBe('clear');
  });

  it('reports ended weeks over the week in progress, alongside Canvas work', () => {
    expect(
      classStatus({
        work: { overdue: 0, dueToday: 1 },
        study: { course: pace(), state: done(1, 2) },
        today: '2026-10-02',
      }),
    ).toEqual({
      level: 'behind',
      behind: ['week 3 not complete'],
      today: ['1 assignment'],
      week: null,
    });
  });
});

describe('week ranges', () => {
  it('collapses runs', () => {
    expect(weekRanges([5, 1, 3, 2])).toBe('1–3, 5');
    expect(weekRanges([7])).toBe('7');
    expect(weekRanges([])).toBe('');
  });
});
