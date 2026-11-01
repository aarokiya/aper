import { describe, expect, it } from 'vitest';
import { extractArtifactCourses, extractArtifactProgress } from '@/lib/study/hub';
import { renderMathInHtml } from '@/lib/study/math';
import {
  blankState,
  checkPractice,
  courseLight,
  curWeek,
  eventsOn,
  lectureNames,
  nextExam,
  normalizeState,
  qcKey,
  reviewCount,
  reviewItems,
  topicStatus,
  weekLight,
  weekProg,
} from '@/lib/study/model';
import type {
  StudyCourse,
  StudyCourseState,
  StudyPractice,
  StudyWeek,
} from '@/lib/study/types';

const practice = (
  item: Partial<StudyPractice> & Pick<StudyPractice, 'type' | 'a'>,
): StudyPractice => ({ q: 'Q', ...item });

const week = (
  n: number,
  start: string,
  end: string,
  extra: Partial<StudyWeek> = {},
): StudyWeek => ({
  n,
  label: String(n),
  start,
  end,
  title: `Week ${n}`,
  secs: '',
  events: [],
  note: '',
  lectures: [],
  refs: [],
  practice: [],
  studio: [],
  cards: [],
  checks: [],
  exams: [],
  ...extra,
});

describe('practice checking', () => {
  it('accepts only the keyed option for multiple choice', () => {
    const item = practice({ type: 'mc', a: 2, opts: ['a', 'b', 'c'] });
    expect(checkPractice(item, '2')).toBe(true);
    expect(checkPractice(item, '1')).toBe(false);
  });

  it('compares numbers with a relative tolerance, ignoring thousands commas and unicode minus', () => {
    expect(checkPractice(practice({ type: 'num', a: 1234 }), '1,234')).toBe(
      true,
    );
    expect(checkPractice(practice({ type: 'num', a: -3 }), '\u22123')).toBe(
      true,
    );
    expect(checkPractice(practice({ type: 'num', a: -3 }), '\u20133.0')).toBe(
      true,
    );
    expect(
      checkPractice(practice({ type: 'num', a: 1e9 }), '1000000000.5'),
    ).toBe(true);
    expect(checkPractice(practice({ type: 'num', a: 2 }), '2.001')).toBe(false);
    expect(checkPractice(practice({ type: 'num', a: 0 }), 'zero')).toBe(false);
  });

  it('treats sets as unordered and ignores duplicates and braces', () => {
    const item = practice({ type: 'set', a: ['1', '2', '3'] });
    expect(checkPractice(item, '{3, 1, 2}')).toBe(true);
    expect(checkPractice(item, '3,3,2,1')).toBe(true);
    expect(checkPractice(item, '1, 2')).toBe(false);
    expect(checkPractice(item, '1, 2, 3, 4')).toBe(false);
  });

  it('matches text answers case-, space-, and quote-insensitively against every accepted form', () => {
    const item = practice({ type: 'text', a: ['p → q', 'not p or q'] });
    expect(checkPractice(item, 'P→Q')).toBe(true);
    expect(checkPractice(item, '"Not P or Q"')).toBe(true);
    expect(checkPractice(item, 'q → p')).toBe(false);
  });
});

describe('quick checks', () => {
  it('keys saved answers exactly as the standalone hub does', () => {
    // Expected values come from running the hub's fnv/qcKey (src/app.js) in node.
    expect(
      qcKey(
        { n: 5 },
        {
          q: '<p>Does <code>x ≥ 2</code> hold? — café 🎓</p>',
          opts: ['<code>true</code>', 'false', 'π ≈ 3.14'],
        },
      ),
    ).toBe('5-1yawuvk');
    expect(
      qcKey({ n: 12 }, { q: 'Type the value of <code>7 / 2</code> in Java.' }),
    ).toBe('12-1emv0lp');
  });

  it('keeps saved answers through normalizeState and drops a malformed lq', () => {
    const lq = { '5-1yawuvk': { a: '2', ok: false } };
    expect(normalizeState({ lq }).lq).toEqual(lq);
    expect(normalizeState({ lq: 'oops' }).lq).toEqual({});
    expect(normalizeState({ lq: [] }).lq).toEqual({});
    expect(normalizeState({}).lq).toEqual({});
  });
});

describe('week progress and the review queue', () => {
  const course = {
    weeks: [
      week(1, '2026-08-24', '2026-08-28', {
        practice: [
          practice({ type: 'num', a: 1 }),
          practice({ type: 'num', a: 2 }),
        ],
        studio: [
          { q: 'S1', steps: ['x'] },
          { q: 'S2', steps: ['y'] },
        ],
        cards: [{ f: 'f', b: 'b' }],
        checks: ['c'],
        exams: ['e1'],
      }),
      week(2, '2026-08-31', '2026-09-04', {
        practice: [practice({ type: 'num', a: 3 })],
      }),
    ],
  } as unknown as StudyCourse;

  it('counts every lecture, item, card, check, and exam toward the week', () => {
    const state = blankState();
    expect(weekProg(state, course.weeks[0])).toEqual({
      done: 0,
      total: 8,
      pct: 0,
    });
    state.lec[1] = true;
    state.ww['1-0'] = { a: '1', ok: true };
    state.st['1-0'] = 'got';
    state.cards['w1-0'] = 'know';
    state.chk['1-0'] = 1;
    state.ex.e1 = { ans: {}, pts: {}, rev: {}, sub: true, done: true };
    expect(weekProg(state, course.weeks[0])).toEqual({
      done: 6,
      total: 8,
      pct: 75,
    });
  });

  it('agrees with reviewItems on what needs review, from content or from counts', () => {
    const state = blankState();
    state.ww['1-0'] = { a: '0', ok: false };
    state.ww['1-1'] = { a: '2', ok: true };
    state.ww['2-0'] = { a: '9', ok: false };
    state.st['1-0'] = 'shaky';
    state.st['1-1'] = 'got';
    const items = reviewItems(course, state);
    expect(
      items.map(
        (item) => `${item.tab}:${item.week.n}-${item.index}:${item.tag}`,
      ),
    ).toEqual([
      'practice:1-0:Missed',
      'studio:1-0:Shaky',
      'practice:2-0:Missed',
    ]);
    expect(reviewCount(course.weeks, state)).toBe(items.length);
    const outline = course.weeks.map((item) => ({
      ...item,
      practice: item.practice.length,
      studio: item.studio.length,
      cards: item.cards.length,
      checks: item.checks.length,
    }));
    expect(reviewCount(outline, state)).toBe(items.length);
  });
});

describe('topic status, catch-up, and lights', () => {
  const labels = { lecture: 'Lecture', practice: 'WebWork', studio: 'Studio' };
  const full = week(4, '2026-09-28', '2026-10-02', {
    lectures: [{ title: 'Graphs', when: 'Mon 9/28', sec: '10.1', parts: [] }],
    checks: ['I can draw a graph'],
    practice: [practice({ type: 'num', a: 1 }), practice({ type: 'num', a: 2 })],
    studio: [{ q: 'S', steps: ['x'] }],
    cards: [{ f: 'f', b: 'b' }],
  });
  const finished = (): StudyCourseState => ({
    ...blankState(),
    lec: { 4: true },
    chk: { '4-0': 1 },
    ww: { '4-0': { a: '1', ok: true }, '4-1': { a: '2', ok: true } },
    st: { '4-0': 'got' },
    cards: { 'w4-0': 'know' },
  });

  it('lists what is left on each tab, in the hub’s order', () => {
    const status = topicStatus(labels, blankState(), full, '2026-09-30');
    expect(status.complete).toBe(false);
    expect(status.behind).toBe(false);
    expect(status.miss.map((item) => item.tab)).toEqual([
      'lecture',
      'lecture',
      'practice',
      'studio',
      'cards',
    ]);
  });

  it('completes a week only when every lecture, check, practice, studio, and card item is done', () => {
    expect(topicStatus(labels, finished(), full, '2026-10-05')).toEqual({
      complete: true,
      behind: false,
      miss: [],
    });
    const wrong = finished();
    wrong.ww['4-1'] = { a: '3', ok: false };
    const shaky = finished();
    shaky.st['4-0'] = 'shaky';
    const again = finished();
    again.cards['w4-0'] = 'again';
    const unchecked = { ...finished(), chk: {} };
    for (const state of [wrong, shaky, again, unchecked]) {
      const status = topicStatus(labels, state, full, '2026-10-05');
      expect(status.complete).toBe(false);
      expect(status.miss).toHaveLength(1);
    }
  });

  it('counts a week as behind only after its last day, from content or rail counts', () => {
    const counts = {
      n: 4,
      end: '2026-10-02',
      lectures: 1,
      practice: 2,
      studio: 1,
      cards: 1,
      checks: 1,
    };
    expect(topicStatus(labels, blankState(), counts, '2026-10-02').behind).toBe(
      false,
    );
    expect(topicStatus(labels, blankState(), counts, '2026-10-03').behind).toBe(
      true,
    );
    expect(topicStatus(labels, finished(), counts, '2026-10-03')).toEqual(
      topicStatus(labels, finished(), full, '2026-10-03'),
    );
  });

  it('lights a course red for a past incomplete week, yellow while this week is open, green when caught up', () => {
    const course = {
      code: 'TEST 1000',
      labels,
      weeks: [
        week(3, '2026-09-21', '2026-09-25', { lectures: full.lectures }),
        { ...full, events: [['Fri 10/2', 'Quiz 4']] as Array<[string, string]> },
      ],
    };
    const reviewed3 = { ...blankState(), lec: { 3: true } };
    expect(courseLight(course, blankState(), '2026-09-30').level).toBe('red');
    const open = courseLight(course, reviewed3, '2026-10-02');
    expect(open.level).toBe('yellow');
    expect(open.text).toContain('Quiz 4');
    expect(
      courseLight(course, { ...finished(), lec: { 3: true, 4: true } }, '2026-10-02')
        .level,
    ).toBe('green');
  });

  it('dots only weeks that are complete, behind, or under way', () => {
    expect(weekLight(labels, finished(), full, 4, '2026-10-01')?.level).toBe(
      'green',
    );
    expect(weekLight(labels, blankState(), full, 5, '2026-10-05')?.level).toBe(
      'red',
    );
    expect(weekLight(labels, blankState(), full, 4, '2026-09-30')?.level).toBe(
      'yellow',
    );
    expect(weekLight(labels, blankState(), full, 3, '2026-09-24')).toBeNull();
  });

  it('matches today’s events by their M/D label', () => {
    const events = {
      events: [
        ['Fri 10/2', 'Quiz'],
        ['Tue 10/20', 'Exam'],
        ['Fri 10/02', 'Padded'],
      ] as Array<[string, string]>,
    };
    expect(eventsOn(events, '2026-10-02')).toEqual(['Quiz']);
    expect(eventsOn(events, '2026-10-20')).toEqual(['Exam']);
  });

  it('names lectures from the dated schedule first, else from the notes', () => {
    const notes = [
      { title: 'This week in ABC 1234', when: '', sec: '', parts: [] },
      { title: "This week's notes", when: '', sec: '', parts: [] },
      { title: 'Recursion', when: '', sec: '', parts: [] },
    ];
    expect(
      lectureNames(
        week(6, '2026-10-05', '2026-10-09', {
          title: 'Objects',
          lectures: notes,
          events: [
            ['Tue 10/6', 'Lecture: Classes'],
            ['Wed 10/7', 'Recitation'],
          ],
        }),
      ),
    ).toEqual(['Tue 10/6: Classes']);
    expect(
      lectureNames(
        week(6, '2026-10-05', '2026-10-09', { title: 'Objects', lectures: notes }),
      ),
    ).toEqual(['Objects', 'Recursion']);
  });
});

describe('bundled hub progress', () => {
  it('reads window.SEED_PROGRESS from a built hub, and nothing from older exports', () => {
    const seed = { format: 'gt-study-hub-progress', version: 1, c: {} };
    const html = `<script>window.COURSES = [];</script><script>window.SEED_PROGRESS = ${JSON.stringify(seed)};</script><script>(function(){})()</script>`;
    expect(extractArtifactProgress(html)).toEqual(seed);
    expect(
      extractArtifactProgress('<script>window.COURSES = [];</script>'),
    ).toBeNull();
  });
});

describe('dates', () => {
  const weeks = [
    week(1, '2026-08-24', '2026-08-28'),
    week(2, '2026-08-31', '2026-09-04'),
  ];

  it('keeps a week current through its last day, then moves on; falls back to the last week', () => {
    expect(curWeek(weeks, '2026-08-01')).toBe(1);
    expect(curWeek(weeks, '2026-08-28')).toBe(1);
    expect(curWeek(weeks, '2026-08-29')).toBe(2);
    expect(curWeek(weeks, '2026-12-01')).toBe(2);
  });

  it('honours a real date the student set over the estimated one', () => {
    const exams = [
      { id: 'a', title: 'Midterm 1', date: '2026-09-16T18:30', dateEst: true },
      { id: 'b', title: 'Midterm 2', date: '2026-10-14' },
    ];
    const state = blankState();
    expect(nextExam(exams, state, '2026-09-10')?.exam.id).toBe('a');
    state.dates.a = '2026-10-20';
    expect(nextExam(exams, state, '2026-09-10')?.exam.id).toBe('b');
    expect(nextExam(exams, state, '2026-10-15')?.exam.id).toBe('a');
    expect(nextExam(exams, state, '2026-12-01')?.exam.id).toBe('a');
  });
});

describe('math rendering', () => {
  it('typesets TeX in prose but leaves code untouched', () => {
    const html = renderMathInHtml(
      '<p>Let $x^2$ be.</p><pre><code>cost = $5 + $6;</code></pre><code>$y$</code>',
    );
    expect(html).toContain('class="katex"');
    expect(html).toContain('<pre><code>cost = $5 + $6;</code></pre>');
    expect(html).toContain('<code>$y$</code>');
  });
});

describe('artifact import', () => {
  it('pulls the course array and title out of the artifact HTML', () => {
    const html = `<html><head><title>Spring 2027 Study Hub</title></head><body><script>window.COURSES = [{"id":"abc1234","code":"ABC 1234"}];</script><script>(function(){})()</script></body></html>`;
    expect(extractArtifactCourses(html)).toEqual({
      title: 'Spring 2027 Study Hub',
      courses: [{ id: 'abc1234', code: 'ABC 1234' }],
    });
  });

  it('explains what is wrong when the data block is missing', () => {
    expect(() => extractArtifactCourses('<html></html>')).toThrow(
      /window\.COURSES/,
    );
  });
});
