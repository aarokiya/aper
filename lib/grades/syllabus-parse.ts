export type SyllabusComponent = {
  /** label as written, cleaned of parentheticals/abbreviations, dates, and bullets: "Homework", "Weekly Canvas Quizzes + Syllabus Quiz", "Best Midterm", "Assessments", "Film techniques quiz" */
  label: string;
  /** percent of the course grade in total: "3 x 14%" -> 42; "each ... 25%" with a known count -> count * 25 */
  weight: number;
  /** items sharing it when stated: "3 x 14%", "(4 exams, ...)", "three examinations" */
  count: number | null;
  /** stated per-item weight: "each weighted equally at 21%" -> 21, "3 x 14%" -> 14 */
  each: number | null;
  /** Best/Highest -> 'best', Middle/Second -> 'middle', Worst/Lowest -> 'worst' (as a rank of the same kind of item, e.g. "Best Midterm") */
  rank: 'best' | 'middle' | 'worst' | null;
  /** the source line(s), whitespace-squashed */
  quote: string;
};
export type SyllabusDrop = { target: string; count: number; quote: string }; // count 0 = explicitly nothing dropped
export type SyllabusPool = {
  target: string; // "MQEW"
  cap: number; // points that make 100%
  sources: string[]; // labels of what earns pool points
  rates: Record<string, number>; // source label -> pool points per point ("1pt WeBWorK = 0.2pt MQEW")
  alternatives: string[][]; // groups of sources where only the larger total counts
  quote: string;
};
export type ParsedSyllabus = {
  components: SyllabusComponent[];
  /** lower bounds for A, B, C, D */
  cutoffs: [number, number, number, number] | null;
  cutoffsQuote: string | null;
  credits: number | null;
  drops: SyllabusDrop[];
  pools: SyllabusPool[];
  /** short sentences about penalties, deductions, bonuses, replacement rules, curves or rounding that a points/weights calculator would not capture */
  notes: string[];
};

type Line = {
  text: string;
  bullet: boolean;
  /** page headers/footers, repeated table headers, table-of-contents entries */
  noise: boolean;
  /** part of a letter-grade scale */
  scale: boolean;
};
type Sentence = { text: string; line: number; bullet: boolean };
type Candidate = SyllabusComponent & { line: number };

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
const NUM = String.raw`\d+|${Object.keys(NUMBER_WORDS).join('|')}`;
const PCT = String.raw`(\d+(?:\.\d+)?)\s*%`;
/** A label never ends in a function word; prose like "There is a 20%" does. */
const DANGLING_WORD =
  /\b(?:a|an|the|of|for|to|at|is|are|be|by|with|and|or|in|on|up|from|as|than|over|your|their|our|this|that|will|can|may|only)$/i;
const MAX_LABEL_WORDS = 8;

const BULLET = /^(?:[•●○◦▪■□➢►▸‣⁃∙·*\uE000-\uF8FF]|o(?=\s)|[-–—](?=\s))\s*/u;
const PAGE_MARK =
  /^(?:page\s+\d+(?:\s+of\s+\d+)?|\d+)$|\bpage\s+\d+\s+of\s+\d+\b/i;
const DOT_LEADER = /(?:\.\s?){5,}\s*\d*$/;
/** "~ assigned at least 10 ~" under a table row's label */
const TABLE_NOTE = /^~.*~$|^\(.*\)$/;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const round = (n: number) => Math.round(n * 1e4) / 1e4;
const wordCount = (s: string) => s.split(' ').filter(Boolean).length;

function toCount(word: string): number | null {
  const n = NUMBER_WORDS[word.toLowerCase()] ?? Number(word);
  return Number.isFinite(n) ? n : null;
}

/** Drops parenthesized text, including a paren left open or closed by a line break. */
function stripParens(s: string): string {
  let out = s;
  let prev;
  do {
    prev = out;
    out = out.replace(/\([^()]*\)/g, ' ');
  } while (out !== prev);
  return out.replace(/\([^)]*$/, ' ').replace(/^[^(]*\)/, ' ');
}

function parenContents(s: string): string {
  return [...s.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]).join(' ');
}

function prepareLines(text: string): Line[] {
  const lines = text.split(/\r?\n/).map((raw) => {
    const trimmed = squash(raw);
    const bullet = BULLET.test(trimmed);
    return { text: squash(trimmed.replace(BULLET, '')), bullet };
  });
  const seen = new Map<string, number>();
  const key = (s: string) => s.toLowerCase().replace(/\d+/g, '#');
  for (const l of lines)
    seen.set(key(l.text), (seen.get(key(l.text)) ?? 0) + 1);
  return lines.map((l) => ({
    ...l,
    noise:
      !l.text ||
      PAGE_MARK.test(l.text) ||
      DOT_LEADER.test(l.text) ||
      ((seen.get(key(l.text)) ?? 0) > 1 &&
        wordCount(l.text) >= 3 &&
        !/[%.!?]/.test(l.text) &&
        !TABLE_NOTE.test(l.text)),
    scale: scaleEntries(l.text).length > 0,
  }));
}

/** Groups wrapped lines into paragraphs/bullet items and splits them into sentences. */
function buildSentences(lines: Line[]): Sentence[] {
  const widths = lines
    .filter((l) => !l.noise)
    .map((l) => l.text.length)
    .sort((a, b) => a - b);
  // Wrapped prose fills the line; a clearly shorter line ends a heading or paragraph.
  const shortLine = 0.6 * (widths[Math.floor(widths.length * 0.75)] ?? 0);
  const segments: Sentence[] = [];
  let prev: string | undefined;
  lines.forEach((l, i) => {
    if (l.noise) return;
    const last = segments.at(-1);
    const afterShort =
      prev != null &&
      prev.length < shortLine &&
      !/[,;\-–]$/.test(prev) &&
      !DANGLING_WORD.test(prev) &&
      /^["“(]?[A-Z0-9]/.test(l.text);
    if (!last || l.bullet || afterShort) {
      segments.push({ text: l.text, line: i, bullet: l.bullet });
    } else if (/\w-$/.test(last.text) && /^[a-z]/.test(l.text)) {
      last.text += l.text;
    } else {
      last.text += ` ${l.text}`;
    }
    prev = l.text;
  });
  return segments.flatMap((seg) =>
    seg.text
      .split(/(?<=[.!?])\s+(?=["“‘([]?[A-Z0-9])/)
      .map((text, i) => ({
        text: text.trim(),
        line: seg.line,
        bullet: seg.bullet && i === 0,
      }))
      .filter((s) => s.text),
  );
}

// ---------------------------------------------------------------- cutoffs

const LETTER_RANGE =
  /(?:^|[,;]\s*)([A-F])[+-]?\s*(?:[:=]\s*)?[[(]?\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:-|–|—|,|to)\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*[\])]?/g;
const LETTER_FLOOR =
  /^([A-F])[+-]?\s*[:=]?\s*(?:(?:≥|>=|>)\s*(\d{1,3}(?:\.\d+)?)|(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:and above|or above|or higher|and up|\+))/i;
const RANGE_LETTER =
  /^(?:(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:-|–|—|to)\s*(\d{1,3}(?:\.\d+)?)|(?:<|<=|≤|>|>=|≥)\s*(\d{1,3}(?:\.\d+)?))\s*%?\s*[:=]?\s*([A-F])[+-]?$/;
const SEQUENCE =
  /\b(\d{2,3})\s*([/-])\s*(\d{2})\s*\2\s*(\d{2})\s*\2\s*(\d{2})\b/;
const SEQUENCE_CONTEXT =
  /system|scale|cutoff|dividing|letter|A\s*\/\s*B\s*\/\s*C/i;

/** Letter -> lower bound for every grade-scale entry on the line. */
function scaleEntries(text: string): [string, number][] {
  const entries: [string, number][] = [];
  for (const m of text.matchAll(LETTER_RANGE)) {
    const [a, b] = [Number(m[2]), Number(m[3])];
    if (a <= 100 && b <= 100) entries.push([m[1], Math.min(a, b)]);
  }
  if (entries.length) return entries;
  const floor = LETTER_FLOOR.exec(text);
  if (floor) return [[floor[1].toUpperCase(), Number(floor[2] ?? floor[3])]];
  const range = RANGE_LETTER.exec(text);
  if (range) {
    const low =
      range[1] != null ? Math.min(Number(range[1]), Number(range[2])) : 0;
    return [[range[4], low]];
  }
  return [];
}

const isDescending = (c: number[]) =>
  c.length === 4 && c.every((v, i) => v <= 100 && (i === 0 || v < c[i - 1]));

function findCutoffs(lines: Line[], sentences: Sentence[]) {
  const runs: Line[][] = [];
  let gap = Infinity;
  for (const l of lines) {
    if (l.noise) continue;
    if (!l.scale) {
      gap++;
      continue;
    }
    if (gap > 1) runs.push([]);
    runs.at(-1)!.push(l);
    gap = 0;
  }
  for (const run of runs) {
    // "A+", "A" and "A-" all count toward A's lower bound
    const bounds: Record<string, number> = {};
    for (const l of run)
      for (const [letter, low] of scaleEntries(l.text))
        bounds[letter] = Math.min(low, bounds[letter] ?? Infinity);
    const cutoffs = ['A', 'B', 'C', 'D'].map((k) => bounds[k]);
    if (isDescending(cutoffs))
      return {
        cutoffs: cutoffs as [number, number, number, number],
        quote: run.map((l) => l.text).join(' '),
      };
  }
  for (const s of sentences) {
    const m = SEQUENCE.exec(s.text);
    if (!m || !SEQUENCE_CONTEXT.test(s.text)) continue;
    const values = [m[1], m[3], m[4], m[5]].map(Number).sort((a, b) => b - a);
    if (isDescending(values))
      return {
        cutoffs: values as [number, number, number, number],
        quote: s.text,
      };
  }
  return null;
}

// ---------------------------------------------------------------- components

const RANKS: [RegExp, SyllabusComponent['rank']][] = [
  [/^(?:best|highest|top)\b/i, 'best'],
  [/^(?:middle|median|second[- ](?:best|highest))\b/i, 'middle'],
  [/^(?:worst|lowest)\b/i, 'worst'],
];

function cleanLabel(raw: string): { label: string; count: number | null } {
  let s = raw
    .replace(/~[^~]*~/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
    .replace(/^\s*(?:\d+(?:\.\d+)+\.?|\d+\.|[a-z]\)|\([a-z0-9]\))\s+/i, '');
  const colon = s.lastIndexOf(':');
  if (colon >= 0 && s.slice(colon + 1).trim()) s = s.slice(colon + 1);
  s = squash(s.replace(/^\s*(?:and|&)\s+/i, '').replace(/[\s:=,;.\-–—]+$/, ''));
  const counted = new RegExp(
    String.raw`^(${NUM})\s+(?=[A-Za-z].*s$)`,
    'i',
  ).exec(s);
  if (counted)
    return { label: s.slice(counted[0].length), count: toCount(counted[1]) };
  return { label: s, count: null };
}

const isLabel = (label: string) =>
  /^[A-Za-z]/.test(label) &&
  /[A-Za-z].*[A-Za-z]/.test(label) &&
  wordCount(label) <= MAX_LABEL_WORDS &&
  !DANGLING_WORD.test(label) &&
  !/[.!?]\s/.test(label) &&
  !/^[A-F][+-]?(?:\s|$)/.test(label) &&
  !/^(?:total|percent|percentage|weight|grade)\b/i.test(label);

function eachIn(paren: string): number | null {
  const m =
    new RegExp(String.raw`(?:${NUM})\s*[x×*@]\s*${PCT}`, 'i').exec(paren) ??
    /\beach\b[^%]*?(\d+(?:\.\d+)?)\s*%/i.exec(paren) ??
    /(\d+(?:\.\d+)?)\s*%\s*(?:each|apiece)\b/i.exec(paren);
  return m ? Number(m[1]) : null;
}

function countIn(paren: string): number | null {
  const times = new RegExp(String.raw`(${NUM})\s*[x×*@]\s*\d`, 'i').exec(paren);
  if (times) return toCount(times[1]);
  const lead = new RegExp(
    String.raw`^\s*(${NUM})\s+(?!(?:pts?|points?|percent|marks?|hours?|hrs?|minutes?|mins?)\b)[a-z]`,
    'i',
  ).exec(paren);
  return lead ? toCount(lead[1]) : null;
}

function makeComponent(
  rawLabel: string,
  pct: number,
  extra: { count?: number | null; each?: number | null; perItem?: boolean },
  quote: string,
  line: number,
): Candidate | null {
  const timesTail = new RegExp(String.raw`\s(${NUM})\s*[x×*@]$`, 'i').exec(
    rawLabel,
  );
  const cleaned = cleanLabel(
    timesTail ? rawLabel.slice(0, timesTail.index) : rawLabel,
  );
  if (!isLabel(cleaned.label)) return null;
  let count = extra.count ?? cleaned.count;
  let each = extra.each ?? null;
  let weight = pct;
  if (timesTail) {
    count = toCount(timesTail[1]);
    each = pct;
    weight = count == null ? pct : count * pct;
  } else if (extra.perItem) {
    each = pct;
    if (count != null) weight = count * pct;
  }
  return {
    label: cleaned.label,
    weight: round(weight),
    count,
    each,
    rank: RANKS.find(([re]) => re.test(cleaned.label))?.[1] ?? null,
    quote: squash(quote),
    line,
  };
}

/** Splits at commas/semicolons that sit outside parentheses. */
function topLevelParts(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth = Math.max(0, depth - 1);
    else if ((s[i] === ',' || s[i] === ';') && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

const ROW = new RegExp(
  String.raw`^(.*?[A-Za-z].*?)\s*[:=\-–—]?\s*${PCT}\s*(.*)$`,
);
const SIGNED = new RegExp(String.raw`(?:^|[\s:(])[-−+]${PCT}`);
const ROW_TAIL =
  /^(?:[.)]*|(?:each|apiece)\b.*|(?:of|toward|towards|for)\b.*\bgrade\b.*)$/i;
const PAREN_ONLY = new RegExp(
  String.raw`^\s*${PCT}\s*(?:of\s+(?:the\s+|your\s+)?(?:final\s+|course\s+)?grade)?\s*$`,
  'i',
);
const BARE_PCT = new RegExp(String.raw`^${PCT}$`);

/** Label/percent pairs written as table rows or list items. */
function rowCandidates(text: string, line: number): Candidate[] {
  const outside = stripParens(text);
  if (SIGNED.test(outside)) return [];
  const percents = outside.match(/%/g)?.length ?? 0;
  if (percents === 0) {
    // "Project Proposal (5%): description" / "Midterm (25%)"
    const m = /^([^()]+?)\s*\(([^()]*)\)\s*(?::.*)?$/.exec(text);
    const pct = m && PAREN_ONLY.exec(m[2]);
    const c = pct && makeComponent(m[1], Number(pct[1]), {}, text, line);
    return c ? [c] : [];
  }
  const parts = percents > 1 ? topLevelParts(text) : [text];
  const out: Candidate[] = [];
  for (const part of parts) {
    const m = ROW.exec(stripParens(part).trim());
    if (!m) continue;
    const [, label, pct, tail] = m;
    if (!ROW_TAIL.test(tail.trim())) return [];
    const paren = parenContents(part);
    const c = makeComponent(
      label,
      Number(pct),
      {
        count: countIn(paren),
        each: eachIn(paren),
        perItem: /^(?:each|apiece)\b/i.test(tail.trim()),
      },
      parts.length > 1 ? part : text,
      line,
    );
    if (!c) return [];
    out.push(c);
  }
  return out;
}

function structuredCandidates(lines: Line[]): Candidate[] {
  const out: Candidate[] = [];
  const used = new Set<number>();
  lines.forEach((l, i) => {
    if (l.noise || l.scale) return;
    const bare = BARE_PCT.exec(l.text);
    if (!bare) {
      const found = rowCandidates(l.text, i);
      if (found.length) used.add(i);
      out.push(...found);
      return;
    }
    // split row: label line, optional "~ note ~" lines, then the percent alone
    const picked: number[] = [];
    for (let j = i - 1; j >= 0 && picked.length < 3; j--) {
      if (lines[j].noise) continue;
      picked.unshift(j);
      if (TABLE_NOTE.test(lines[j].text)) continue;
      const labelLine = lines[j];
      if (
        used.has(j) ||
        labelLine.scale ||
        /%/.test(stripParens(labelLine.text))
      )
        return;
      const quote = [...picked.map((k) => lines[k].text), l.text].join(' ');
      const paren = picked.map((k) => parenContents(lines[k].text)).join(' ');
      const c = makeComponent(
        stripParens(labelLine.text),
        Number(bare[1]),
        { count: countIn(paren), each: eachIn(paren) },
        quote,
        j,
      );
      if (c) {
        used.add(j);
        out.push(c);
      }
      return;
    }
  });
  return out;
}

const PROSE_PCT = new RegExp(
  String.raw`${PCT}\s+of\s+(?:the\s+|your\s+)?(?:(?:final|total|overall|course)\s+)*grade`,
  'i',
);
const PROSE_VERB =
  /\s(?:counts?|will|is|are|accounts?|worth|makes?|comprises?|constitutes?|carr(?:y|ies)|weighs?|weighted|=)\b/i;

/** "Exams (each is 50 points, 25% of your grade) will ..." */
function proseCandidates(sentences: Sentence[]): Candidate[] {
  const out: Candidate[] = [];
  for (const s of sentences) {
    const m = PROSE_PCT.exec(s.text);
    if (!m) continue;
    const before = s.text.slice(0, m.index);
    const subject = before
      .replace(/^\s*(?:\d+(?:\.\d+)*\.?\s+)/, '')
      .split(/\(/)[0];
    const verb = PROSE_VERB.exec(` ${subject}`);
    if (!verb && !before.includes('(')) continue;
    const raw = (verb ? ` ${subject}`.slice(0, verb.index) : subject)
      .replace(/^\s*(?:a|an|the)\s+(?:set|series|number)\s+of\s+/i, '')
      .replace(/^\s*(?:a|an|the|your)\s+/i, '')
      .replace(/\s+(?:scores?|grades?)\s*$/i, '');
    const label = raw.trim().replace(/^\w/, (c) => c.toUpperCase());
    if (wordCount(label) > 6) continue;
    const perItem = /\beach\b/i.test(before.slice(before.indexOf('(') + 1));
    const c = makeComponent(label, Number(m[1]), { perItem }, s.text, s.line);
    if (c && !out.some((o) => o.label.toLowerCase() === c.label.toLowerCase()))
      out.push(c);
  }
  return out;
}

/** A per-item weight with no count takes it from "three examinations" anywhere in the text. */
function withStatedCount(c: Candidate, sentences: Sentence[]): Candidate {
  if (c.count != null || c.each == null || c.each !== c.weight) return c;
  const head = c.label.toLowerCase().split(' ').at(-1)!.replace(/s$/, '');
  const stem = head.startsWith('exam')
    ? 'exam(?:ination)?'
    : head.replace(/[^a-z]/g, '');
  if (!stem) return c;
  const re = new RegExp(
    String.raw`\b(${NUM})\s+(?:[a-z-]+\s+)?${stem}s?\b`,
    'i',
  );
  for (const s of sentences) {
    const m = re.exec(s.text);
    const count = m && toCount(m[1]);
    if (count != null && count >= 2 && count <= 30)
      return { ...c, count, weight: round(count * c.each) };
  }
  return c;
}

/** Splits candidates into runs of nearby lines (page breaks and headers don't count). */
function clusters(candidates: Candidate[], lines: Line[]): Candidate[][] {
  const groups: Candidate[][] = [];
  const contentIndex: number[] = [];
  let n = 0;
  for (const l of lines) contentIndex.push(l.noise ? n : n++);
  const MAX_GAP = 3;
  for (const c of [...candidates].sort((a, b) => a.line - b.line)) {
    const last = groups.at(-1)?.at(-1);
    if (last && contentIndex[c.line] - contentIndex[last.line] <= MAX_GAP)
      groups.at(-1)!.push(c);
    else groups.push([c]);
  }
  return groups;
}

const WEIGHT_TOLERANCE = 10;

/**
 * Picks the contiguous run of candidates whose weights sum closest to 100,
 * preferring table rows over prose, then longer runs, then earlier ones.
 */
function chooseComponents(
  structured: Candidate[][],
  prose: Candidate[],
): Candidate[] {
  let best: { run: Candidate[]; score: number[] } | null = null;
  const options = [
    ...structured.map((g) => [g, 0] as const),
    [prose, 1] as const,
  ];
  for (const [group, kind] of options) {
    for (let i = 0; i < group.length; i++) {
      let sum = 0;
      for (let j = i; j < group.length; j++) {
        sum += group[j].weight;
        const score = [round(Math.abs(sum - 100)), kind, i - j, group[i].line];
        const k = best ? score.findIndex((v, n) => v !== best!.score[n]) : 0;
        if (!best || (k >= 0 && score[k] < best.score[k]))
          best = { run: group.slice(i, j + 1), score };
      }
    }
  }
  return best && best.score[0] <= WEIGHT_TOLERANCE ? best.run : [];
}

// ---------------------------------------------------------------- credits

const CREDIT_PATTERNS = [
  /\b(\d+(?:\.\d+)?)\s*-?\s*(?:credit|cr\.?)\s*(?:hours?|hrs?)\b/i,
  /\bcredit\s*(?:hours?|hrs?)?\s*[:=]\s*(\d+(?:\.\d+)?)/i,
  /\b(\d+(?:\.\d+)?)\s*credits?\s*(?:[.)]|$)/i,
];

function findCredits(lines: Line[]): number | null {
  for (const l of lines) {
    for (const re of CREDIT_PATTERNS) {
      const n = Number(re.exec(l.text)?.[1]);
      if (n > 0 && n <= 12) return n;
    }
  }
  return null;
}

// ---------------------------------------------------------------- drops

const TARGET = String.raw`((?:[a-z][a-z-]*\s+){0,2}?[a-z][a-z-]*)`;
const GRADE_WORD = String.raw`(?:grades?|scores?)`;
const DROP_PATTERNS: [
  RegExp,
  (m: RegExpExecArray) => [string, number | null],
][] = [
  [
    new RegExp(
      String.raw`\bno\s+${TARGET}\s+(?:${GRADE_WORD}\s+)?(?:will\s+be|are|is|get)\s+dropped`,
      'i',
    ),
    (m) => [m[1], 0],
  ],
  [
    new RegExp(
      String.raw`\b${TARGET}\s+${GRADE_WORD}\s+(?:will\s+not|won't|are\s+not|aren't)\s+be\s+dropped`,
      'i',
    ),
    (m) => [m[1], 0],
  ],
  [
    new RegExp(
      String.raw`\b(?:(${NUM})\s+)?lowest\s+(?:(${NUM})\s+)?${TARGET}\s+(?:${GRADE_WORD}\s+)?(?:will\s+be|is|are|gets?)\s+dropped`,
      'i',
    ),
    (m) => [m[3], toCount(m[1] ?? m[2] ?? 'one')],
  ],
  [
    new RegExp(
      String.raw`\bdrop(?:s|ping)?\s+(?:the\s+|your\s+)?(?:(${NUM})\s+)?(?:lowest|worst)\s+(?:(${NUM})\s+)?(?:${GRADE_WORD}\s+(?:for|on|in|from|of)\s+(?:your\s+|the\s+|all\s+)?)?${TARGET}(?=\s+${GRADE_WORD}\b|[.,;:)]|\s+(?:and|at|in|from|during|for|this|each|per|will)\b|$)`,
      'i',
    ),
    (m) => [m[3], toCount(m[1] ?? m[2] ?? 'one')],
  ],
];

function findDrops(sentences: Sentence[]): SyllabusDrop[] {
  const drops: SyllabusDrop[] = [];
  for (const s of sentences) {
    for (const [re, read] of DROP_PATTERNS) {
      const m = re.exec(s.text);
      if (!m) continue;
      const [raw, count] = read(m);
      const target = raw
        .replace(/^(?:the|your|all|any)\s+/i, '')
        .replace(new RegExp(String.raw`\s+${GRADE_WORD}$`, 'i'), '')
        .trim();
      if (count == null || !target) continue;
      if (!drops.some((d) => d.target === target && d.count === count))
        drops.push({ target, count, quote: s.text });
      break;
    }
  }
  return drops;
}

// ---------------------------------------------------------------- pools

function abbreviations(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of text.matchAll(
    /\b([A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,3})\s+\(([A-Z]{2,6})\)/g,
  ))
    if (!map.has(m[2])) map.set(m[2], m[1]);
  return map;
}

function findPools(
  sentences: Sentence[],
  components: SyllabusComponent[],
): SyllabusPool[] {
  const pools: SyllabusPool[] = [];
  const all = sentences.map((s) => s.text).join(' ');
  const abbr = abbreviations(all);
  for (const s of sentences) {
    const m =
      /\b([A-Z][A-Za-z]{1,15})\s+(?:pts|points)\s+out\s+of\s+(\d+)\s*(?:pts|points)\b/.exec(
        s.text,
      ) ??
      /\b([A-Z][A-Za-z]{1,15})\s+(?:pts|points|score)\s+(?:is|are)\s+capped\s+at\s+(\d+)/.exec(
        s.text,
      );
    if (!m) continue;
    // the capture is letters only, so it embeds in a RegExp as-is
    const target = m[1];
    if (pools.some((p) => p.target === target)) continue;
    if (
      !components.some((c) => new RegExp(`\\b${target}\\b`, 'i').test(c.label))
    )
      continue;
    const quote = [s.text];
    const sources: string[] = [];
    const listRe = new RegExp(
      String.raw`(?:ways\s+to\s+(?:accumulate|earn|get)\s+${target}\s+(?:pts|points)|${target}\s+(?:pts|points)\s+(?:can\s+be|are)\s+(?:earned|accumulated)\s+(?:from|through|by|via))\s*:?\s*([^.]+)`,
      'i',
    );
    for (const t of sentences) {
      const list = listRe.exec(t.text);
      if (!list) continue;
      for (const item of list[1].split(/,\s*(?:and\s+)?|\s+and\s+/)) {
        const pair = /^(\S+)\/(\S+)\s/.exec(item.trim());
        const names = pair ? [pair[1], pair[2]] : [item.trim()];
        for (const n of names) if (n && !sources.includes(n)) sources.push(n);
      }
      if (t !== s) quote.push(t.text);
      break;
    }
    const resolve = (token: string) => {
      const name = (abbr.get(token) ?? token).toLowerCase();
      return (
        sources.find((src) => src.toLowerCase() === name) ??
        sources.find((src) => {
          const l = src.toLowerCase();
          return l.includes(name) || name.includes(l);
        }) ??
        null
      );
    };
    const rates: Record<string, number> = {};
    const rateRe = new RegExp(
      String.raw`\b(\d+(?:\.\d+)?)\s*(?:pts?|points?)\s+(\S+)\s*=\s*(\d+(?:\.\d+)?)\s*(?:pts?|points?)\s+${target}\b`,
      'gi',
    );
    for (const r of all.matchAll(rateRe)) {
      const source = resolve(r[2]);
      if (source) rates[source] = round(Number(r[3]) / Number(r[1]));
    }
    const alternatives: string[][] = [];
    for (const t of sentences) {
      if (!/\bonly\s+the\s+(?:higher|larger|greater|better)\b/i.test(t.text))
        continue;
      const either = /\beither\s+([A-Z][\w-]*)\s+or\s+([A-Z][\w-]*)/.exec(
        t.text,
      );
      const group = either ? [resolve(either[1]), resolve(either[2])] : [];
      if (
        group.length &&
        group.every((g) => g != null) &&
        group[0] !== group[1]
      )
        alternatives.push(group as string[]);
    }
    pools.push({
      target,
      cap: Number(m[2]),
      sources,
      rates,
      alternatives,
      quote: quote.join(' '),
    });
  }
  return pools;
}

// ---------------------------------------------------------------- notes

const NOTE_KEY =
  /penal|deduct|bonus|extra credit|replace|substitut|averaged with|curv(?:e|ed|ing)\b|\bround(?:ed|ing)?\b|reduction|downgrad|(?:^|[\s:])[-−]\d+(?:\.\d+)?%/i;
const NOTE_GRADE = /\bgrades?\b|\bscores?\b|\baverage\b|%/i;
const NOTE_SKIP =
  /honor code|plagiar|cheat|misconduct|dishonest|academic integrity|\bOSI\b|chatgpt|\bAI\b|\blate\b|\bdue\b|deadline|regrade|re-grade|extension|covid/i;
const MAX_NOTE_LENGTH = 400;

function findNotes(sentences: Sentence[]): string[] {
  const notes: string[] = [];
  let lastNote = -2;
  sentences.forEach((s, i) => {
    const t = s.text;
    if (
      t.length > MAX_NOTE_LENGTH ||
      !NOTE_KEY.test(t) ||
      !NOTE_GRADE.test(t) ||
      NOTE_SKIP.test(t)
    )
      return;
    const prev = sentences[i - 1];
    if (s.bullet && lastNote === i - 1 && prev?.bullet) {
      notes[notes.length - 1] += `; ${t}`;
    } else if (s.bullet && prev?.text.endsWith(':')) {
      notes.push(`${prev.text} ${t}`);
    } else if (!notes.includes(t)) {
      notes.push(t);
    }
    lastNote = i;
  });
  return notes;
}

// ---------------------------------------------------------------- entry

export function parseSyllabus(text: string): ParsedSyllabus {
  const lines = prepareLines(text);
  const sentences = buildSentences(lines);
  const cutoffs = findCutoffs(lines, sentences);
  const structured = clusters(
    structuredCandidates(lines).map((c) => withStatedCount(c, sentences)),
    lines,
  );
  const prose = proseCandidates(sentences).map((c) =>
    withStatedCount(c, sentences),
  );
  const chosen = chooseComponents(structured, prose).map(
    ({ line: _line, ...c }) => c,
  );
  // "Second" is a rank only beside other ranked items; alone it is an ordinal.
  if (chosen.some((c) => c.rank))
    for (const c of chosen)
      if (!c.rank && /^second\b/i.test(c.label)) c.rank = 'middle';
  return {
    components: chosen,
    cutoffs: cutoffs?.cutoffs ?? null,
    cutoffsQuote: cutoffs?.quote ?? null,
    credits: findCredits(lines),
    drops: findDrops(sentences),
    pools: findPools(sentences, chosen),
    notes: findNotes(sentences),
  };
}
