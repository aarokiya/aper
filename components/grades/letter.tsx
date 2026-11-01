import type { Letter } from '@/lib/grades/calculator';
import { cn } from '@/lib/utils';

/** A filled tile per letter: A green, B blue, C amber, D orange, F red. */
const TILE: Record<Letter, string> = {
  A: 'bg-grade-a text-paper',
  B: 'bg-grade-b text-paper',
  C: 'bg-grade-c text-paper',
  D: 'bg-grade-d text-paper',
  F: 'bg-grade-f text-paper',
};

const PILL: Record<Letter, string> = {
  A: 'bg-grade-a-soft text-grade-a ring-grade-a/35',
  B: 'bg-grade-b-soft text-grade-b ring-grade-b/35',
  C: 'bg-grade-c-soft text-grade-c ring-grade-c/35',
  D: 'bg-grade-d-soft text-grade-d ring-grade-d/35',
  F: 'bg-grade-f-soft text-grade-f ring-grade-f/35',
};

/** The whole course row takes its current letter's tint and accent edge. */
export const ROW_TINT: Record<Letter, string> = {
  A: 'bg-grade-a-soft border-l-grade-a',
  B: 'bg-grade-b-soft border-l-grade-b',
  C: 'bg-grade-c-soft border-l-grade-c',
  D: 'bg-grade-d-soft border-l-grade-d',
  F: 'bg-grade-f-soft border-l-grade-f',
};

/** The course's letter, large enough to read across the room. */
export function LetterTile({
  letter,
  label,
}: {
  letter: Letter | null;
  label: string;
}) {
  return (
    <span
      className={cn(
        'grid size-14 shrink-0 place-items-center rounded-2xl font-serif text-[34px] leading-none font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.08)] sm:size-16 sm:text-[40px]',
        letter
          ? TILE[letter]
          : 'border border-dashed border-rule-2 bg-paper text-ink-4',
      )}
    >
      <span aria-hidden="true">{letter ?? '—'}</span>
      <span className="sr">
        {letter ? `${label} ${letter}` : `${label}: no letter yet`}
      </span>
    </span>
  );
}

/** A small colored letter beside a percentage. */
export function LetterPill({ letter }: { letter: Letter | null }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 font-sans text-[13px] font-semibold ring-1 ring-inset',
        letter ? PILL[letter] : 'text-ink-4 ring-rule',
      )}
    >
      {letter ?? '—'}
    </span>
  );
}
