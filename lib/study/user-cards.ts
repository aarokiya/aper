/**
 * Import and export of the student's own cards as spreadsheet text: TSV or
 * CSV (RFC 4180 quoting) with front, back, and optional tags columns. Pure,
 * so client views and tests share it.
 */
import type { UserCard } from './types';

export type ParsedCard = { f: string; b: string; tags?: string[] };

type Cell = { value: string; quoted: boolean };

const HEADER_WORDS: Record<string, true> = {
  front: true,
  back: true,
  question: true,
  answer: true,
  term: true,
  definition: true,
};

/** Rows of cells; `"` opens a quoted field (`""` is a quote), which may hold delimiters and newlines. */
function parseRows(text: string, delimiter: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let value = '';
  let quoted = false;
  let inQuotes = false;
  const endField = () => {
    row.push({ value, quoted });
    value = '';
    quoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char !== '"') value += char;
      else if (text[i + 1] === '"') {
        value += '"';
        i++;
      } else inQuotes = false;
    } else if (char === delimiter) endField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else if (char === '"' && !quoted && value.trim() === '') {
      // Whitespace before the opening quote is not part of the field.
      value = '';
      quoted = true;
      inQuotes = true;
    } else if (!quoted || char.trim() !== '') value += char;
  }
  if (value !== '' || quoted || row.length > 0) endRow();
  return rows;
}

/** Unquoted cells are trimmed; quoted cells are kept exactly. */
const cellText = (cell: Cell | undefined) =>
  !cell ? '' : cell.quoted ? cell.value : cell.value.trim();

/**
 * Cards from pasted or uploaded spreadsheet text. TSV when the first
 * non-empty line has a tab, else CSV. An optional header row
 * (front/back, question/answer, term/definition) is dropped; the third
 * column holds tags separated by spaces or commas. Rows without a front or
 * a back are counted as skipped; blank lines are ignored.
 */
export function parseCardTable(text: string): {
  cards: ParsedCard[];
  skipped: number;
} {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n|\r/).find((line) => line.trim()) ?? '';
  // A tab inside a quoted CSV field does not make the text TSV.
  const tsv = firstLine.replace(/"[^"]*("|$)/g, '').includes('\t');
  const rows = parseRows(source, tsv ? '\t' : ',').filter(
    (row) => row.some((cell) => cell.quoted || cell.value.trim() !== ''),
  );
  if (
    rows.length > 0 &&
    rows[0].length >= 2 &&
    HEADER_WORDS[cellText(rows[0][0]).toLowerCase()] &&
    HEADER_WORDS[cellText(rows[0][1]).toLowerCase()]
  )
    rows.shift();
  const cards: ParsedCard[] = [];
  let skipped = 0;
  for (const row of rows) {
    const f = cellText(row[0]);
    const b = cellText(row[1]);
    if (!f.trim() || !b.trim()) {
      skipped += 1;
      continue;
    }
    const tags = [
      ...new Set(
        cellText(row[2])
          .split(/[\s,]+/)
          .filter(Boolean),
      ),
    ];
    cards.push(tags.length > 0 ? { f, b, tags } : { f, b });
  }
  return { cards, skipped };
}

/** The student's cards as TSV (oldest first) with a `front back tags` header; `parseCardTable` reads it back. */
export function cardsToTsv(uc: Record<string, UserCard>): string {
  const lines = ['front\tback\ttags'];
  const cards = Object.entries(uc).sort(
    ([idA, a], [idB, b]) => a.t - b.t || idA.localeCompare(idB),
  );
  for (const [, card] of cards)
    lines.push(
      [card.f, card.b, (card.tags ?? []).join(' ')]
        // Quoted when the field would not read back exactly unquoted.
        .map((value) =>
          /[\t\n\r"]|^\s|\s$/.test(value)
            ? `"${value.replace(/"/g, '""')}"`
            : value,
        )
        .join('\t'),
    );
  return `${lines.join('\n')}\n`;
}
