import { academicYears, formatHours, planTotals, sumHours } from './check';
import type { Plan, PlanRow, PlanTerm } from './types';

/**
 * The plan as a one-page Letter PDF in the familiar Georgia Tech four-year
 * plan layout: next-semester options, a fall/spring grid per year (with a
 * summer band when the year has one), credit bands, notes, and a tag key.
 * Helvetica is a PDF standard font with Arial's metrics, so nothing is
 * embedded; the notes are Helvetica at 82% width to stand in for Arial
 * Narrow. Pure: returns the whole file as an ASCII string.
 */

// Adobe Helvetica and Helvetica-Bold advance widths (1/1000 em) for WinAnsi
// codes 32–255. The oblique faces share them.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584, 0, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000,
  667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000,
  500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737,
  370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333,
  333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722,
  667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778,
  584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556,
  889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556,
  556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
  556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584, 0, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000,
  667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000,
  556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737,
  370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333,
  333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722,
  667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778,
  584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556,
  889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611,
  611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556,
];
// Unicode code points of WinAnsi's 0x80–0x9F block (dashes, curly quotes,
// bullet, ellipsis, …). Latin-1 maps to itself; anything else prints as "?".
const WIN_ANSI: Record<number, number> = {
  338: 140,
  339: 156,
  352: 138,
  353: 154,
  376: 159,
  381: 142,
  382: 158,
  402: 131,
  710: 136,
  732: 152,
  8211: 150,
  8212: 151,
  8216: 145,
  8217: 146,
  8218: 130,
  8220: 147,
  8221: 148,
  8222: 132,
  8224: 134,
  8225: 135,
  8226: 149,
  8230: 133,
  8240: 137,
  8249: 139,
  8250: 155,
  8364: 128,
  8482: 153,
};

type Color = readonly [number, number, number];
// The sheet's own colors. They belong to the PDF only; the app keeps its tokens.
const INK: Color = [0, 0, 0];
const WHITE: Color = [1, 1, 1];
const NAVY: Color = [0, 0.125, 0.376];
const GOLD: Color = [1, 0.753, 0];
const PEACH: Color = [0.988, 0.894, 0.839];
const GREEN: Color = [0.776, 0.937, 0.808];
const GREEN_INK: Color = [0, 0.38, 0];
const YELLOW: Color = [1, 0.922, 0.612];
const YELLOW_INK: Color = [0.612, 0.341, 0];
const BLUE: Color = [0.741, 0.843, 0.933];
const GRAY: Color = [0.906, 0.902, 0.902];
const KEY_GREEN: Color = [0.722, 0.871, 0.749];
const FILL: Record<string, Color> = {
  T: GREEN,
  C: GREEN,
  R: YELLOW,
  ALT: BLUE,
  IP: GRAY,
};
const TEXT_COLOR: Record<string, Color> = {
  T: GREEN_INK,
  C: GREEN_INK,
  R: YELLOW_INK,
};

/** 0 regular, 1 bold, 2 italic, 3 bold italic: bold when the low bit is set. */
type Face = 0 | 1 | 2 | 3;
type Run = { text: string; face: Face };
type TextOptions = {
  face?: Face;
  size?: number;
  color?: Color;
  align?: 'left' | 'center' | 'right';
  /** Shrink a little, then cut with an ellipsis, to stay inside this width */
  maxWidth?: number;
  /** Horizontal scale in percent */
  scale?: number;
};
type Draw =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: Color }
  | {
      kind: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      width: number;
      dotted: boolean;
    }
  | ({
      kind: 'text';
      text: string;
      x: number;
      y: number;
      rotated: boolean;
    } & Required<Omit<TextOptions, 'maxWidth'>> &
      Pick<TextOptions, 'maxWidth'>);

/** The WinAnsi code for a character; control characters print as spaces. */
function winAnsi(char: string) {
  const code = char.codePointAt(0) ?? 63;
  if (code < 32) return 32;
  return code < 128 || (code > 159 && code < 256)
    ? code
    : (WIN_ANSI[code] ?? 63);
}

export function textWidth(text: string, bold: boolean, size: number) {
  let width = 0;
  for (const char of text) {
    const code = winAnsi(char);
    if (code > 31) width += (bold ? HELVETICA_BOLD : HELVETICA)[code - 32];
  }
  return (width * size) / 1000;
}

/** A PDF literal string; everything outside printable ASCII is escaped. */
function pdfString(text: string) {
  let out = '(';
  for (const char of text) {
    const code = winAnsi(char);
    if (code === 40 || code === 41 || code === 92) out += `\\${char}`;
    else if (code > 126) out += `\\${code.toString(8)}`;
    else out += String.fromCharCode(code);
  }
  return `${out})`;
}

/**
 * Splits styled runs into lines no wider than maxWidth, breaking only at
 * ordinary spaces (non-breaking spaces hold a unit like "CS 1XXX (2)"
 * together). Continuation lines drop their leading spaces.
 */
function wrapRuns(runs: Run[], maxWidth: number, size: number, scale: number) {
  const lines: Run[][] = [[]];
  const ratio = scale / 100;
  let width = 0;
  for (const run of runs)
    for (let token of run.text.match(/ +|[^ ]+ */g) ?? []) {
      const bold = (run.face & 1) === 1;
      if (
        width > 0 &&
        token.trim() &&
        width + textWidth(token.replace(/ +$/, ''), bold, size) * ratio >
          maxWidth
      ) {
        lines.push([]);
        width = 0;
      }
      if (width === 0 && lines.length > 1) token = token.replace(/^ +/, '');
      if (!token) continue;
      lines[lines.length - 1].push({ text: token, face: run.face });
      width += textWidth(token, bold, size) * ratio;
    }
  return lines;
}

/** "Transfer credit" bands list each course's code and hours: "CS 1301 (3)". */
function creditRuns(rows: PlanRow[]): Run[] {
  const items = rows.map((row) =>
    `${(/^[A-Z]{2,4} ?[\dX]{4}\S*/.exec(row.n) ?? [row.n])[0]} (${formatHours(row.h)})`.replace(
      / /g,
      '\u00a0',
    ),
  );
  return [
    { text: `${formatHours(sumHours(rows))} HOURS`, face: 1 },
    { text: ` | ${items.join(', ')}`, face: 0 },
  ];
}

export function planPdf(plan: Plan, today: Date, now = new Date()) {
  // Page coordinates in points: x from the page's left edge, y down from the
  // top margin.
  const L = 18;
  const R = 594;
  const SEM = 45.5;
  const HR = 284.9;
  const TAG = 303.1;
  const GUTTER = 326.9;
  const R0 = 334.6;
  const RHR = 548.1;
  const RTAG = 569.6;
  const ROW = 10.5;
  const NAME_ROW = 31.4;
  const draws: Draw[] = [];
  const rect = (x: number, y: number, w: number, h: number, color: Color) =>
    draws.push({ kind: 'rect', x, y, w, h, color });
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width = 0.5,
    dotted = false,
  ) => draws.push({ kind: 'line', x1, y1, x2, y2, width, dotted });
  const text = (
    value: string,
    x: number,
    y: number,
    options: TextOptions = {},
  ) =>
    draws.push({
      kind: 'text',
      text: value,
      x,
      y,
      rotated: false,
      face: 0,
      size: 7.7,
      color: INK,
      align: 'left',
      scale: 100,
      ...options,
    });
  // Bold labels turned to read upward, centered in the left column of a band.
  const sideLabel = (lines: string[], top: number, bottom: number) =>
    lines.forEach((label, index) =>
      draws.push({
        kind: 'text',
        text: label,
        x: (L + SEM) / 2 + 2.8 + (index - (lines.length - 1) / 2) * 9.8,
        y: (top + bottom) / 2 + textWidth(label, true, 7.7) / 2,
        rotated: true,
        face: 1,
        size: 7.7,
        color: INK,
        align: 'left',
        scale: 100,
      }),
    );
  // One course across its name, HR, and tag cells. ALT text is navy in the
  // options table and black in the four-year grid, as on the sheet.
  const course = (
    row: PlanRow | undefined,
    [x0, xHours, xTag, x1]: readonly number[],
    y: number,
    height: number,
    navyAlt = false,
  ) => {
    if (!row) return;
    const color =
      TEXT_COLOR[row.k] ?? (row.k === 'ALT' && navyAlt ? NAVY : INK);
    const baseline = y + (height + 5.5) / 2 + 0.3;
    if (FILL[row.k]) rect(x0, y, x1 - x0, height, FILL[row.k]);
    text(row.n, x0 + 2, baseline, { color, maxWidth: xHours - x0 - 4 });
    text(formatHours(row.h), (xHours + xTag) / 2, baseline, {
      color,
      align: 'center',
    });
    if (row.k)
      text(row.k, (xTag + x1) / 2, baseline, { color, align: 'center' });
  };
  const LEFT = [SEM, HR, TAG, GUTTER] as const;
  const RIGHT = [R0, RHR, RTAG, R] as const;
  const totals = planTotals(plan);

  // Title block, name, date, and assessment
  const middle = (L + R) / 2;
  text(plan.title, middle, 8, { face: 1, align: 'center', maxWidth: R - L });
  text(`${formatHours(plan.hours)} Hours for Degree`, middle, 18.3, {
    face: 3,
    align: 'center',
  });
  text(plan.note, middle, 28.6, { align: 'center', maxWidth: R - L });
  let y = NAME_ROW;
  line(L, y, GUTTER, y, 1.2);
  line(R0, y, R, y, 1.2);
  const assessed = textWidth('Assessment By: ', true, 7.7);
  text('Name:', SEM - 1.5, y + 7.6, { face: 1, align: 'right' });
  text(plan.name, SEM + 2, y + 7.6, { maxWidth: GUTTER - SEM - 4 });
  text('Assessment By:', R0 + 1.5, y + 7.6, { face: 1 });
  text(plan.by, R0 + 1.5 + assessed, y + 7.6, {
    maxWidth: R - R0 - assessed - 3,
  });
  line(L, y + 9.8, GUTTER, y + 9.8, 0.5, true);
  line(R0, y + 9.8, R, y + 9.8, 0.5, true);
  text('Date:', SEM - 1.5, y + 17.4, { face: 1, align: 'right' });
  // Blank prints the export day as M/D/YY, like the sheet's "7/2/26".
  const day = `${today.getMonth() + 1}/${today.getDate()}/${String(today.getFullYear()).slice(2)}`;
  text(plan.date || day, SEM + 2, y + 17.4, {
    maxWidth: GUTTER - SEM - 4,
  });
  y += 19.6;

  // Next semester (R) and alternate (ALT) options
  rect(L, y, GUTTER - L, 11, NAVY);
  rect(R0, y, R - R0, 11, GOLD);
  text('NEXT SEMESTER OPTIONS:', (L + GUTTER) / 2, y + 8.2, {
    face: 1,
    align: 'center',
    color: WHITE,
  });
  text('ALTERNATE OPTIONS', (R0 + R) / 2, y + 8.2, {
    face: 1,
    align: 'center',
  });
  y += 11;
  const optionsTop = y;
  rect(L, y, GUTTER - L, ROW, PEACH);
  rect(R0, y, R - R0, ROW, PEACH);
  for (const [label, a, b] of [
    ['Sem', L, SEM],
    ['Sub and Number', SEM, HR],
    ['HR', HR, TAG],
    ['Sub and Number', R0, RHR],
    ['HR', RHR, RTAG],
  ] as const)
    text(label, (a + b) / 2, y + 8, { align: 'center' });
  y += ROW;
  line(L, y, GUTTER, y);
  line(R0, y, R, y);
  const [recommended, alternates] = (['R', 'ALT'] as const).map((tag) =>
    plan.terms.flatMap((term) =>
      term.rows
        .filter((row) => row.k === tag)
        .map((row) => ({ term: term.id, row })),
    ),
  );
  const optionRows = Math.max(recommended.length, alternates.length, 5) + 1;
  for (let index = 0; index < optionRows; index++, y += 11.9) {
    const pick = recommended.at(index);
    if (pick) {
      text(pick.term, (L + SEM) / 2, y + 8.7, { align: 'center' });
      course(pick.row, LEFT, y, 11.9);
    }
    course(alternates.at(index)?.row, RIGHT, y, 11.9, true);
    line(L, y + 11.9, GUTTER, y + 11.9);
    line(R0, y + 11.9, R, y + 11.9);
  }
  for (const x of [SEM, HR, TAG, RHR, RTAG]) line(x, optionsTop, x, y);
  rect(L, y, R - L, ROW, INK);
  y += ROW;

  // Four-year grid: fall on the left, spring on the right, and a summer band
  // under them in years that have a summer term.
  const YEARS = [
    'FIRST',
    'SECOND',
    'THIRD',
    'FOURTH',
    'FIFTH',
    'SIXTH',
    'SEVENTH',
    'EIGHTH',
  ];
  // One band of terms side by side: a header row, course rows, and a total.
  const termBand = (
    halves: Array<{ term: PlanTerm | undefined; columns: readonly number[] }>,
  ) => {
    const rows = Math.max(
      5,
      ...halves.map(({ term }) => term?.rows.length ?? 0),
    );
    const top = y;
    for (const { term, columns } of halves) {
      const [x0, xHours, xTag, x1] = columns;
      // A left-hand header runs across the Sem column too.
      const x = columns === LEFT ? L : x0;
      rect(x, y, x1 - x, ROW, PEACH);
      if (term) {
        text(term.label, (x0 + xHours) / 2, y + 8, {
          face: 1,
          align: 'center',
        });
        text('HR', (xHours + xTag) / 2, y + 8, { face: 1, align: 'center' });
      }
      line(x0, y + ROW, x1, y + ROW);
    }
    y += ROW;
    rect(L, y, SEM - L, (rows + 1) * ROW, PEACH);
    for (let index = 0; index < rows; index++, y += ROW)
      for (const { term, columns } of halves) {
        course(term?.rows.at(index), columns, y, ROW);
        line(columns[0], y + ROW, columns[3], y + ROW, 0.5, true);
      }
    for (const { term, columns } of halves) {
      if (!term) continue;
      text('TOTAL SEMESTER HOURS', columns[0] + 2, y + 8, { face: 1 });
      text(
        formatHours(sumHours(term.rows)),
        (columns[1] + columns[2]) / 2,
        y + 8,
        {
          face: 1,
          align: 'center',
        },
      );
    }
    y += ROW;
    for (const { columns } of halves) {
      if (columns === LEFT) line(SEM, top, SEM, y);
      line(columns[1], top, columns[1], y);
      line(columns[2], top + ROW, columns[2], y, 0.5, true);
    }
  };
  for (const [index, [fall, spring, summer]] of academicYears(
    plan.terms,
  ).years.entries()) {
    const top = y;
    termBand([
      { term: fall, columns: LEFT },
      { term: spring, columns: RIGHT },
    ]);
    if (summer) {
      line(L, y, R, y);
      termBand([{ term: summer, columns: LEFT }]);
    }
    sideLabel([`${YEARS.at(index) ?? `YEAR ${index + 1}`} YEAR`], top, y);
    line(L, y, R, y, 1.2);
  }
  rect(GUTTER, NAME_ROW, R0 - GUTTER, y - NAME_ROW, INK);
  rect(L, y, R - L, 2.1, INK);
  y += 2.1;

  // Credit bands and degree notes
  const band = (
    labels: string[],
    lines: Run[][],
    minHeight: number,
    size = 7.7,
    scale = 100,
  ) => {
    const height = Math.max(minHeight, lines.length * ROW + 5);
    rect(L, y, SEM - L, height, PEACH);
    sideLabel(labels, y, y + height);
    lines.forEach((runs, index) => {
      let x = SEM + 2;
      for (const run of runs) {
        text(run.text, x, y + 8.4 + index * ROW, {
          face: run.face,
          size,
          scale,
        });
        x += (textWidth(run.text, (run.face & 1) === 1, size) * scale) / 100;
      }
    });
    y += height;
    rect(L, y, R - L, 2.1, INK);
    y += 2.1;
  };
  const width = R - SEM - 6;
  if (plan.xfer.length)
    band(
      ['TRANSFER', 'CREDIT'],
      wrapRuns(creditRuns(plan.xfer), width, 7.7, 100),
      46,
    );
  if (plan.extra.length)
    band(
      ['ELECTIVE', 'CREDIT'],
      wrapRuns(creditRuns(plan.extra), width, 7.7, 100),
      46,
    );
  band(
    ['DEGREE NOTES'],
    plan.notes.flatMap((note) =>
      note.trim()
        ? wrapRuns(
            // "**Note 1:** text https://…" → bold label, plain text, italic URL
            note
              .split(/(\*\*[^*]+\*\*|https?:\/\/\S+)/)
              .filter(Boolean)
              .map(
                (part): Run =>
                  /^\*\*[^*]+\*\*$/.test(part)
                    ? { text: part.slice(2, -2), face: 1 }
                    : { text: part, face: /^https?:/.test(part) ? 2 : 0 },
              ),
            width,
            8.4,
            82,
          )
        : [[]],
    ),
    66,
    8.4,
    82,
  );

  // Hour totals and the tag legend on the black footer
  const footer = [
    [
      'Completed Hours:',
      totals.done,
      'T = Credits that transferred',
      KEY_GREEN,
    ],
    [
      'In Progress Hours:',
      totals.inProgress,
      'C = Completed at Georgia Tech',
      KEY_GREEN,
    ],
    ['Remaining Hours:', totals.remaining, 'IP = In progress', GRAY],
    [
      'Total Hours for Degree:',
      totals.total,
      'R = Recommended courses',
      YELLOW,
    ],
    [
      'Surplus Non Usable Hours:',
      totals.surplus,
      'ALT = Alternative courses',
      BLUE,
    ],
  ] as const;
  line(L, NAME_ROW, L, y, 0.8);
  line(R, NAME_ROW, R, y, 0.8);
  rect(L, y, R - L, ROW * (footer.length + 1) + 6, INK);
  y += ROW;
  footer.forEach(([label, hours, key, color], index) => {
    rect(SEM, y, GUTTER - SEM, ROW, WHITE);
    rect(R0, y, RHR - R0, ROW, color);
    text(label, HR - 2, y + 8, { align: 'right' });
    text(formatHours(hours), (HR + GUTTER) / 2, y + 8, { align: 'center' });
    text(key, R0 + 1.5, y + 8);
    line(HR, y, HR, y + ROW, 0.5, true);
    if (index) line(SEM, y, GUTTER, y, 0.5, true);
    y += ROW;
  });
  return pdfFile(draws, y + 6, { title: plan.title, author: plan.name, now });
}

/**
 * Scales the sheet to fit one Letter page (like a fit-to-page print) and
 * writes a minimal PDF 1.4 file.
 */
function pdfFile(
  draws: Draw[],
  height: number,
  info: { title: string; author: string; now: Date },
) {
  const TOP = 34;
  const BOTTOM = 30;
  const scale = Math.min(1, (792 - TOP - BOTTOM) / height);
  const offset = 306 - scale * 306;
  const num = (value: number) => String(Math.round(value * 100) / 100);
  const px = (x: number) => num(offset + scale * x);
  const py = (y: number) => num(792 - TOP - scale * y);
  const rgb = (color: Color) => color.map(num).join(' ');
  const ops = ['0 0 0 RG'];
  for (const draw of draws) {
    if (draw.kind === 'rect')
      ops.push(
        `${rgb(draw.color)} rg ${px(draw.x)} ${py(draw.y + draw.h)} ${num(scale * draw.w)} ${num(scale * draw.h)} re f`,
      );
    else if (draw.kind === 'line')
      ops.push(
        `${draw.dotted ? '[.6 1.2]' : '[]'} 0 d ${num(scale * draw.width)} w ${px(draw.x1)} ${py(draw.y1)} m ${px(draw.x2)} ${py(draw.y2)} l S`,
      );
    else {
      const bold = (draw.face & 1) === 1;
      const ratio = draw.scale / 100;
      let value = draw.text;
      let size = draw.size;
      if (draw.maxWidth !== undefined) {
        while (
          textWidth(value, bold, size) * ratio > draw.maxWidth &&
          size > draw.size * 0.86
        )
          size -= 0.1;
        if (textWidth(value, bold, size) * ratio > draw.maxWidth) {
          while (
            value &&
            textWidth(`${value}…`, bold, size) * ratio > draw.maxWidth
          )
            value = value.slice(0, -1);
          value = `${value.trimEnd()}…`;
        }
      }
      const width = textWidth(value, bold, size) * ratio;
      const x =
        draw.align === 'center'
          ? draw.x - width / 2
          : draw.align === 'right'
            ? draw.x - width
            : draw.x;
      ops.push(
        `BT /F${draw.face + 1} ${num(size * scale)} Tf ${draw.scale} Tz ${rgb(draw.color)} rg ${draw.rotated ? `0 1 -1 0 ${px(draw.x)}` : `1 0 0 1 ${px(x)}`} ${py(draw.y)} Tm ${pdfString(value)} Tj ET`,
      );
    }
  }
  const content = ops.join('\n');
  const fonts = [
    'Helvetica',
    'Helvetica-Bold',
    'Helvetica-Oblique',
    'Helvetica-BoldOblique',
  ];
  const { now } = info;
  const stamp = [
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  ]
    .map((part) => String(part).padStart(2, '0'))
    .join('');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << ${fonts.map((_, index) => `/F${index + 1} ${index + 5} 0 R`).join(' ')} >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ...fonts.map(
      (font) =>
        `<< /Type /Font /Subtype /Type1 /BaseFont /${font} /Encoding /WinAnsiEncoding >>`,
    ),
    `<< /Title ${pdfString(info.title)} /Author ${pdfString(info.author)} /Creator (_aper) /CreationDate (D:${stamp}) >>`,
  ];
  // Everything above is ASCII (pdfString escapes the rest), so string offsets
  // are byte offsets.
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const at = out.length;
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets
    .map((at) => `${String(at).padStart(10, '0')} 00000 n \n`)
    .join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
