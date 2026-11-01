/**
 * Pure Study Hub helpers shared by the rail, Today, and the study views.
 * Ported from the artifact so progress percentages, "this week", exam
 * countdowns, and the review queue match it exactly. Dates are local wall
 * time (the app is localhost-only, so server and browser share a zone).
 */
import { z } from 'zod';
import type {
  StudyCourse,
  StudyCourseState,
  StudyExam,
  StudyPractice,
  StudyQuickCheck,
  StudyWeek,
} from './types';

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const blankState = (): StudyCourseState => ({
  lec: {},
  ww: {},
  st: {},
  ex: {},
  gr: {},
  cq: '',
  cards: {},
  chk: {},
  dates: {},
  lq: {},
  gb: {},
  srs: {},
  rv: {},
  uc: {},
  pz: {},
  t: 0,
});

/**
 * Entry shapes of the review fields. Malformed entries are dropped (srs, rv)
 * or repaired field by field (uc, pz) so one bad value never loses the rest.
 */
const memorySchema = z.object({
  due: z.number(),
  s: z.number(),
  d: z.number(),
  st: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  ls: z.number(),
  sd: z.number(),
  r: z.number(),
  l: z.number(),
  lr: z.number().optional(),
  sus: z.literal(1).optional().catch(undefined),
});
const dayLogSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
const userCardSchema = z.object({
  f: z.string(),
  b: z.string(),
  a: z.array(z.string()).optional().catch(undefined),
  w: z.number().optional().catch(undefined),
  tags: z.array(z.string()).optional().catch(undefined),
  t: z.number().catch(0),
});
const parsonsSchema = z.object({
  ok: z.boolean().catch(false),
  n: z.number().catch(0),
});

/** The entries of a record that match `schema`; anything else becomes `{}`. */
function cleanRecord<T>(value: unknown, schema: z.ZodType<T>) {
  const out: Record<string, T> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, entry] of Object.entries(value)) {
    const parsed = schema.safeParse(entry);
    if (parsed.success) out[key] = parsed.data;
  }
  return out;
}

/** Merge a possibly partial/legacy state onto a blank one. */
export function normalizeState(value: unknown): StudyCourseState {
  const base = blankState();
  if (!value || typeof value !== 'object') return base;
  const input = value as Partial<StudyCourseState>;
  const record = <T>(v: unknown, fallback: T): T =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : fallback;
  return {
    lec: record(input.lec, base.lec),
    ww: record(input.ww, base.ww),
    st: record(input.st, base.st),
    ex: record(input.ex, base.ex),
    gr: record(input.gr, base.gr),
    cq: typeof input.cq === 'string' ? input.cq : '',
    cards: record(input.cards, base.cards),
    chk: record(input.chk, base.chk),
    dates: record(input.dates, base.dates),
    lq: record(input.lq, base.lq),
    gb: record(input.gb, base.gb),
    srs: cleanRecord(input.srs, memorySchema),
    rv: cleanRecord(input.rv, dayLogSchema),
    uc: cleanRecord(input.uc, userCardSchema),
    pz: cleanRecord(input.pz, parsonsSchema),
    t: typeof input.t === 'number' ? input.t : 0,
  };
}

/** `YYYY-MM-DD…` → local midnight. */
export const d8 = (value: string) => {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** "Aug 24" */
export const fmtDay = (value: string) => {
  const d = d8(value);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

export const fmtPts = (x: number) => (Math.round(x * 10) / 10).toString();

/** Local `YYYY-MM-DD` for a date (defaults to now). */
export function localDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const weekByNumber = (course: StudyCourse, n: number) =>
  course.weeks.find((week) => week.n === n);

/** First week whose end is today or later; else the last week. */
export function curWeek(
  weeks: ReadonlyArray<{ n: number; end: string }>,
  today: string,
) {
  const t = d8(today);
  for (const week of weeks) if (t <= d8(week.end)) return week.n;
  return weeks[weeks.length - 1]?.n ?? 1;
}

/** Fields of an exam needed for dates (full exams and rail outlines both fit). */
export type ExamShape = Pick<StudyExam, 'id' | 'title' | 'date' | 'dateEst'>;

/** The user's real date (date only) wins over the hub's, which may carry a time. */
export function examDate(state: StudyCourseState, exam: ExamShape) {
  const override = state.dates[exam.id];
  const source = override || exam.date;
  const date = d8(source);
  if (!override && source.length > 10) {
    const [h, m] = source.slice(11, 16).split(':').map(Number);
    date.setHours(h, m);
  }
  return date;
}

export const examEstimated = (state: StudyCourseState, exam: ExamShape) =>
  Boolean(exam.dateEst) && !state.dates[exam.id];

/** Whole calendar days from `today` to `date` (negative = past). */
export function dayDiff(date: Date, today: string) {
  const x = new Date(date);
  x.setHours(0, 0, 0, 0);
  return Math.round((x.getTime() - d8(today).getTime()) / 864e5);
}

/** "Wed Oct 14, 6:30 PM (estimated)" */
export function fmtExamDate(state: StudyCourseState, exam: ExamShape) {
  const d = examDate(state, exam);
  let label = `${DOW[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  if (d.getHours())
    label += `, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return label + (examEstimated(state, exam) ? ' (estimated)' : '');
}

export type DatedExam<E extends ExamShape = StudyExam> = {
  exam: E;
  date: Date;
};

/** Exams sorted by effective date. Accepts `course.exams` (record) or an outline's list. */
export function examsOf<E extends ExamShape>(
  exams: Record<string, E> | readonly E[],
  state: StudyCourseState,
): Array<DatedExam<E>> {
  return Object.values(exams)
    .map((exam) => ({ exam, date: examDate(state, exam) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Earliest exam today or later; falls back to the last exam. */
export function nextExam<E extends ExamShape>(
  exams: Record<string, E> | readonly E[],
  state: StudyCourseState,
  today: string,
): DatedExam<E> | undefined {
  const list = examsOf(exams, state);
  return (
    list.find((item) => dayDiff(item.date, today) >= 0) ?? list[list.length - 1]
  );
}

export const examWeek = <W extends { exams: readonly string[] }>(
  weeks: readonly W[],
  examId: string,
) => weeks.find((week) => week.exams.includes(examId));

export type WeekProgress = { done: number; total: number; pct: number };

/** A week as content (arrays) or as a rail outline (item counts). */
export type WeekShape = {
  n: number;
  practice: number | readonly unknown[];
  studio: number | readonly unknown[];
  cards: number | readonly unknown[];
  checks: number | readonly unknown[];
  exams: readonly string[];
};

const countOf = (value: number | readonly unknown[]) =>
  typeof value === 'number' ? value : value.length;

export function weekProg(
  state: StudyCourseState,
  week: WeekShape,
): WeekProgress {
  const practice = countOf(week.practice);
  const studio = countOf(week.studio);
  const cards = countOf(week.cards);
  const checks = countOf(week.checks);
  const total = 1 + practice + studio + cards + checks + week.exams.length;
  let done = state.lec[week.n] ? 1 : 0;
  for (let i = 0; i < practice; i += 1)
    if (state.ww[`${week.n}-${i}`]?.ok) done += 1;
  for (let i = 0; i < studio; i += 1)
    if (state.st[`${week.n}-${i}`] === 'got') done += 1;
  for (let i = 0; i < cards; i += 1)
    if (state.cards[`w${week.n}-${i}`] === 'know') done += 1;
  for (let i = 0; i < checks; i += 1)
    if (state.chk[`${week.n}-${i}`]) done += 1;
  for (const id of week.exams) if (state.ex[id]?.done) done += 1;
  return { done, total, pct: Math.round((done / total) * 100) };
}

/** Size of the review queue (see reviewItems) from counts alone. */
export function reviewCount(
  weeks: readonly WeekShape[],
  state: StudyCourseState,
) {
  let count = 0;
  for (const week of weeks) {
    for (let i = 0; i < countOf(week.practice); i += 1)
      if (state.ww[`${week.n}-${i}`]?.ok === false) count += 1;
    for (let i = 0; i < countOf(week.studio); i += 1) {
      const rating = state.st[`${week.n}-${i}`];
      if (rating === 'shaky' || rating === 'missed') count += 1;
    }
  }
  return count;
}

/** The week tab that holds a piece of unfinished work. */
export type TopicTab = 'lecture' | 'practice' | 'studio' | 'cards';

export type TopicStatus = {
  /** the lecture is reviewed and every check, practice, studio, and card item is done */
  complete: boolean;
  /** the week has ended without being complete */
  behind: boolean;
  /** what is left, in the hub's order, with the tab it is on */
  miss: Array<{ tab: TopicTab; text: string }>;
};

/** A week's learning work, from content (arrays) or a rail outline (counts). */
export type TopicWeek = Pick<
  WeekShape,
  'n' | 'practice' | 'studio' | 'cards' | 'checks'
> & { end: string; lectures: number | readonly unknown[] };

export type StudyLabels = StudyCourse['labels'];

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** How many of `count` items are not done yet. */
function openCount(count: number, done: (index: number) => boolean) {
  let left = 0;
  for (let i = 0; i < count; i += 1) if (!done(i)) left += 1;
  return left;
}

/**
 * The hub's topic status. A week is complete when its lecture is marked
 * reviewed and every checklist item is checked, every practice question is
 * correct, every studio problem is rated Got it, and every card is known
 * (practice exams are tracked separately); it is behind once it has ended
 * incomplete. `today` is the local `YYYY-MM-DD`.
 */
export function topicStatus(
  labels: StudyLabels,
  state: StudyCourseState,
  week: TopicWeek,
  today: string,
): TopicStatus {
  const miss: TopicStatus['miss'] = [];
  const n = week.n;
  if (!state.lec[n])
    miss.push({
      tab: 'lecture',
      text: `${labels.lecture} not marked reviewed`,
    });
  const checks = openCount(countOf(week.checks), (i) =>
    Boolean(state.chk[`${n}-${i}`]),
  );
  if (checks)
    miss.push({
      tab: 'lecture',
      text: `${plural(checks, 'checklist item', 'checklist items')} unchecked`,
    });
  const practice = openCount(countOf(week.practice), (i) =>
    Boolean(state.ww[`${n}-${i}`]?.ok),
  );
  if (practice)
    miss.push({
      tab: 'practice',
      text: `${plural(practice, `${labels.practice} question`, `${labels.practice} questions`)} not yet correct`,
    });
  const studio = openCount(
    countOf(week.studio),
    (i) => state.st[`${n}-${i}`] === 'got',
  );
  if (studio)
    miss.push({
      tab: 'studio',
      text: `${plural(studio, `${labels.studio} problem`, `${labels.studio} problems`)} not rated Got it`,
    });
  const cards = openCount(
    countOf(week.cards),
    (i) => state.cards[`w${n}-${i}`] === 'know',
  );
  if (cards)
    miss.push({
      tab: 'cards',
      text: `${plural(cards, 'card', 'cards')} not known yet`,
    });
  const hasWork =
    countOf(week.practice) +
      countOf(week.studio) +
      countOf(week.cards) +
      countOf(week.checks) >
      0 || countOf(week.lectures) > 0;
  const complete = hasWork && miss.length === 0;
  return { complete, behind: d8(today) > d8(week.end) && !complete, miss };
}

/** Weeks that have ended incomplete, in order. */
export function behindWeeks<W extends TopicWeek>(
  labels: StudyLabels,
  state: StudyCourseState,
  weeks: readonly W[],
  today: string,
): W[] {
  return weeks.filter((week) => topicStatus(labels, state, week, today).behind);
}

/** Event texts whose day label ends with today's M/D ("Wed 9/30"), as the hub matches them. */
export function eventsOn(
  week: { events: ReadonlyArray<readonly [string, string]> },
  today: string,
) {
  const [, month, day] = today.split('-').map(Number);
  const md = `${month}/${day}`;
  return week.events
    .filter(([label]) => label.split(' ').pop() === md)
    .map(([, text]) => text);
}

export type LightLevel = 'green' | 'yellow' | 'red';

/** A status dot: its colour and the sentence behind it. */
export type Light = { level: LightLevel; text: string };

/** A course as the course light reads it (full content or a rail outline). */
export type LightCourse = {
  code: string;
  labels: StudyLabels;
  weeks: ReadonlyArray<
    TopicWeek & {
      start: string;
      events: ReadonlyArray<readonly [string, string]>;
    }
  >;
};

/**
 * The hub's course traffic light: red when a past week is incomplete, yellow
 * when only the current week's work is open (with today's events), green
 * when caught up.
 */
export function courseLight(
  course: LightCourse,
  state: StudyCourseState,
  today: string,
): Light {
  const behind = behindWeeks(course.labels, state, course.weeks, today).length;
  if (behind)
    return {
      level: 'red',
      text: `${course.code}: behind on ${plural(behind, 'week', 'weeks')}`,
    };
  const current = course.weeks.find(
    (week) => week.n === curWeek(course.weeks, today),
  );
  const day = d8(today);
  if (
    current &&
    !topicStatus(course.labels, state, current, today).complete &&
    day >= d8(current.start) &&
    day <= d8(current.end)
  ) {
    const due = eventsOn(current, today);
    return {
      level: 'yellow',
      text: `${course.code}: caught up on past weeks; this week is in progress${due.length ? `. Today: ${due.join('; ')}` : ''}`,
    };
  }
  return { level: 'green', text: `${course.code}: caught up` };
}

/** The hub's dot for one week in the week list; null for weeks not yet open. */
export function weekLight(
  labels: StudyLabels,
  state: StudyCourseState,
  week: TopicWeek & { start: string },
  current: number,
  today: string,
): Light | null {
  const status = topicStatus(labels, state, week, today);
  if (status.complete) return { level: 'green', text: 'Complete' };
  if (status.behind)
    return {
      level: 'red',
      text: `Behind: ${status.miss.map((item) => item.text).join('; ')}`,
    };
  if (week.n === current && d8(today) >= d8(week.start))
    return { level: 'yellow', text: 'This week, in progress' };
  return null;
}

/** Lecture names for a week: dated "Lecture:" schedule lines, else the notes' section titles. */
export function lectureNames(
  week: Pick<StudyWeek, 'events' | 'title'> & {
    lectures: ReadonlyArray<{ title: string }>;
  },
) {
  const dated = week.events
    .filter(([, text]) => text.startsWith('Lecture: '))
    .map(([day, text]) => `${day}: ${text.slice('Lecture: '.length)}`);
  if (dated.length) return dated;
  return week.lectures
    .filter((lecture) => !lecture.title.startsWith('This week in '))
    .map((lecture) =>
      lecture.title === "This week's notes" ? week.title : lecture.title,
    );
}

export type ReviewItem = {
  week: StudyWeek;
  tab: 'practice' | 'studio';
  index: number;
  tag: 'Missed' | 'Shaky';
  /** HTML question */
  q: string;
};

/** Failed practice items plus studio items rated Shaky or Missed. */
export function reviewItems(
  course: StudyCourse,
  state: StudyCourseState,
): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const week of course.weeks) {
    week.practice.forEach((item, index) => {
      const result = state.ww[`${week.n}-${index}`];
      if (result && result.ok === false)
        out.push({ week, tab: 'practice', index, tag: 'Missed', q: item.q });
    });
    week.studio.forEach((item, index) => {
      const rating = state.st[`${week.n}-${index}`];
      if (rating === 'shaky' || rating === 'missed')
        out.push({
          week,
          tab: 'studio',
          index,
          tag: rating === 'shaky' ? 'Shaky' : 'Missed',
          q: item.q,
        });
    });
  }
  return out;
}

export type WeekTab = { id: string; label: string; count: string };

/** Tabs for a week page: lecture, practice, studio, cards, arrange (Parsons), then one per exam. */
export function tabsFor(
  course: StudyCourse,
  state: StudyCourseState,
  week: StudyWeek,
): WeekTab[] {
  const quiz = weekQuiz(week);
  const tabs: WeekTab[] = [
    {
      id: 'lecture',
      label: course.labels.lecture,
      count: quiz.length
        ? `${quiz.filter((item) => state.lq[qcKey(week, item)]?.ok).length}/${quiz.length}`
        : '',
    },
  ];
  if (week.practice.length)
    tabs.push({
      id: 'practice',
      label: course.labels.practice,
      count: `${week.practice.filter((_, i) => state.ww[`${week.n}-${i}`]?.ok).length}/${week.practice.length}`,
    });
  if (week.studio.length)
    tabs.push({
      id: 'studio',
      label: course.labels.studio,
      count: `${week.studio.filter((_, i) => state.st[`${week.n}-${i}`] === 'got').length}/${week.studio.length}`,
    });
  if (week.cards.length)
    tabs.push({
      id: 'cards',
      label: 'Cards',
      count: `${week.cards.filter((_, i) => state.cards[`w${week.n}-${i}`] === 'know').length}/${week.cards.length}`,
    });
  const parsons = week.parsons ?? [];
  if (parsons.length)
    tabs.push({
      id: 'parsons',
      label: 'Arrange',
      count: `${parsons.filter((_, i) => state.pz[`${week.n}-${i}`]?.ok).length}/${parsons.length}`,
    });
  for (const id of week.exams)
    if (course.exams[id])
      tabs.push({ id: `x-${id}`, label: course.exams[id].title, count: '' });
  return tabs;
}

/** FNV-1a 32-bit over UTF-16 code units, base 36 (the hub's `fnv`). */
function fnv(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * The hub's `lq` key for a quick check: week number plus a hash of the
 * question and its options, so edited or reordered notes never attach an old
 * answer to a different question. Must stay byte-identical to the hub's.
 */
export const qcKey = (
  week: { n: number },
  item: Pick<StudyQuickCheck, 'q' | 'opts'>,
) => `${week.n}-${fnv(`${item.q}\u0001${(item.opts ?? []).join('\u0001')}`)}`;

/** Every quick check in a week's lecture notes, in order. */
export const weekQuiz = (week: Pick<StudyWeek, 'lectures'>) =>
  week.lectures.flatMap((lecture) =>
    lecture.parts.flatMap((part) => part.quiz ?? []),
  );

/** Normalization used by the practice checker. */
export const normAnswer = (value: unknown) =>
  String(value)
    .toLowerCase()
    .replace(/[\u2212\u2013]/g, '-')
    .replace(/[\s"'{}]/g, '');

/** Practice answer checker (mc index, numeric tolerance, set, or text). */
export function checkPractice(item: StudyPractice, value: string) {
  if (item.type === 'mc') return Number(value) === item.a;
  if (item.type === 'num') {
    const x = parseFloat(normAnswer(value).replace(/,/g, ''));
    const a = Number(item.a);
    return (
      !Number.isNaN(x) && Math.abs(x - a) < 1e-6 * Math.max(1, Math.abs(a))
    );
  }
  const accepted = (Array.isArray(item.a) ? item.a : [String(item.a)]).map(
    normAnswer,
  );
  if (item.type === 'set') {
    const given = [...new Set(normAnswer(value).split(',').filter(Boolean))]
      .sort()
      .join(',');
    return given === [...accepted].sort().join(',');
  }
  return accepted.includes(normAnswer(value));
}

/** Display form of a practice answer. */
export function practiceAnswerText(item: StudyPractice) {
  if (item.type === 'mc') return item.opts?.[Number(item.a)] ?? '';
  if (item.type === 'num') return Number(item.a).toLocaleString('en-US');
  if (item.type === 'set')
    return `{${(Array.isArray(item.a) ? item.a : [item.a]).join(', ')}}`;
  return Array.isArray(item.a) ? item.a[0] : String(item.a);
}

/** Normalization used by exam blanks. */
export const normExamAnswer = (value: unknown) =>
  String(value || '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, '')
    .replace(/;+$/, '');

/** HTML → plain text without a DOM (server-safe). */
export function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case-insensitive all-token match over a week's searchable text (rail search). */
export function weekMatches(week: StudyWeek, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    week.title,
    week.secs,
    ...week.lectures.map((lecture) => lecture.title),
    ...week.lectures.flatMap((lecture) =>
      lecture.parts.map((part) => `${part.h} ${stripHtml(part.b)}`),
    ),
  ]
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((token) => hay.includes(token));
}
