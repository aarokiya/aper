import {
  TERM_ID,
  type Plan,
  type PlanRow,
  type PlanTerm,
  type PlannerRules,
  type Requirement,
} from './types';

/**
 * Pure course-planner logic shared by the planner page and the tests: course
 * codes in row names, requirement matching, hour totals, and term dates.
 */

/** 0 done (T, C), 1 in progress (IP), 2 planned (R, ALT, untagged). */
export type Rank = 0 | 1 | 2;
export const tagRank = (tag: string): Rank =>
  tag === 'T' || tag === 'C' ? 0 : tag === 'IP' ? 1 : 2;

export const sumHours = (rows: readonly PlanRow[]) =>
  rows.reduce((total, row) => total + (row.h || 0), 0);

/** 3 → "3", 2.5 → "2.5". */
export const formatHours = (hours: number) =>
  String(Math.round((hours || 0) * 10) / 10);

/** Words that look like a subject before a number ("or 2051") but aren't one. */
const NOT_SUBJECT: Record<string, true> = {
  OR: true,
  AND: true,
  OF: true,
  TO: true,
  IN: true,
  ON: true,
  THE: true,
  FOR: true,
  WITH: true,
  PART: true,
  FALL: true,
  SPRING: true,
  SUMMER: true,
  YEAR: true,
  AY: true,
};

/**
 * Course codes in a row name. "CS 4210 or 4220" gives CS 4210 and CS 4220,
 * "CEE/ISYE 3770" gives ISYE 3770, and "HTS 1XXX" counts as a code.
 */
export function courseCodes(name: string): string[] {
  const codes: string[] = [];
  const pattern = /\b([A-Z]{2,4}) ?(\d{4}[A-Z]?|\dXXX)\b|\b(\d{4}[A-Z]?)\b/g;
  let subject: string | null = null;
  for (const [, word, number, bare] of name.toUpperCase().matchAll(pattern)) {
    if (word && !NOT_SUBJECT[word]) {
      subject = word;
      codes.push(`${word} ${number}`);
    } else if (subject) codes.push(`${subject} ${number ?? bare}`);
  }
  return codes;
}

/**
 * When a term starts, roughly: S27 in January 2027, U27 in mid-May 2027,
 * F27 in mid-August 2027.
 */
export function termStart(id: string) {
  const match = TERM_ID.exec(id);
  if (!match) return null;
  const year = 2000 + Number(match[2]);
  const [month, day] = { S: [0, 1], U: [4, 15], F: [7, 15] }[
    match[1] as 'S' | 'U' | 'F'
  ];
  return new Date(year, month, day);
}

/** A plan's terms by academic year; each year holds one slot per season. */
export type PlanYears = {
  /** 2 (fall, spring) or 3 (fall, spring, summer) when any term is a summer */
  seasons: 2 | 3;
  years: Array<Array<PlanTerm | undefined>>;
};

/**
 * Groups terms into academic years: a fall, the spring after it, and that
 * summer (F26, S27, U27). A season the plan skips leaves its slot empty, so
 * each season keeps its column. Summer slots appear only when the plan has a
 * summer term.
 */
export function academicYears(terms: readonly PlanTerm[]): PlanYears {
  const seasons = terms.some((term) => term.id.startsWith('U')) ? 3 : 2;
  const years: PlanYears['years'] = [];
  let first: number | null = null;
  for (const term of terms) {
    const match = TERM_ID.exec(term.id);
    if (!match) continue;
    const season = 'FSU'.indexOf(match[1]);
    const year = Number(match[2]) - (season ? 1 : 0);
    first ??= year;
    const index = year - first;
    while (years.length <= index)
      years.push(Array.from({ length: seasons }, () => undefined));
    years[index][season] = term;
  }
  return { seasons, years };
}

/** The first term that hasn't started: the one Next semester options are for. */
export function nextTermId(plan: Plan, today: Date) {
  return (
    plan.terms.find((term) => (termStart(term.id) ?? today) > today) ??
    plan.terms[0]
  ).id;
}

/** The term under way today (the latest one that has started), if any. */
export function currentTermId(plan: Plan, today: Date) {
  let current: string | null = null;
  for (const term of plan.terms) {
    const start = termStart(term.id);
    if (start && start <= today) current = term.id;
  }
  return current;
}

export function planTotals(plan: Plan) {
  let done = 0;
  let inProgress = 0;
  let planned = 0;
  for (const row of [
    ...plan.xfer,
    ...plan.terms.flatMap((term) => term.rows),
  ]) {
    const rank = tagRank(row.k);
    if (rank === 0) done += row.h;
    else if (rank === 1) inProgress += row.h;
    else planned += row.h;
  }
  return {
    done,
    inProgress,
    planned,
    total: plan.hours,
    remaining: Math.max(0, plan.hours - done - inProgress),
    /** Credit that doesn't count toward the degree */
    surplus: sumHours(plan.extra),
  };
}

/**
 * Index of the term in which earned hours (all credit, then each term as
 * planned) reach 90, or -1. Georgia's legislative requirements must be done
 * before then.
 */
export function term90Index(plan: Plan) {
  let hours = sumHours(plan.xfer) + sumHours(plan.extra);
  for (const [index, term] of plan.terms.entries()) {
    hours += sumHours(term.rows);
    if (hours >= 90) return index;
  }
  return -1;
}

export type RequirementStatus = 'done' | 'ip' | 'plan' | 'miss';

/** A plan row as requirements see it. */
export type PlanRef = {
  row: PlanRow;
  /** Term id, `xfer`, or `extra` */
  block: string;
  /** Term index; -1 for credit you already have */
  term: number;
  codes: string[];
  text: string;
  rank: Rank;
  /** The name matches some requirement by code or phrase */
  named: boolean;
};

export type RequirementResult = {
  req: Requirement;
  /** The rows counted toward it, best first */
  take: PlanRef[];
  /** Courses or hours counted so far, and how many it needs */
  got: number;
  need: number;
  status: RequirementStatus;
};

/**
 * Matches plan rows to requirements, area by area. A row matches when a
 * course code in its name is listed, when its name contains a listed phrase,
 * or (if its name matches no requirement at all) when it was added for that
 * requirement. Each requirement takes its best rows: done, then in progress,
 * then planned, earliest term first. A row counts once, except in shared
 * areas, whose courses double-count.
 */
export function checkRequirements(
  plan: Plan,
  rules: Pick<PlannerRules, 'areas' | 'pairs'>,
): Record<string, RequirementResult> {
  const refs = [
    ...plan.xfer.map((row) => planRef(row, 'xfer', -1)),
    ...plan.terms.flatMap((term, index) =>
      term.rows.map((row) => planRef(row, term.id, index)),
    ),
  ];
  const reqs = rules.areas.flatMap((area) =>
    area.reqs.map((req) => ({ req, share: area.share ?? false })),
  );
  // The same test decides whether a row is named and what it counts toward.
  const matches = (ref: PlanRef, req: Requirement) =>
    req.opts.some((code) => ref.codes.includes(code)) ||
    req.keys.some((key) => ref.text.includes(key.toLowerCase()));
  for (const ref of refs) ref.named = reqs.some(({ req }) => matches(ref, req));

  const used = new Set<PlanRef>();
  const results: Record<string, RequirementResult> = {};
  for (const { req, share } of reqs) {
    const need = req.hrs ?? req.n ?? 1;
    // A row whose name matches no requirement counts toward the one it was added for.
    const candidates = refs
      .filter(
        (ref) =>
          (share || !used.has(ref)) &&
          (matches(ref, req) || (!ref.named && ref.row.r === req.id)),
      )
      .sort((a, b) => a.rank - b.rank || a.term - b.term);
    let take: PlanRef[] = [];
    let got = 0;
    if (req.seq) {
      take =
        sequencePair(refs, plan.extra, rules.pairs) ?? candidates.slice(0, 1);
      got = take.length ? need : 0;
    } else {
      for (const ref of candidates) {
        if (got >= need) break;
        take.push(ref);
        got += req.hrs ? ref.row.h : 1;
      }
      if (!share) take.forEach((ref) => used.add(ref));
    }
    const worst = Math.max(...take.map((ref) => ref.rank));
    results[req.id] = {
      req,
      take,
      got,
      need,
      status: got < need ? 'miss' : (['done', 'ip', 'plan'] as const)[worst],
    };
  }
  return results;
}

function planRef(row: PlanRow, block: string, term: number): PlanRef {
  return {
    row,
    block,
    term,
    codes: courseCodes(row.n),
    text: row.n.toLowerCase(),
    rank: tagRank(row.k),
    named: false,
  };
}

/** The best allowable lab-science pair among your courses, credit included. */
function sequencePair(
  refs: PlanRef[],
  extra: PlanRow[],
  pairs: PlannerRules['pairs'],
): PlanRef[] | null {
  // Elective credit is transfer credit that just doesn't count yet.
  const pool = refs.concat(
    extra.map((row) => ({
      ...planRef(row, 'extra', -1),
      rank: tagRank(row.k || 'T'),
    })),
  );
  let pick: PlanRef[] | null = null;
  for (const pair of pairs) {
    const found = pair.map(
      (code) =>
        pool
          .filter((ref) => ref.codes.includes(code))
          .sort((a, b) => a.rank - b.rank)[0],
    );
    if (found.some((ref) => !ref)) continue;
    const rank = Math.max(...found.map((ref) => ref.rank));
    if (!pick || rank < Math.max(...pick.map((ref) => ref.rank))) pick = found;
  }
  return pick;
}
