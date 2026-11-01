import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planPdf } from '@/lib/planner/pdf';
import { plannerFileSchema } from '@/lib/planner/types';

const file = plannerFileSchema.parse(
  JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/planner-file.json'),
      'utf8',
    ),
  ),
);
const today = new Date(2026, 9, 5);

describe('one-page plan PDF', () => {
  it('writes one page whose cross-reference table points at every object', () => {
    const pdf = planPdf(file.plan, today);
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    // Offsets are counted in characters, which only works for pure ASCII.
    expect(pdf).toMatch(/^[\n -~]*$/);
    const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 5)).toBe('xref\n');
    const offsets = [
      ...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm),
    ].map((match) => Number(match[1]));
    expect(offsets).toHaveLength(9);
    offsets.forEach((offset, index) =>
      expect(pdf.slice(offset, offset + 8)).toBe(`${index + 1} 0 obj\n`),
    );
    const stream = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(
      pdf,
    );
    expect(Number(stream?.[1])).toBe(stream?.[2].length);
    expect(pdf).toContain('/Type /Pages /Kids [3 0 R] /Count 1');
  });

  it('escapes course names so they cannot break the page', () => {
    const plan = structuredClone(file.plan);
    plan.terms[3].rows.push({
      n: 'Lab (A) \\ B – “quoted” 🙂\tend',
      h: 4,
      k: '',
    });
    expect(planPdf(plan, today)).toContain(
      '(Lab \\(A\\) \\\\ B \\226 \\223quoted\\224 ? end) Tj',
    );
  });

  it('cuts a name too long for its cell with an ellipsis', () => {
    const plan = structuredClone(file.plan);
    const long =
      `CS 4803 ${'Special Topics in Very Long Titles '.repeat(6)}`.trim();
    plan.terms[3].rows.push({ n: long, h: 3, k: '' });
    const pdf = planPdf(plan, today);
    expect(pdf).not.toContain(long);
    expect(pdf).toMatch(/\(CS 4803 Special Topics[^)]*\\205\) Tj/);
  });

  it('scales a long plan down so everything stays on the page', () => {
    const plan = structuredClone(file.plan);
    for (const term of plan.terms)
      for (let index = 0; index < 30; index++)
        term.rows.push({ n: `CS ${4100 + index} Elective`, h: 3, k: 'IP' });
    const rects = [
      ...planPdf(plan, today).matchAll(
        /^[\d. ]+ rg ([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+) re f$/gm,
      ),
    ].map((match) => match.slice(1).map(Number));
    expect(rects.length).toBeGreaterThan(100);
    for (const [x, y, w, h] of rects) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(612);
      expect(y + h).toBeLessThanOrEqual(792);
    }
  });

  it('prints the export day when the plan has no date, and lists R courses by term', () => {
    const pdf = planPdf(file.plan, today);
    expect(pdf).toContain('(10/5/26) Tj');
    expect(pdf).toContain('(S27) Tj');
    expect(planPdf({ ...file.plan, date: '7/2/26' }, today)).toContain(
      '(7/2/26) Tj',
    );
  });

  it('prints a summer term in its year when the plan has one', () => {
    const plan = structuredClone(file.plan);
    plan.terms.splice(2, 0, {
      id: 'U27',
      label: 'Summer 2027',
      rows: [{ n: 'HIST 2112 U.S. since 1877', h: 3, k: '' }],
    });
    const pdf = planPdf(plan, today);
    expect(pdf).toContain('(Summer 2027) Tj');
    expect(pdf).toContain('(HIST 2112 U.S. since 1877) Tj');
    expect(pdf).toContain('(SECOND YEAR) Tj');
    expect(pdf).not.toContain('(THIRD YEAR) Tj');
  });
});
