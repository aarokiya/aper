import { describe, expect, it } from 'vitest';
import { blankState, normalizeState, qcKey } from '@/lib/study/model';
import {
  customSessionSchema,
  studyPrefsSchema,
  type StudyPrefs,
} from '@/lib/study/prefs-schema';
import {
  buildCustomQueue,
  buildDailyQueue,
  courseItems,
  dailyCounts,
  dayLogs,
  forecast,
  formatInterval,
  intervalPreview,
  isNewMemory,
  itemKey,
  memoryOf,
  nextDayStart,
  rate,
  rateIfNew,
  resetItem,
  seededShuffle,
  setSuspended,
  stateCounts,
  streak,
  studyDay,
  undoRating,
  userCardItems,
  type StudyItem,
} from '@/lib/study/srs';
import type {
  SrsMemory,
  StudyCourse,
  StudyCourseState,
  StudyQuickCheck,
  StudyWeek,
} from '@/lib/study/types';

const DAY = 86_400_000;
/** Mon Oct 19 2026, local noon. */
const NOW = new Date(2026, 9, 19, 12, 0).getTime();
const TODAY = '2026-10-19';

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

const standaloneQc: StudyQuickCheck = {
  q: 'Which keyword creates an object?',
  type: 'text',
  a: ['new'],
};
const contextQc: StudyQuickCheck = {
  q: 'In the code above, what is printed?',
  type: 'text',
  a: ['3'],
};

const cards = (n: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    f: `<p>W${n} front ${i}</p>`,
    b: `<p>back ${i}</p>`,
  }));

const course = (id = 'cs1000'): StudyCourse => ({
  id,
  code: id.toUpperCase(),
  name: 'Synthetic course',
  who: '',
  math: false,
  labels: { lecture: 'Lecture', practice: 'Practice', studio: 'Studio' },
  book: ['Book', null],
  tutor: '',
  weeks: [
    week(1, '2026-08-17', '2026-08-23', {
      cards: cards(1, 2),
      practice: [{ q: '<p>2 + 2?</p>', type: 'num', a: 4 }],
      lectures: [
        {
          title: 'L1',
          when: '',
          sec: '',
          parts: [
            { h: 'Part', b: '<p>Notes</p>', quiz: [standaloneQc, contextQc] },
          ],
        },
      ],
      parsons: [
        {
          title: 'Swap',
          q: '<p>Swap a and b.</p>',
          lines: ['int t = a;', 'a = b;', 'b = t;'],
        },
      ],
    }),
    week(9, '2026-10-19', '2026-10-25', { cards: cards(9, 3) }),
    week(10, '2026-10-26', '2026-11-01', { cards: cards(10, 2) }),
  ],
  exams: {},
  formulas: [{ h: 'Group', rows: [['<p>F</p>', '<p>B</p>']] }],
  materials: [],
  pages: [],
  missing: [],
});

const prefsWith = (input: Record<string, unknown> = {}): StudyPrefs =>
  studyPrefsSchema.parse(input);

const review = (due: number, extra: Partial<SrsMemory> = {}): SrsMemory => ({
  due,
  s: 5,
  d: 5,
  st: 2,
  ls: 0,
  sd: 5,
  r: 2,
  l: 0,
  lr: due - 5 * DAY,
  ...extra,
});

const find = (items: StudyItem[], key: string) => {
  const item = items.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`missing item ${key}`);
  return item;
};

const keysOf = (entries: Array<{ key: string }>) =>
  entries.map((entry) => entry.key);

describe('study items', () => {
  const c = course();
  const items = courseItems(c);

  it('keys every content item with its kind prefix and legacy key', () => {
    expect(itemKey('card', 'w1-0')).toBe('c:w1-0');
    expect(keysOf(items)).toEqual([
      `q:${qcKey({ n: 1 }, standaloneQc)}`,
      `q:${qcKey({ n: 1 }, contextQc)}`,
      'c:w1-0',
      'c:w1-1',
      'p:1-0',
      'z:1-0',
      'c:w9-0',
      'c:w9-1',
      'c:w9-2',
      'c:w10-0',
      'c:w10-1',
      'c:f0-0',
    ]);
    expect(new Set(items.map((item) => item.order)).size).toBe(items.length);
    expect([...items].sort((a, b) => a.order - b.order)).toEqual(items);
  });

  it('links each kind to where it lives and marks context-dependent quick checks', () => {
    expect(items[0].href).toBe('/study/cs1000/week/1?tab=lecture');
    expect(items[0].standalone).toBe(true);
    expect(items[1].standalone).toBe(false);
    expect(find(items, 'c:w1-0').href).toBe('/study/cs1000/week/1?tab=cards');
    expect(find(items, 'p:1-0').href).toBe('/study/cs1000/week/1?tab=practice');
    expect(find(items, 'z:1-0').href).toBe('/study/cs1000/week/1?tab=parsons');
    expect(find(items, 'z:1-0').label).toBe('Swap');
    expect(find(items, 'c:f0-0')).toMatchObject({
      href: '/study/cs1000/formulas',
      week: null,
      start: null,
      label: 'F',
    });
    expect(find(items, 'c:w9-0').label).toBe('W9 front 0');
  });

  it('keeps a quick check that refers to code above standalone when it has its own code', () => {
    const c2 = course();
    c2.weeks[0].lectures[0].parts[0].quiz = [
      {
        ...contextQc,
        q: '<pre><code>int x = 3;</code></pre><p>Above, x is?</p>',
      },
    ];
    expect(courseItems(c2)[0].standalone).toBe(true);
  });

  it('memoizes items per course object', () => {
    expect(courseItems(c)).toBe(items);
    expect(courseItems(course())).not.toBe(items);
  });

  it('turns user cards into items without links, with week dates when known', () => {
    const list = userCardItems(
      'cs1000',
      {
        b1: { f: 'Second', b: 'x', t: 20 },
        a1: { f: 'First', b: 'y', t: 10, w: 9 },
      },
      course().weeks,
    );
    expect(list.map((item) => [item.key, item.href, item.start])).toEqual([
      ['u:a1', null, '2026-10-19'],
      ['u:b1', null, null],
    ]);
  });
});

describe('study days', () => {
  it('starts the study day at dayStartsAt', () => {
    const early = new Date(2026, 9, 19, 3, 30).getTime();
    expect(studyDay(early, 4)).toBe('2026-10-18');
    expect(studyDay(early, 0)).toBe('2026-10-19');
    expect(studyDay(NOW, 4)).toBe(TODAY);
    expect(nextDayStart(early, 4)).toBe(new Date(2026, 9, 19, 4).getTime());
    expect(nextDayStart(NOW, 4)).toBe(new Date(2026, 9, 20, 4).getTime());
  });

  it('formats intervals compactly', () => {
    expect(formatInterval(30_000)).toBe('1m');
    expect(formatInterval(10 * 60_000)).toBe('10m');
    expect(formatInterval(5 * 3_600_000)).toBe('5h');
    expect(formatInterval(4 * DAY)).toBe('4d');
    expect(formatInterval(90 * DAY)).toBe('3mo');
  });

  it('shuffles deterministically by seed', () => {
    const list = Array.from({ length: 20 }, (_, i) => i);
    const a = seededShuffle(list, 'seed');
    expect(seededShuffle(list, 'seed')).toEqual(a);
    expect([...a].sort((x, y) => x - y)).toEqual(list);
    expect(seededShuffle(list, 'other')).not.toEqual(a);
  });
});

describe('daily queue', () => {
  const c = course();
  const items = courseItems(c);
  const input = (
    state: StudyCourseState,
    prefs: StudyPrefs,
    extra: Array<{
      cid: string;
      items: StudyItem[];
      state: StudyCourseState;
    }> = [],
  ) => ({ courses: [{ cid: c.id, items, state }, ...extra], prefs, now: NOW });

  it('offers new items only from weeks that have started (and weekless cards)', () => {
    const prefs = prefsWith({ newPerDay: 100, interleave: false });
    const queue = buildDailyQueue(input(blankState(), prefs));
    expect(queue.every((entry) => entry.isNew)).toBe(true);
    // current-first: the newest started week, then older weeks, weekless last
    expect(keysOf(queue)).toEqual([
      'c:w9-0',
      'c:w9-1',
      'c:w9-2',
      `q:${qcKey({ n: 1 }, standaloneQc)}`,
      'c:w1-0',
      'c:w1-1',
      'p:1-0',
      'z:1-0',
      'c:f0-0',
    ]);
    const oldest = buildDailyQueue(
      input(blankState(), { ...prefs, newOrder: 'oldest-first' }),
    );
    expect(oldest[0].key).toBe(`q:${qcKey({ n: 1 }, standaloneQc)}`);
  });

  it('caps new items at newPerDay minus those introduced today', () => {
    const state = blankState();
    state.rv[TODAY] = [0, 0, 1, 0, 1, 0];
    const prefs = prefsWith({ newPerDay: 3 });
    expect(buildDailyQueue(input(state, prefs))).toHaveLength(2);
    expect(dailyCounts(input(state, prefs))[c.id]).toEqual({
      due: 0,
      learning: 0,
      newAvail: 2,
      reviewedToday: 0,
      introducedToday: 1,
    });
    state.rv[TODAY] = [0, 0, 3, 0, 3, 0];
    expect(buildDailyQueue(input(state, prefs))).toEqual([]);
  });

  it('caps reviews at reviewsPerDay minus today’s reviews, most forgotten first', () => {
    const state = blankState();
    state.srs['c:w1-0'] = review(NOW - 10 * DAY, { lr: NOW - 40 * DAY });
    state.srs['c:w1-1'] = review(NOW - DAY);
    state.srs['c:w9-0'] = review(NOW + 3 * 3_600_000);
    state.srs['c:w9-1'] = review(NOW + 2 * DAY);
    state.rv[TODAY] = [1, 0, 2, 0, 0, 0];
    const prefs = prefsWith({
      newPerDay: 0,
      reviewsPerDay: 5,
      interleave: false,
    });
    const queue = buildDailyQueue(input(state, prefs));
    // 3 due today (one later today); 5 − 3 reviewed = 2, the most overdue first
    expect(keysOf(queue)).toEqual(['c:w1-0', 'c:w1-1']);
    expect(dailyCounts(input(state, prefs))[c.id]).toMatchObject({
      due: 2,
      reviewedToday: 3,
    });
  });

  it('includes learning items due within 20 minutes', () => {
    const state = blankState();
    state.srs['c:w9-0'] = review(NOW + 10 * 60_000, { st: 1, sd: 0 });
    state.srs['c:w9-1'] = review(NOW + 60 * 60_000, { st: 3, sd: 0 });
    const counts = dailyCounts(input(state, prefsWith({ newPerDay: 0 })));
    expect(counts[c.id]).toMatchObject({ learning: 1, due: 0 });
  });

  it('leaves out context-dependent quick checks and suspended items', () => {
    const state = blankState();
    const prefs = prefsWith({ newPerDay: 100 });
    setSuspended(state, find(items, 'c:w9-0'), true, NOW, prefs);
    const keys = keysOf(buildDailyQueue(input(state, prefs)));
    expect(keys).not.toContain(`q:${qcKey({ n: 1 }, contextQc)}`);
    expect(keys).not.toContain('c:w9-0');
    setSuspended(state, find(items, 'c:w9-0'), false, NOW, prefs);
    expect(keysOf(buildDailyQueue(input(state, prefs)))).toContain('c:w9-0');
  });

  it('honors the per-course review toggle and item sources', () => {
    const other = course('cs2000');
    const extra = [
      { cid: other.id, items: courseItems(other), state: blankState() },
    ];
    const base = { newPerDay: 100 };
    const excluded = prefsWith({
      ...base,
      courses: { cs2000: { review: false } },
    });
    const queue = buildDailyQueue(input(blankState(), excluded, extra));
    expect(queue.some((entry) => entry.cid === 'cs2000')).toBe(false);
    expect(
      Object.keys(dailyCounts(input(blankState(), excluded, extra))),
    ).toEqual(['cs1000']);

    const noCards = prefsWith({
      ...base,
      sources: { card: false },
      courses: { cs2000: { sources: { card: true } } },
    });
    const mixed = buildDailyQueue(input(blankState(), noCards, extra));
    expect(
      mixed
        .filter((entry) => entry.cid === 'cs1000')
        .map((entry) => entry.key[0]),
    ).toEqual(expect.arrayContaining(['q', 'p', 'z']));
    expect(
      mixed.some(
        (entry) => entry.cid === 'cs1000' && entry.key.startsWith('c:'),
      ),
    ).toBe(false);
    expect(
      mixed.some(
        (entry) => entry.cid === 'cs2000' && entry.key.startsWith('c:'),
      ),
    ).toBe(true);
  });

  it('interleaves deterministically with the same entries', () => {
    const state = blankState();
    state.srs['c:w1-0'] = review(NOW - DAY);
    state.srs['c:w1-1'] = review(NOW - 2 * DAY);
    const prefs = prefsWith({ newPerDay: 100 });
    const a = buildDailyQueue(input(state, prefs));
    expect(buildDailyQueue(input(state, prefs))).toEqual(a);
    const blocked = buildDailyQueue(
      input(state, { ...prefs, interleave: false }),
    );
    expect([...keysOf(a)].sort()).toEqual([...keysOf(blocked)].sort());
  });
});

describe('legacy memory', () => {
  const items = courseItems(course());
  const prefs = prefsWith();

  it('schedules a card known in an old week as due now', () => {
    const state = { ...blankState(), t: new Date(2026, 8, 10).getTime() };
    state.cards['w1-0'] = 'know';
    const { mem, source } = memoryOf(find(items, 'c:w1-0'), state, prefs, NOW);
    expect(source).toBe('legacy');
    expect(mem?.st).toBe(2);
    expect(mem?.lr).toBe(new Date(2026, 7, 24).getTime() - 1);
    expect(mem!.due).toBeLessThanOrEqual(NOW);
    expect(state.srs).toEqual({});
    const queue = buildDailyQueue({
      courses: [{ cid: 'cs1000', items, state }],
      prefs: { ...prefs, newPerDay: 0 },
      now: NOW,
    });
    expect(queue).toEqual([{ cid: 'cs1000', key: 'c:w1-0', isNew: false }]);
  });

  it('makes a card marked again (or a wrong answer) due now', () => {
    const state = { ...blankState(), t: NOW - 3_600_000 };
    state.cards['w1-1'] = 'again';
    state.lq[qcKey({ n: 1 }, standaloneQc)] = { a: 'old', ok: false };
    const again = memoryOf(find(items, 'c:w1-1'), state, prefs, NOW).mem;
    expect(again!.due).toBeLessThanOrEqual(NOW);
    expect(again!.st).toBe(2);
    const wrong = memoryOf(items[0], state, prefs, NOW).mem;
    expect(wrong!.due).toBeLessThanOrEqual(NOW);
    expect(isNewMemory(wrong)).toBe(false);
  });

  it('keeps a card known this week from being due yet', () => {
    const state = { ...blankState(), t: NOW - 3_600_000 };
    state.cards['w9-0'] = 'know';
    const { mem } = memoryOf(find(items, 'c:w9-0'), state, prefs, NOW);
    expect(mem!.lr).toBe(NOW - 3_600_000);
    expect(mem!.due).toBeGreaterThan(NOW + DAY);
  });
});

describe('rating', () => {
  const items = courseItems(course());
  const prefs = prefsWith();
  const card = find(items, 'c:w9-0');
  const quick = items[0];

  it('records first learning in the legacy fields and the day log', () => {
    const state = blankState();
    rate(state, card, 3, NOW, prefs, { ms: 4200 });
    expect(state.cards['w9-0']).toBe('know');
    expect(state.srs['c:w9-0'].st).toBe(1);
    expect(state.rv[TODAY]).toEqual([0, 0, 1, 0, 1, 4200]);
    rate(state, card, 1, NOW + 60_000, prefs);
    expect(state.cards['w9-0']).toBe('know');
    expect(state.rv[TODAY]).toEqual([1, 0, 1, 0, 1, 4200]);
  });

  it('marks a first Again as again, then know once recalled', () => {
    const state = blankState();
    rate(state, card, 1, NOW, prefs);
    expect(state.cards['w9-0']).toBe('again');
    rate(state, card, 2, NOW + 60_000, prefs);
    expect(state.cards['w9-0']).toBe('know');
  });

  it('keeps the first quick-check answer and accumulates Parsons attempts', () => {
    const state = blankState();
    const k = qcKey({ n: 1 }, standaloneQc);
    rate(state, quick, 1, NOW, prefs, { answer: 'old', ok: false });
    rate(state, quick, 3, NOW + 60_000, prefs, { answer: 'new', ok: true });
    expect(state.lq[k]).toEqual({ a: 'old', ok: false });
    const parsons = find(items, 'z:1-0');
    rate(state, parsons, 3, NOW, prefs, { ok: true });
    rate(state, parsons, 1, NOW + 60_000, prefs, { ok: false });
    expect(state.pz['1-0']).toEqual({ ok: true, n: 2 });
  });

  it('rates through rateIfNew only while the item has no memory', () => {
    const state = blankState();
    expect(rateIfNew(state, card, 3, NOW, prefs)).not.toBeNull();
    const after = structuredClone(state);
    expect(rateIfNew(state, card, 1, NOW + 60_000, prefs)).toBeNull();
    expect(state).toStrictEqual(after);
    const legacy = { ...blankState(), t: NOW - DAY };
    legacy.cards['w1-0'] = 'know';
    expect(rateIfNew(legacy, find(items, 'c:w1-0'), 1, NOW, prefs)).toBeNull();
    expect(legacy.srs).toEqual({});
  });

  it('undoes a rating exactly', () => {
    const state = { ...blankState(), t: NOW - DAY };
    state.cards['w1-0'] = 'know';
    state.rv[TODAY] = [0, 1, 0, 0, 0, 900];
    rate(state, card, 3, NOW - 3_600_000, prefs);
    const before = structuredClone(state);
    for (const [item, grade] of [
      [card, 1],
      [find(items, 'c:w1-0'), 1],
      [quick, 3],
      [find(items, 'z:1-0'), 4],
    ] as const) {
      const token = rate(state, item, grade, NOW, prefs, {
        ms: 1000,
        ok: grade > 1,
      });
      expect(state).not.toStrictEqual(before);
      undoRating(state, token);
      expect(state).toStrictEqual(before);
    }
    const fresh = blankState();
    undoRating(fresh, rate(fresh, card, 4, NOW, prefs));
    expect(fresh).toStrictEqual(blankState());
  });

  it('leaves the schedule alone when reschedule is off', () => {
    const state = blankState();
    rate(state, card, 3, NOW, prefs, { reschedule: false });
    expect(state.srs).toEqual({});
    expect(state.rv).toEqual({});
    expect(state.cards['w9-0']).toBe('know');
  });

  it('previews each grade’s next interval', () => {
    const preview = intervalPreview(card, blankState(), prefs, NOW);
    expect(preview[1].label).toBe('1m');
    expect(preview[3].label).toBe('10m');
    expect(preview[1].due).toBeLessThan(preview[2].due);
    expect(preview[2].due).toBeLessThanOrEqual(preview[3].due);
    expect(preview[3].due).toBeLessThan(preview[4].due);
  });

  it('resets an item to new without touching its completion', () => {
    const state = blankState();
    state.cards['w1-0'] = 'know';
    state.srs['c:w1-0'] = review(NOW + 30 * DAY);
    const item = find(items, 'c:w1-0');
    resetItem(state, item, NOW);
    const { mem, source } = memoryOf(item, state, prefs, NOW);
    expect(source).toBe('srs');
    expect(isNewMemory(mem)).toBe(true);
    expect(state.cards['w1-0']).toBe('know');
    const queue = buildDailyQueue({
      courses: [{ cid: 'cs1000', items, state }],
      prefs: { ...prefs, interleave: false },
      now: NOW,
    });
    expect(queue).toContainEqual({ cid: 'cs1000', key: 'c:w1-0', isNew: true });
  });
});

describe('custom sessions', () => {
  const items = courseItems(course());
  const prefs = prefsWith();
  const session = (input: Record<string, unknown>) =>
    customSessionSchema.parse(input);

  it('filters by weeks, kinds, and pick, ordering by week when asked', () => {
    const state = blankState();
    state.srs['c:w1-0'] = review(NOW + 2 * DAY, { l: 1 });
    state.srs['c:w9-0'] = review(NOW + 40 * DAY, {
      lr: NOW - DAY,
      s: 60,
      sd: 41,
    });
    state.cards['w9-1'] = 'again';
    const courses = [{ cid: 'cs1000', items, state }];
    const weak = buildCustomQueue({
      courses,
      prefs,
      now: NOW,
      session: session({ pick: 'weak', order: 'week' }),
    });
    expect(keysOf(weak)).toEqual(['c:w1-0', 'c:w9-1']);
    const ahead = buildCustomQueue({
      courses,
      prefs,
      now: NOW,
      session: session({ pick: 'ahead', aheadDays: 3, kinds: ['card'] }),
    });
    expect(keysOf(ahead)).toContain('c:w1-0');
    expect(keysOf(ahead)).not.toContain('c:w9-0');
    const fresh = buildCustomQueue({
      courses,
      prefs,
      now: NOW,
      session: session({ pick: 'new', weeks: [10, 10], order: 'week' }),
    });
    expect(keysOf(fresh)).toEqual(['c:w10-0', 'c:w10-1']);
    const limited = buildCustomQueue({
      courses,
      prefs,
      now: NOW,
      session: session({ pick: 'all', limit: 3 }),
      seed: 's',
    });
    expect(limited).toHaveLength(3);
  });
});

describe('stats', () => {
  const items = courseItems(course());
  const prefs = prefsWith();

  it('forecasts due reviews per study day and counts memory states', () => {
    const state = blankState();
    state.srs['c:w1-0'] = review(NOW - DAY);
    state.srs['c:w1-1'] = review(NOW + 2 * DAY, { sd: 30 });
    state.srs['c:w9-0'] = review(NOW + 60_000, { st: 1, sd: 0 });
    state.srs['c:w9-1'] = review(NOW + DAY, { sus: 1 });
    expect(forecast({ items, state, prefs, now: NOW, days: 4 })).toEqual([
      2, 0, 1, 0,
    ]);
    expect(stateCounts({ items, state, prefs, now: NOW })).toEqual({
      new: items.length - 4,
      learning: 1,
      review: 1,
      mature: 1,
      suspended: 1,
    });
  });

  it('lists day logs oldest first and counts the study streak', () => {
    const a = blankState();
    const b = blankState();
    a.rv['2026-10-17'] = [0, 0, 1, 0, 0, 0];
    b.rv['2026-10-18'] = [1, 0, 0, 0, 1, 5];
    expect(dayLogs(a, prefs, NOW, 3).map((log) => [log.day, log.good])).toEqual(
      [
        ['2026-10-17', 1],
        ['2026-10-18', 0],
        ['2026-10-19', 0],
      ],
    );
    expect(streak([a, b], prefs, NOW)).toBe(2);
    b.rv[TODAY] = [0, 0, 1, 0, 0, 0];
    expect(streak([a, b], prefs, NOW)).toBe(3);
    expect(streak([a], prefs, NOW)).toBe(0);
  });
});

describe('normalizeState review fields', () => {
  it('keeps srs, rv, uc, and pz and drops malformed entries', () => {
    const good = review(NOW);
    const state = normalizeState({
      srs: {
        a: good,
        b: { ...good, s: Number.NaN },
        c: { ...good, due: Number.POSITIVE_INFINITY },
        d: { ...good, st: 7 },
        e: 'x',
        f: { ...good, sus: 1 },
      },
      rv: { '2026-10-19': [1, 2, 3, 4, 5, 6], bad: [1, 2], worse: 'x' },
      uc: {
        u1: { f: 'F', b: 'B', t: 5, tags: ['x', 3] },
        u2: { f: 'F' },
      },
      pz: { '1-0': { ok: true, n: 2 }, '1-1': 'x' },
    });
    expect(state.srs).toEqual({ a: good, f: { ...good, sus: 1 } });
    expect(state.rv).toEqual({ '2026-10-19': [1, 2, 3, 4, 5, 6] });
    expect(Object.keys(state.uc)).toEqual(['u1']);
    expect(state.uc.u1).toMatchObject({ f: 'F', b: 'B', t: 5 });
    expect(state.pz).toEqual({ '1-0': { ok: true, n: 2 } });
    expect(normalizeState({ srs: [], rv: null, uc: 4 })).toMatchObject({
      srs: {},
      rv: {},
      uc: {},
      pz: {},
    });
    expect(normalizeState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
