/**
 * "Key ideas" notes: a server-side cut of long lecture parts down to their
 * definitions, takeaways, and first code example, so reading-heavy weeks
 * (e.g. a long programming course) become a few minutes of reading while the full text stays one
 * click away. Short parts are kept as written.
 */
import { parse, type HTMLElement } from 'node-html-parser';
import { stripHtml } from './model';
import type { StudyLecturePart, StudyWeek } from './types';

export type CondensedPart =
  /** shown as written */
  | { mode: 'full'; fullWords: number }
  /** a one-line disclosure labelled `label` that opens the full part */
  | { mode: 'collapsed'; label: string; fullWords: number }
  /** `html` (def/key boxes and the first code block) with `traps` (warn boxes) behind a disclosure */
  | {
      mode: 'key';
      html: string;
      traps: string[];
      fullWords: number;
      keyWords: number;
    };

/** Parts at or under this many characters of text are kept whole. */
export const SHORT_PART_CHARS = 1200;

/** Orientation parts that only point elsewhere. */
const ORIENTATION = /^\s*(start here|what to read|in lecture this week)/i;
/** Long, self-contained parts opened on demand. */
const ON_DEMAND = /^\s*(worked example|exam traps)/i;
const CHEAT_SHEET = /^\s*cheat sheet/i;

/** Words of plain text in an HTML fragment. */
export function wordCount(html: string) {
  const text = stripHtml(html);
  return text ? text.split(' ').length : 0;
}

const isBox = (el: HTMLElement, kind: string) =>
  el.tagName === 'DIV' &&
  el.classList.contains('box') &&
  el.classList.contains(kind);

/** Condense one lecture part (see the module comment for the rules). */
export function condensePart(part: StudyLecturePart): CondensedPart {
  const fullWords = wordCount(part.b);
  if (ORIENTATION.test(part.h) || ON_DEMAND.test(part.h))
    return { mode: 'collapsed', label: part.h, fullWords };
  if (
    CHEAT_SHEET.test(part.h) ||
    stripHtml(part.b).length <= SHORT_PART_CHARS
  )
    return { mode: 'full', fullWords };

  const blocks = parse(part.b).childNodes.filter(
    (node): node is HTMLElement => node.nodeType === 1,
  );
  const firstPre = blocks.find((el) => el.tagName === 'PRE');
  let kept = blocks.filter(
    (el) => isBox(el, 'def') || isBox(el, 'key') || el === firstPre,
  );
  if (!blocks.some((el) => isBox(el, 'def') || isBox(el, 'key'))) {
    const firstP = blocks.find((el) => el.tagName === 'P');
    kept = blocks.filter((el) => el === firstP || el === firstPre);
  }
  // Nothing to stand for the part (e.g. one long list): keep it whole.
  if (!kept.length) return { mode: 'full', fullWords };
  const html = kept.map((el) => el.outerHTML).join('');
  return {
    mode: 'key',
    html,
    traps: blocks.filter((el) => isBox(el, 'warn')).map((el) => el.outerHTML),
    fullWords,
    keyWords: wordCount(html),
  };
}

/**
 * Every part of a week, per lecture. A week whose parts are all short is
 * left whole (orientation and worked-example parts included), so courses
 * with brief notes read exactly as before.
 */
export function condenseWeek(
  week: Pick<StudyWeek, 'lectures'>,
): CondensedPart[][] {
  const long = week.lectures.some((lecture) =>
    lecture.parts.some(
      (part) => stripHtml(part.b).length > SHORT_PART_CHARS,
    ),
  );
  return week.lectures.map((lecture) =>
    lecture.parts.map((part) =>
      long ? condensePart(part) : { mode: 'full', fullWords: wordCount(part.b) },
    ),
  );
}
