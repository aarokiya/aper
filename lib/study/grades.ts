/**
 * The Study Hub's Grades view: a course's `grading` (its syllabus weights)
 * applied to the scores typed into it (`gb` in progress). Ported from the
 * hub's app.js (`scorePct`, `gradeModel`) so the hub and _aper show the same
 * grade from the same saved scores. Pure and isomorphic.
 */
import type {
  StudyGrading,
  StudyGradingGroup,
  StudyGradingItem,
} from './types';

/** `"17/20"`, `"85"`, and `"85%"` → a percent; blank → null; anything else → NaN. */
export function scorePct(value: unknown): number | null {
  const text = String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/%$/, '');
  if (!text) return null;
  const num = (part: string) =>
    /^(\d+\.?\d*|\.\d+)$/.test(part) ? Number(part) : Number.NaN;
  const parts = text.split('/');
  if (parts.length === 1) return num(text);
  return parts.length === 2 && num(parts[1]) > 0
    ? (100 * num(parts[0])) / num(parts[1])
    : Number.NaN;
}

export const isScored = (pct: number | null): pct is number =>
  pct !== null && !Number.isNaN(pct);

/** Two decimals, truncated rather than rounded: the syllabus doesn't round, so 89.999 is a B. */
export const fmtPct = (x: number) =>
  `${(Math.floor(x * 100 + 1e-6) / 100).toFixed(2)}%`;

export type GradeRow = {
  item: StudyGradingItem;
  /** the typed score as a percent: null when blank, NaN when unreadable */
  pct: number | null;
  /** what the score counts as (raised by an `avgLowest` item); NaN when unscored */
  eff: number;
  dropped: boolean;
  raised: boolean;
  /** an `avgLowest` item with a score: the row it was compared with, and the outcome */
  effect?: { target: GradeRow; before: number; after: number; used: boolean };
};

export type GradeGroup = {
  group: StudyGradingGroup;
  rows: GradeRow[];
  /** rows that count on their own (not `avgLowest` items) */
  counted: GradeRow[];
  /** counted rows with a readable score */
  scored: GradeRow[];
  /** mean of the scored rows after drops; null while none is scored */
  avg: number | null;
};

export type GradeModel = {
  groups: GradeGroup[];
  /** weighted mean of the groups that have a score; null while none has */
  total: number | null;
  letter: string;
};

/**
 * Items count equally inside their group. An `avgLowest` item isn't counted on
 * its own: its score is averaged with the lowest listed score, only when that
 * raises it. Then the lowest `drop` scores fall out. Groups with no scores yet
 * are left out of the total, and the other weights scale up.
 */
export function gradeModel(
  grading: StudyGrading,
  scores: Readonly<Record<string, string>>,
): GradeModel {
  const groups = grading.groups.map((group): GradeGroup => {
    const rows = group.items.map((item): GradeRow => {
      const pct = scorePct(scores[item.id]);
      return {
        item,
        pct,
        eff: isScored(pct) ? pct : Number.NaN,
        dropped: false,
        raised: false,
      };
    });
    const counted = rows.filter((row) => !row.item.avgLowest);
    for (const row of rows) {
      const ids = row.item.avgLowest;
      if (!ids || !isScored(row.pct)) continue;
      const pool = counted.filter(
        (other) => ids.includes(other.item.id) && isScored(other.pct),
      );
      if (!pool.length) continue;
      const target = pool.reduce((low, other) =>
        other.eff < low.eff ? other : low,
      );
      const before = target.eff;
      const used = row.pct > before;
      if (used) {
        target.eff = (before + row.pct) / 2;
        target.raised = true;
      }
      row.effect = { target, before, after: target.eff, used };
    }
    const scored = counted.filter((row) => isScored(row.pct));
    if (group.drop > 0 && scored.length > group.drop)
      for (const row of [...scored]
        .sort((a, b) => a.eff - b.eff)
        .slice(0, group.drop))
        row.dropped = true;
    const kept = scored.filter((row) => !row.dropped);
    return {
      group,
      rows,
      counted,
      scored,
      avg: kept.length
        ? kept.reduce((sum, row) => sum + row.eff, 0) / kept.length
        : null,
    };
  });
  const live = groups.filter((entry) => entry.avg !== null);
  const weight = live.reduce((sum, entry) => sum + entry.group.weight, 0);
  const total = weight
    ? live.reduce(
        (sum, entry) => sum + entry.group.weight * (entry.avg ?? 0),
        0,
      ) / weight
    : null;
  const letter =
    total === null
      ? ''
      : (Object.entries(grading.letters).find(([, min]) => total >= min)?.[0] ??
        '');
  return { groups, total, letter };
}
