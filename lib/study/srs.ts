/**
 * Spaced repetition for every study item (week cards, formula cards, quick
 * checks, practice, Parsons problems, and the student's own cards): FSRS
 * memory via ts-fsrs, daily and custom review queues, and stats. Pure and
 * client+server safe; `rate`/`resetItem`/`setSuspended` mutate a progress
 * draft, so call them inside `update()`.
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type FSRS,
  type Grade,
  type State,
  type StepUnit,
} from 'ts-fsrs';
import { d8, localDayKey, qcKey, stripHtml, weekQuiz } from './model';
import {
  coursePrefs,
  effectiveSources,
  type CustomSession,
  type ItemKind,
  type StudyPrefs,
} from './prefs-schema';
import type {
  DayLog,
  SrsMemory,
  StudyCard,
  StudyCourse,
  StudyCourseState,
  StudyParsons,
  StudyQuickCheck,
  StudyWeek,
  UserCard,
} from './types';

/** Again, Hard, Good, Easy */
export type SrsGrade = 1 | 2 | 3 | 4;

export type StudyItem = {
  key: string;
  cid: string;
  kind: ItemKind;
  /** week dates (null: formula/user cards without a week) */
  week: number | null;
  start: string | null;
  end: string | null;
  /** stable order within the course */
  order: number;
  /** plain text ≤ 140 chars for lists */
  label: string;
  /** where it lives, e.g. `/study/abc1234/week/9?tab=lecture` */
  href: string | null;
  /** false: a quick check that says "above/below" without its own <pre>; kept out of review queues */
  standalone: boolean;
  card?: StudyCard;
  mine?: UserCard;
  practice?: StudyQuickCheck;
  parsons?: StudyParsons;
};

export type QueueEntry = { cid: string; key: string; isNew: boolean };

type WeekDates = Pick<StudyWeek, 'n' | 'start' | 'end'>;
type CourseInput = {
  cid: string;
  items: StudyItem[];
  state: StudyCourseState;
};

const MINUTE = 60_000;
const DAY = 86_400_000;
/** Learning cards due this soon are shown now (Anki's learn-ahead limit). */
const LEARN_AHEAD = 20 * MINUTE;
const LABEL_MAX = 140;

const PREFIX: Record<ItemKind, string> = {
  card: 'c:',
  quick: 'q:',
  practice: 'p:',
  parsons: 'z:',
  mine: 'u:',
};

/** Progress field holding an item kind's first-learning record. */
const LEGACY_FIELD = {
  card: 'cards',
  quick: 'lq',
  practice: 'ww',
  parsons: 'pz',
  mine: null,
} as const satisfies Record<ItemKind, keyof StudyCourseState | null>;

type LegacyField = NonNullable<(typeof LEGACY_FIELD)[ItemKind]>;
type LegacyValue = StudyCourseState[LegacyField][string];

export function itemKey(kind: ItemKind, legacyKey: string): string {
  return PREFIX[kind] + legacyKey;
}

/** The progress key the item's legacy record uses (`w9-0`, `9-3`, a user card id). */
const legacyKeyOf = (item: StudyItem) => item.key.slice(2);

function plainLabel(text: string) {
  const plain = text.replace(/\s+/g, ' ').trim();
  return plain.length > LABEL_MAX ? `${plain.slice(0, LABEL_MAX - 1)}…` : plain;
}

// ── items ────────────────────────────────────────────────────────────────

/** Kinds' slots inside a week, so `order` follows the week page's tabs. */
const SLOT = { quick: 0, card: 1, practice: 2, parsons: 3 } as const;
const WEEK_SPAN = 100_000;
const SLOT_SPAN = 10_000;

function weekItem(
  course: StudyCourse,
  week: StudyWeek,
  kind: keyof typeof SLOT,
  legacyKey: string,
  index: number,
  tab: string,
  label: string,
): StudyItem {
  let weekIndex = course.weeks.indexOf(week);
  if (weekIndex < 0)
    weekIndex = course.weeks.findIndex((other) => other.n === week.n);
  return {
    key: itemKey(kind, legacyKey),
    cid: course.id,
    kind,
    week: week.n,
    start: week.start,
    end: week.end,
    order: (weekIndex + 1) * WEEK_SPAN + SLOT[kind] * SLOT_SPAN + index,
    label: plainLabel(label),
    href: `/study/${course.id}/week/${week.n}?tab=${tab}`,
    standalone: true,
  };
}

export function cardItem(
  course: StudyCourse,
  week: StudyWeek,
  i: number,
): StudyItem {
  const card = week.cards[i];
  return {
    ...weekItem(
      course,
      week,
      'card',
      `w${week.n}-${i}`,
      i,
      'cards',
      stripHtml(card.f),
    ),
    card,
  };
}

export function formulaItem(
  course: StudyCourse,
  g: number,
  r: number,
): StudyItem {
  const [f, b] = course.formulas[g].rows[r];
  return {
    key: itemKey('card', `f${g}-${r}`),
    cid: course.id,
    kind: 'card',
    week: null,
    start: null,
    end: null,
    order: (course.weeks.length + 1) * WEEK_SPAN + g * 1000 + r,
    label: plainLabel(stripHtml(f)),
    href: `/study/${course.id}/formulas`,
    standalone: true,
    card: { f, b },
  };
}

export function quickItem(
  course: StudyCourse,
  week: StudyWeek,
  qc: StudyQuickCheck,
): StudyItem {
  const index = Math.max(0, weekQuiz(week).indexOf(qc));
  return {
    ...weekItem(
      course,
      week,
      'quick',
      qcKey(week, qc),
      index,
      'lecture',
      stripHtml(qc.q),
    ),
    standalone: !(/\b(above|below)\b/i.test(qc.q) && !qc.q.includes('<pre')),
    practice: qc,
  };
}

export function practiceItem(
  course: StudyCourse,
  week: StudyWeek,
  i: number,
): StudyItem {
  const practice = week.practice[i];
  return {
    ...weekItem(
      course,
      week,
      'practice',
      `${week.n}-${i}`,
      i,
      'practice',
      stripHtml(practice.q),
    ),
    practice,
  };
}

export function parsonsItem(
  course: StudyCourse,
  week: StudyWeek,
  i: number,
): StudyItem {
  const parsons = (week.parsons ?? [])[i];
  return {
    ...weekItem(
      course,
      week,
      'parsons',
      `${week.n}-${i}`,
      i,
      'parsons',
      parsons.title || stripHtml(parsons.q),
    ),
    parsons,
  };
}

export function userCardItem(
  cid: string,
  id: string,
  uc: UserCard,
  weeks?: readonly WeekDates[],
): StudyItem {
  const week =
    uc.w === undefined ? undefined : weeks?.find((other) => other.n === uc.w);
  return {
    key: itemKey('mine', id),
    cid,
    kind: 'mine',
    week: uc.w ?? null,
    start: week?.start ?? null,
    end: week?.end ?? null,
    order: uc.t,
    label: plainLabel(uc.f),
    href: null,
    standalone: true,
    mine: uc,
  };
}

const itemCache = new WeakMap<StudyCourse, StudyItem[]>();

/** Every content item of a course (week items in tab order, then formula cards); memoized per course object. */
export function courseItems(course: StudyCourse): StudyItem[] {
  const cached = itemCache.get(course);
  if (cached) return cached;
  const items: StudyItem[] = [];
  const seen = new Set<string>();
  const add = (item: StudyItem) => {
    // Identical quick checks in one week share a key; the first one stands for both.
    if (seen.has(item.key)) return;
    seen.add(item.key);
    items.push(item);
  };
  for (const week of course.weeks) {
    for (const qc of weekQuiz(week)) add(quickItem(course, week, qc));
    week.cards.forEach((_, i) => add(cardItem(course, week, i)));
    week.practice.forEach((_, i) => add(practiceItem(course, week, i)));
    (week.parsons ?? []).forEach((_, i) => add(parsonsItem(course, week, i)));
  }
  course.formulas.forEach((group, g) =>
    group.rows.forEach((_, r) => add(formulaItem(course, g, r))),
  );
  itemCache.set(course, items);
  return items;
}

/** The student's own cards as items, oldest first. */
export function userCardItems(
  cid: string,
  uc: StudyCourseState['uc'],
  weeks?: readonly WeekDates[],
): StudyItem[] {
  return Object.entries(uc)
    .map(([id, card]) => userCardItem(cid, id, card, weeks))
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

// ── days ─────────────────────────────────────────────────────────────────

/** Local `YYYY-MM-DD` of the study day `now` falls in (days start at `dayStartsAt` o'clock). */
export function studyDay(now: number, dayStartsAt: number): string {
  const date = new Date(now);
  if (date.getHours() < dayStartsAt) date.setDate(date.getDate() - 1);
  return localDayKey(date);
}

/** When study day `day` + `offset` days begins (ms). */
function dayStart(day: string, offset: number, dayStartsAt: number) {
  const date = d8(day);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + offset,
    dayStartsAt,
  ).getTime();
}

/** `day` shifted by `offset` calendar days. */
function shiftDay(day: string, offset: number) {
  const date = d8(day);
  return localDayKey(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset),
  );
}

/** Start of the next study day (ms). */
export function nextDayStart(now: number, dayStartsAt: number): number {
  return dayStart(studyDay(now, dayStartsAt), 1, dayStartsAt);
}

// ── seeded randomness ────────────────────────────────────────────────────

/** Deterministic shuffle (mulberry32 seeded with the FNV-1a hash of `seed`). */
export function seededShuffle<T>(list: readonly T[], seed: string): T[] {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── FSRS ─────────────────────────────────────────────────────────────────

const schedulers = new Map<string, FSRS>();

function buildScheduler(prefs: StudyPrefs, shortTerm: boolean) {
  const key = JSON.stringify([
    prefs.retention,
    prefs.maxInterval,
    prefs.learningSteps,
    prefs.relearningSteps,
    shortTerm,
  ]);
  let scheduler = schedulers.get(key);
  if (!scheduler) {
    scheduler = fsrs(
      generatorParameters({
        request_retention: prefs.retention,
        maximum_interval: prefs.maxInterval,
        enable_fuzz: true,
        enable_short_term: shortTerm,
        learning_steps: prefs.learningSteps.map(
          (minutes) => `${minutes}m` as StepUnit,
        ),
        relearning_steps: prefs.relearningSteps.map(
          (minutes) => `${minutes}m` as StepUnit,
        ),
      }),
    );
    schedulers.set(key, scheduler);
  }
  return scheduler;
}

/** The FSRS scheduler for these preferences (memoized; fuzz on). */
export function schedulerFor(prefs: StudyPrefs): FSRS {
  return buildScheduler(prefs, true);
}

function toCard(mem: SrsMemory): Card {
  const card: Card = {
    // elapsed_days (deprecated) is recomputed from last_review on every review.
    ...createEmptyCard(new Date(mem.due)),
    stability: mem.s,
    difficulty: mem.d,
    scheduled_days: mem.sd,
    learning_steps: mem.ls,
    reps: mem.r,
    lapses: mem.l,
    state: mem.st as State,
  };
  if (mem.lr !== undefined) card.last_review = new Date(mem.lr);
  return card;
}

function fromCard(card: Card, sus?: 1): SrsMemory {
  const mem: SrsMemory = {
    due: card.due.getTime(),
    s: card.stability,
    d: card.difficulty,
    st: card.state as number as SrsMemory['st'],
    ls: card.learning_steps,
    sd: card.scheduled_days,
    r: card.reps,
    l: card.lapses,
  };
  if (card.last_review) mem.lr = card.last_review.getTime();
  if (sus) mem.sus = 1;
  return mem;
}

/** The grade an item's legacy record stands for, or null without one. */
function legacyGrade(item: StudyItem, state: StudyCourseState): Grade | null {
  const key = legacyKeyOf(item);
  let ok: boolean | undefined;
  if (item.kind === 'card') {
    const mark = state.cards[key];
    if (mark) ok = mark === 'know';
  } else if (item.kind === 'quick') ok = state.lq[key]?.ok;
  else if (item.kind === 'practice') ok = state.ww[key]?.ok;
  else if (item.kind === 'parsons') ok = state.pz[key]?.ok;
  if (ok === undefined) return null;
  return ok ? Rating.Good : Rating.Again;
}

/** Last answer recorded before FSRS (or on first learning) was wrong. */
function legacyWrong(item: StudyItem, state: StudyCourseState) {
  const key = legacyKeyOf(item);
  if (item.kind === 'card') return state.cards[key] === 'again';
  if (item.kind === 'quick') return state.lq[key]?.ok === false;
  if (item.kind === 'practice') return state.ww[key]?.ok === false;
  if (item.kind === 'parsons') return state.pz[key]?.ok === false;
  return false;
}

const synthetic = new WeakMap<FSRS, Map<string, SrsMemory>>();

/**
 * Memory for an item answered before scheduling existed: one review without
 * short-term steps at the latest moment it can have happened (the end of its
 * week, the last progress edit, or now). Never stored until a real review.
 */
function legacyMemory(
  item: StudyItem,
  state: StudyCourseState,
  prefs: StudyPrefs,
  now: number,
): SrsMemory | null {
  const grade = legacyGrade(item, state);
  if (grade === null) return null;
  let lr = Math.min(state.t || now, now);
  if (item.end) lr = Math.min(lr, dayStart(item.end, 1, 0) - 1);
  const scheduler = buildScheduler(prefs, false);
  let cache = synthetic.get(scheduler);
  if (!cache) {
    cache = new Map();
    synthetic.set(scheduler, cache);
  }
  const key = `${lr}:${grade}`;
  let mem = cache.get(key);
  if (!mem) {
    mem = fromCard(scheduler.next(createEmptyCard(lr), lr, grade).card);
    if (cache.size > 2000) cache.clear();
    cache.set(key, mem);
  }
  return { ...mem };
}

/** The item's memory: stored FSRS memory, a synthetic one from legacy answers, or none (new). */
export function memoryOf(
  item: StudyItem,
  state: StudyCourseState,
  prefs: StudyPrefs,
  now: number,
): { mem: SrsMemory | null; source: 'srs' | 'legacy' | 'new' } {
  const stored = state.srs[item.key];
  if (stored) return { mem: stored, source: 'srs' };
  const mem = legacyMemory(item, state, prefs, now);
  return mem ? { mem, source: 'legacy' } : { mem: null, source: 'new' };
}

/** New = no memory at all, or a stored memory in the New state (a reset item). */
export function isNewMemory(mem: SrsMemory | null): boolean {
  return !mem || mem.st === 0;
}

/** Probability of recall now (0 for new items). */
export function retrievability(
  mem: SrsMemory | null,
  now: number,
  prefs: StudyPrefs,
): number {
  if (!mem || isNewMemory(mem)) return 0;
  const card = toCard(mem);
  card.last_review ??= new Date(mem.due - mem.sd * DAY);
  return schedulerFor(prefs).get_retrievability(card, now, false);
}

/** "1m" "10m" "5h" "4d" "3mo" "1.5y" */
export function formatInterval(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.round((days / 365) * 10) / 10}y`;
}

/** When each grade would next show the item. */
export function intervalPreview(
  item: StudyItem,
  state: StudyCourseState,
  prefs: StudyPrefs,
  now: number,
): Record<SrsGrade, { due: number; label: string }> {
  const { mem } = memoryOf(item, state, prefs, now);
  const preview = schedulerFor(prefs).repeat(
    mem ? toCard(mem) : createEmptyCard(now),
    now,
  );
  const at = (grade: Grade) => {
    const due = preview[grade].card.due.getTime();
    return { due, label: formatInterval(due - now) };
  };
  return {
    1: at(Rating.Again),
    2: at(Rating.Hard),
    3: at(Rating.Good),
    4: at(Rating.Easy),
  };
}

// ── queues ───────────────────────────────────────────────────────────────

type Scored = { item: StudyItem; mem: SrsMemory; r: number };

const entryOf = (item: StudyItem, isNew: boolean): QueueEntry => ({
  cid: item.cid,
  key: item.key,
  isNew,
});

/** Today's log: reviews (ratings of items that were not new) and introductions. */
function todayCounts(state: StudyCourseState, day: string) {
  const log = state.rv[day];
  if (!log) return { reviewedToday: 0, introducedToday: 0 };
  return {
    reviewedToday: Math.max(0, log[0] + log[1] + log[2] + log[3] - log[4]),
    introducedToday: log[4],
  };
}

/** New items in `newOrder`: newest (or oldest) started week first, weekless items last; or a seeded shuffle. */
function orderNew(items: StudyItem[], prefs: StudyPrefs, seed: string) {
  if (prefs.newOrder === 'random') return seededShuffle(items, seed);
  const sign = prefs.newOrder === 'current-first' ? -1 : 1;
  return items.slice().sort((a, b) => {
    if (a.start !== b.start) {
      if (a.start === null) return 1;
      if (b.start === null) return -1;
      return sign * a.start.localeCompare(b.start);
    }
    return a.order - b.order;
  });
}

const byRetrievability = (a: Scored, b: Scored) =>
  a.r - b.r || a.mem.due - b.mem.due || a.item.order - b.item.order;

const started = (item: StudyItem, day: string) =>
  item.kind === 'mine' || item.start === null || item.start.slice(0, 10) <= day;

/** One course's share of today's queue, limits applied. */
function planCourse(course: CourseInput, prefs: StudyPrefs, now: number) {
  const day = studyDay(now, prefs.dayStartsAt);
  const nextStart = nextDayStart(now, prefs.dayStartsAt);
  const sources = effectiveSources(prefs, course.cid);
  const learning: Scored[] = [];
  const due: Scored[] = [];
  const fresh: StudyItem[] = [];
  for (const item of course.items) {
    if (!item.standalone || !sources[item.kind]) continue;
    const { mem } = memoryOf(item, course.state, prefs, now);
    if (mem?.sus) continue;
    if (!mem || isNewMemory(mem)) {
      if (started(item, day)) fresh.push(item);
    } else if (mem.st === 2) {
      if (mem.due < nextStart)
        due.push({ item, mem, r: retrievability(mem, now, prefs) });
    } else if (mem.due <= now + LEARN_AHEAD) learning.push({ item, mem, r: 0 });
  }
  const counts = todayCounts(course.state, day);
  const reviewCap = Math.max(0, prefs.reviewsPerDay - counts.reviewedToday);
  learning.sort((a, b) => a.mem.due - b.mem.due || a.item.order - b.item.order);
  due.sort(byRetrievability);
  const pickedLearning = learning.slice(0, reviewCap);
  return {
    ...counts,
    learning: pickedLearning.map(({ item }) => item),
    due: due
      .slice(0, reviewCap - pickedLearning.length)
      .map(({ item }) => item),
    fresh: orderNew(fresh, prefs, `${day}|${course.cid}|new`).slice(
      0,
      Math.max(0, prefs.newPerDay - counts.introducedToday),
    ),
  };
}

const reviewCourses = (courses: CourseInput[], prefs: StudyPrefs) =>
  courses.filter((course) => coursePrefs(prefs, course.cid).review);

/** Today's numbers for one course; `due` + `learning` + `newAvail` is what the daily queue holds. */
export type DailyCourseCounts = {
  due: number;
  learning: number;
  newAvail: number;
  reviewedToday: number;
  introducedToday: number;
};

/** Today's numbers per course included in Daily review (excluded courses are absent). */
export function dailyCounts(input: {
  courses: CourseInput[];
  prefs: StudyPrefs;
  now: number;
}): Record<string, DailyCourseCounts> {
  const out: Record<string, DailyCourseCounts> = {};
  for (const course of reviewCourses(input.courses, input.prefs)) {
    const plan = planCourse(course, input.prefs, input.now);
    out[course.cid] = {
      due: plan.due.length,
      learning: plan.learning.length,
      newAvail: plan.fresh.length,
      reviewedToday: plan.reviewedToday,
      introducedToday: plan.introducedToday,
    };
  }
  return out;
}

/** `news` spread evenly through `reviews`. */
function spread(reviews: QueueEntry[], news: QueueEntry[]) {
  const out: QueueEntry[] = [];
  let r = 0;
  news.forEach((entry, j) => {
    const upto = Math.round(((j + 1) * reviews.length) / (news.length + 1));
    while (r < upto) out.push(reviews[r++]);
    out.push(entry);
  });
  while (r < reviews.length) out.push(reviews[r++]);
  return out;
}

/**
 * Today's review across the courses included in Daily review: learning and
 * due items (most forgotten first, `reviewsPerDay` minus today's reviews),
 * then new items of started weeks (`newOrder`, `newPerDay` minus today's
 * introductions). Interleaved: a seeded shuffle with new items spread
 * evenly; otherwise per course: learning, due, new.
 */
export function buildDailyQueue(input: {
  courses: CourseInput[];
  prefs: StudyPrefs;
  now: number;
}): QueueEntry[] {
  const { prefs, now } = input;
  const courses = reviewCourses(input.courses, prefs);
  const plans = courses.map((course) => planCourse(course, prefs, now));
  if (!prefs.interleave)
    return plans.flatMap((plan) => [
      ...plan.learning.map((item) => entryOf(item, false)),
      ...plan.due.map((item) => entryOf(item, false)),
      ...plan.fresh.map((item) => entryOf(item, true)),
    ]);
  const seed = `${studyDay(now, prefs.dayStartsAt)}|${courses.map((course) => course.cid).join(',')}`;
  const reviews = plans.flatMap((plan) =>
    [...plan.learning, ...plan.due].map((item) => entryOf(item, false)),
  );
  const news = plans.flatMap((plan) =>
    plan.fresh.map((item) => entryOf(item, true)),
  );
  return spread(
    seededShuffle(reviews, `${seed}|reviews`),
    seededShuffle(news, `${seed}|new`),
  );
}

/**
 * A custom session: chosen courses (none = those in Daily review), weeks
 * (null = started weeks), kinds, and pick, without daily limits. `limit`
 * keeps the most forgotten reviews, then new items in `newOrder`.
 */
export function buildCustomQueue(input: {
  courses: CourseInput[];
  prefs: StudyPrefs;
  now: number;
  session: CustomSession;
  seed?: string;
}): QueueEntry[] {
  const { prefs, now, session } = input;
  const day = studyDay(now, prefs.dayStartsAt);
  const nextStart = nextDayStart(now, prefs.dayStartsAt);
  const courses = session.cids.length
    ? input.courses.filter((course) => session.cids.includes(course.cid))
    : reviewCourses(input.courses, prefs);
  const kinds = new Set(session.kinds);
  const seen: Scored[] = [];
  const fresh: StudyItem[] = [];
  for (const course of courses)
    for (const item of course.items) {
      if (!item.standalone || !kinds.has(item.kind)) continue;
      if (session.weeks) {
        const [from, to] = session.weeks;
        if (item.week === null || item.week < from || item.week > to) continue;
      } else if (!started(item, day)) continue;
      const { mem } = memoryOf(item, course.state, prefs, now);
      if (mem?.sus) continue;
      if (!mem || isNewMemory(mem)) {
        if (session.pick === 'new' || session.pick === 'all') fresh.push(item);
        continue;
      }
      const r = retrievability(mem, now, prefs);
      const keep =
        session.pick === 'all' ||
        (session.pick === 'due' &&
          (mem.st === 2
            ? mem.due < nextStart
            : mem.due <= now + LEARN_AHEAD)) ||
        (session.pick === 'ahead' &&
          mem.due < nextStart + session.aheadDays * DAY) ||
        (session.pick === 'weak' &&
          (mem.l >= 1 || r < 0.85 || legacyWrong(item, course.state)));
      if (keep) seen.push({ item, mem, r });
    }
  const seed = input.seed ?? `${day}|custom`;
  let picked = [
    ...seen.sort(byRetrievability).map(({ item }) => ({ item, isNew: false })),
    ...orderNew(fresh, prefs, `${seed}|new`).map((item) => ({
      item,
      isNew: true,
    })),
  ];
  if (session.limit > 0) picked = picked.slice(0, session.limit);
  if (session.order === 'mixed') picked = seededShuffle(picked, seed);
  else {
    const courseIndex = new Map(
      courses.map((course, index) => [course.cid, index] as const),
    );
    picked.sort(
      ({ item: a }, { item: b }) =>
        (courseIndex.get(a.cid) ?? 0) - (courseIndex.get(b.cid) ?? 0) ||
        (a.week ?? Infinity) - (b.week ?? Infinity) ||
        a.order - b.order,
    );
  }
  return picked.map(({ item, isNew }) => entryOf(item, isNew));
}

// ── rating ───────────────────────────────────────────────────────────────

export type UndoToken = {
  cid: string;
  key: string;
  prev: {
    srs?: SrsMemory;
    legacy?: {
      field: LegacyField;
      key: string;
      value: LegacyValue | undefined;
    };
    day: string;
    dayLog?: DayLog;
  };
};

/** First-learning record: what week completion reads. A later lapse never undoes it. */
function writeLegacy(
  state: StudyCourseState,
  item: StudyItem,
  grade: SrsGrade,
  opts: { answer?: string; ok?: boolean },
) {
  const key = legacyKeyOf(item);
  const ok = opts.ok ?? grade > 1;
  if (item.kind === 'card') {
    if (grade > 1) state.cards[key] = 'know';
    else if (state.cards[key] !== 'know') state.cards[key] = 'again';
  } else if (item.kind === 'quick' || item.kind === 'practice') {
    const field = item.kind === 'quick' ? state.lq : state.ww;
    field[key] ??= { a: opts.answer ?? '', ok };
  } else if (item.kind === 'parsons') {
    const prev = state.pz[key];
    state.pz[key] = { ok: Boolean(prev?.ok) || ok, n: (prev?.n ?? 0) + 1 };
  }
}

/**
 * Record a review: FSRS memory (unless `reschedule` is false), today's log,
 * and the first-learning legacy record. Mutates `state`; returns what
 * `undoRating` needs to put it back.
 */
export function rate(
  state: StudyCourseState,
  item: StudyItem,
  grade: SrsGrade,
  now: number,
  prefs: StudyPrefs,
  opts: {
    answer?: string;
    ok?: boolean;
    ms?: number;
    reschedule?: boolean;
  } = {},
): UndoToken {
  const day = studyDay(now, prefs.dayStartsAt);
  const stored = state.srs[item.key];
  const field = LEGACY_FIELD[item.kind];
  const token: UndoToken = { cid: item.cid, key: item.key, prev: { day } };
  if (stored) token.prev.srs = { ...stored };
  if (state.rv[day]) token.prev.dayLog = [...state.rv[day]];
  if (field) {
    const key = legacyKeyOf(item);
    const value = (state[field] as Record<string, LegacyValue>)[key];
    token.prev.legacy = {
      field,
      key,
      value: value && typeof value === 'object' ? { ...value } : value,
    };
  }
  if (opts.reschedule !== false) {
    const { mem } = memoryOf(item, state, prefs, now);
    const next = schedulerFor(prefs).next(
      mem ? toCard(mem) : createEmptyCard(now),
      now,
      grade as Grade,
    ).card;
    state.srs[item.key] = fromCard(next, stored?.sus);
    const log: DayLog = state.rv[day] ? [...state.rv[day]] : [0, 0, 0, 0, 0, 0];
    log[grade - 1] += 1;
    if (isNewMemory(mem)) log[4] += 1;
    log[5] += Math.max(0, Math.round(opts.ms ?? 0));
    state.rv[day] = log;
  }
  writeLegacy(state, item, grade, opts);
  return token;
}

/** `rate`, but only for an item without memory yet (first answers in week tabs); else null. */
export function rateIfNew(
  state: StudyCourseState,
  item: StudyItem,
  grade: SrsGrade,
  now: number,
  prefs: StudyPrefs,
  opts?: { answer?: string; ok?: boolean; ms?: number; reschedule?: boolean },
): UndoToken | null {
  if (!isNewMemory(memoryOf(item, state, prefs, now).mem)) return null;
  return rate(state, item, grade, now, prefs, opts);
}

/** Put back what `rate` changed. */
export function undoRating(state: StudyCourseState, token: UndoToken): void {
  const { key, prev } = token;
  if (prev.srs) state.srs[key] = { ...prev.srs };
  else delete state.srs[key];
  if (prev.dayLog) state.rv[prev.day] = [...prev.dayLog];
  else delete state.rv[prev.day];
  if (prev.legacy) {
    const record = state[prev.legacy.field] as Record<string, LegacyValue>;
    const { value } = prev.legacy;
    if (value === undefined) delete record[prev.legacy.key];
    else
      record[prev.legacy.key] =
        typeof value === 'object' ? { ...value } : value;
  }
}

/** Suspend (keep out of every queue) or unsuspend; suspending stores the current memory. */
export function setSuspended(
  state: StudyCourseState,
  item: StudyItem,
  on: boolean,
  now: number,
  prefs: StudyPrefs,
): void {
  const stored = state.srs[item.key];
  if (on) {
    const mem =
      stored ??
      memoryOf(item, state, prefs, now).mem ??
      fromCard(createEmptyCard(now));
    state.srs[item.key] = { ...mem, sus: 1 };
  } else if (stored?.sus) {
    const next = { ...stored };
    delete next.sus;
    state.srs[item.key] = next;
  }
}

/** Make the item new again (stores a New memory, keeping a suspension); legacy completion untouched. */
export function resetItem(
  state: StudyCourseState,
  item: StudyItem,
  now: number,
): void {
  state.srs[item.key] = fromCard(
    createEmptyCard(now),
    state.srs[item.key]?.sus,
  );
}

// ── stats ────────────────────────────────────────────────────────────────

/** Reviews due per study day; [0] = today including overdue and learning. */
export function forecast(input: {
  items: StudyItem[];
  state: StudyCourseState;
  prefs: StudyPrefs;
  now: number;
  days?: number;
}): number[] {
  const { items, state, prefs, now, days = 30 } = input;
  const out: number[] = Array.from({ length: days }, () => 0);
  const today = studyDay(now, prefs.dayStartsAt);
  const todayStart = dayStart(today, 0, prefs.dayStartsAt);
  const nextStart = nextDayStart(now, prefs.dayStartsAt);
  for (const item of items) {
    if (!item.standalone) continue;
    const { mem } = memoryOf(item, state, prefs, now);
    if (!mem || isNewMemory(mem) || mem.sus) continue;
    const index =
      mem.due < nextStart
        ? 0
        : Math.round(
            (dayStart(
              studyDay(mem.due, prefs.dayStartsAt),
              0,
              prefs.dayStartsAt,
            ) -
              todayStart) /
              DAY,
          );
    if (index < days) out[index] += 1;
  }
  return out;
}

/** Items by memory state; `mature` = review interval of 21 days or more. */
export function stateCounts(input: {
  items: StudyItem[];
  state: StudyCourseState;
  prefs: StudyPrefs;
  now: number;
}): {
  new: number;
  learning: number;
  review: number;
  mature: number;
  suspended: number;
} {
  const out = { new: 0, learning: 0, review: 0, mature: 0, suspended: 0 };
  for (const item of input.items) {
    const { mem } = memoryOf(item, input.state, input.prefs, input.now);
    if (mem?.sus) out.suspended += 1;
    else if (!mem || isNewMemory(mem)) out.new += 1;
    else if (mem.st !== 2) out.learning += 1;
    else if (mem.sd >= 21) out.mature += 1;
    else out.review += 1;
  }
  return out;
}

/** The last `days` study days' logs, oldest first (zeros for days without reviews). */
export function dayLogs(
  state: StudyCourseState,
  prefs: StudyPrefs,
  now: number,
  days: number,
): Array<{
  day: string;
  again: number;
  hard: number;
  good: number;
  easy: number;
  introduced: number;
  ms: number;
}> {
  const today = studyDay(now, prefs.dayStartsAt);
  return Array.from({ length: Math.max(0, days) }, (_, i) => {
    const day = shiftDay(today, i - days + 1);
    const [again, hard, good, easy, introduced, ms] = state.rv[day] ?? [
      0, 0, 0, 0, 0, 0,
    ];
    return { day, again, hard, good, easy, introduced, ms };
  });
}

/** Consecutive study days with at least one review in any course, ending today (or yesterday when today has none yet). */
export function streak(
  states: StudyCourseState[],
  prefs: StudyPrefs,
  now: number,
): number {
  const today = studyDay(now, prefs.dayStartsAt);
  const studied = (day: string) =>
    states.some((state) => {
      const log = state.rv[day];
      return Boolean(log) && log[0] + log[1] + log[2] + log[3] > 0;
    });
  let offset = studied(today) ? 0 : -1;
  let count = 0;
  while (studied(shiftDay(today, offset))) {
    count += 1;
    offset -= 1;
  }
  return count;
}
