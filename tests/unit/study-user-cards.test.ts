import { describe, expect, it } from 'vitest';
import type { UserCard } from '@/lib/study/types';
import { cardsToTsv, parseCardTable } from '@/lib/study/user-cards';

describe('parseCardTable', () => {
  it('reads TSV when the first line has a tab', () => {
    const { cards, skipped } = parseCardTable(
      'int x = 5;\tdeclares and initializes x\nboolean\ttrue or false\n',
    );
    expect(skipped).toBe(0);
    expect(cards).toEqual([
      { f: 'int x = 5;', b: 'declares and initializes x' },
      { f: 'boolean', b: 'true or false' },
    ]);
  });

  it('reads CSV otherwise, keeping commas in TSV cells and trimming unquoted cells', () => {
    expect(parseCardTable('alpha , beta\r\ngamma,delta').cards).toEqual([
      { f: 'alpha', b: 'beta' },
      { f: 'gamma', b: 'delta' },
    ]);
    expect(parseCardTable('a, b\tc, d').cards).toEqual([
      { f: 'a, b', b: 'c, d' },
    ]);
  });

  it('handles quoted fields with commas, tabs, newlines, and escaped quotes', () => {
    const csv =
      '"x, y","has\ttab"\n"line one\nline two","say ""hi"""\n' +
      '"  padded  ",plain\n';
    expect(parseCardTable(csv).cards).toEqual([
      { f: 'x, y', b: 'has\ttab' },
      { f: 'line one\nline two', b: 'say "hi"' },
      { f: '  padded  ', b: 'plain' },
    ]);
    const tsv = '"a\tb"\t"multi\r\nline"\n';
    expect(parseCardTable(tsv).cards).toEqual([
      { f: 'a\tb', b: 'multi\r\nline' },
    ]);
  });

  it('keeps literal quotes that do not open a field', () => {
    expect(parseCardTable('He said "no"\tanswer').cards).toEqual([
      { f: 'He said "no"', b: 'answer' },
    ]);
  });

  it('drops a header row in any case', () => {
    expect(parseCardTable('Front,Back\nq,a').cards).toEqual([
      { f: 'q', b: 'a' },
    ]);
    expect(parseCardTable('TERM\tDefinition\ttags\nq\ta\tx').cards).toEqual([
      { f: 'q', b: 'a', tags: ['x'] },
    ]);
    expect(parseCardTable('question,answer\n').cards).toEqual([]);
    expect(parseCardTable('front,something else\nq,a').cards).toEqual([
      { f: 'front', b: 'something else' },
      { f: 'q', b: 'a' },
    ]);
  });

  it('skips rows missing a front or a back and ignores blank lines', () => {
    const { cards, skipped } = parseCardTable(
      'q1,a1\n\n,only back\nonly front,\nlonely\n"  ",x\n   \nq2,a2\n',
    );
    expect(cards).toEqual([
      { f: 'q1', b: 'a1' },
      { f: 'q2', b: 'a2' },
    ]);
    expect(skipped).toBe(4);
  });

  it('reads tags from the third column, split on spaces or commas', () => {
    const { cards } = parseCardTable(
      'q1\ta1\tloops  arrays\nq2\ta2\t"oop,inheritance, oop"\nq3\ta3\t\n',
    );
    expect(cards).toEqual([
      { f: 'q1', b: 'a1', tags: ['loops', 'arrays'] },
      { f: 'q2', b: 'a2', tags: ['oop', 'inheritance'] },
      { f: 'q3', b: 'a3' },
    ]);
  });

  it('ignores a byte order mark', () => {
    expect(parseCardTable('\uFEFFfront,back\nq,a').cards).toEqual([
      { f: 'q', b: 'a' },
    ]);
  });
});

describe('cardsToTsv', () => {
  const uc: Record<string, UserCard> = {
    b2: { f: 'second', b: 'two', tags: ['x', 'y'], t: 2000 },
    a1: {
      f: 'What does `i++` do\tin a loop?',
      b: '```java\nfor (int i = 0; i < n; i++) {\n    sum += i;\n}\n```',
      t: 1000,
      w: 3,
      a: ['increments'],
    },
    c3: { f: 'He said "hi"', b: '  leading and trailing  ', t: 3000 },
    d4: { f: 'front', b: 'back', t: 4000 },
  };

  it('writes a header and one row per card, oldest first', () => {
    const tsv = cardsToTsv({
      z: { f: 'later', b: 'b', t: 5 },
      y: { f: 'earlier', b: 'a', tags: ['t1'], t: 1 },
    });
    expect(tsv.split('\n')).toEqual([
      'front\tback\ttags',
      'earlier\ta\tt1',
      'later\tb\t',
      '',
    ]);
  });

  it('round-trips through parseCardTable exactly', () => {
    const { cards, skipped } = parseCardTable(cardsToTsv(uc));
    expect(skipped).toBe(0);
    expect(cards).toEqual([
      { f: uc.a1.f, b: uc.a1.b },
      { f: 'second', b: 'two', tags: ['x', 'y'] },
      { f: uc.c3.f, b: uc.c3.b },
      { f: 'front', b: 'back' },
    ]);
  });

  it('writes only the header for no cards', () => {
    expect(parseCardTable(cardsToTsv({}))).toEqual({ cards: [], skipped: 0 });
  });
});
