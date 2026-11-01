import { seededShuffle } from './srs';
import type { StudyParsons } from './types';

/** A line as compared: trimmed, inner whitespace collapsed. */
export const normLine = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Whether the pool lists the solution lines already in solution order. */
function solvedOrder(pool: string[], lines: string[]) {
  const expected = lines.map(normLine);
  const solution = new Set(expected);
  const placed = pool.map(normLine).filter((line) => solution.has(line));
  return placed.join('\n') === expected.join('\n');
}

/**
 * The blocks to arrange: solution lines and distractors, trimmed (the board
 * shows indentation from `indentFor`), shuffled by `seed`. Ids are unique per
 * block and say nothing about which blocks belong to the solution.
 */
export function parsonsPool(
  p: StudyParsons,
  seed: string,
): Array<{ id: string; text: string }> {
  const lines = [...p.lines, ...(p.distractors ?? [])]
    .map((line) => line.trim())
    .filter(Boolean);
  let pool = seededShuffle(lines, seed);
  // Reshuffle a few times rather than hand out the answer already in order.
  for (let attempt = 1; attempt < 8 && lines.length > 2; attempt += 1) {
    if (!solvedOrder(pool, p.lines)) break;
    pool = seededShuffle(lines, `${seed}#${attempt}`);
  }
  return pool.map((text, index) => ({ id: `b${index}`, text }));
}

/**
 * Check an arrangement: right when its lines equal the solution's in order.
 * `firstWrong` is the first answer position that differs from the solution
 * (null when every placed line is right so far); `missing` counts solution
 * lines not used and `extra` placed lines the solution has no room for
 * (distractors or repeats). Duplicate solution lines (two `}`) are counted.
 */
export function checkParsons(
  p: StudyParsons,
  answer: string[],
): { ok: boolean; firstWrong: number | null; missing: number; extra: number } {
  const expected = p.lines.map(normLine);
  const given = answer.map(normLine);
  let firstWrong: number | null = null;
  for (let i = 0; i < given.length; i += 1)
    if (given[i] !== expected[i]) {
      firstWrong = i;
      break;
    }
  const left = new Map<string, number>();
  for (const line of expected) left.set(line, (left.get(line) ?? 0) + 1);
  let extra = 0;
  for (const line of given) {
    const count = left.get(line) ?? 0;
    if (count > 0) left.set(line, count - 1);
    else extra += 1;
  }
  let missing = 0;
  for (const count of left.values()) missing += count;
  return {
    ok: firstWrong === null && given.length === expected.length,
    firstWrong,
    missing,
    extra,
  };
}

/**
 * Brace depth of each line, for display: a line that starts with `}` sits one
 * level out; `{`/`}` inside strings, chars, and `//` comments don't count.
 */
export function indentFor(lines: string[]): number[] {
  let depth = 0;
  return lines.map((line) => {
    const code = line
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/\/\/.*$/, '')
      .trim();
    const own = code.startsWith('}') ? Math.max(0, depth - 1) : depth;
    for (const char of code)
      if (char === '{') depth += 1;
      else if (char === '}') depth = Math.max(0, depth - 1);
    return own;
  });
}
