import { describe, expect, it } from 'vitest';
import {
  checkParsons,
  indentFor,
  normLine,
  parsonsPool,
} from '@/lib/study/parsons';
import type { StudyParsons } from '@/lib/study/types';
import { renderUserText } from '@/lib/study/user-text';

const problem: StudyParsons = {
  title: 'Count positives',
  q: '<p>Count the positive values.</p>',
  lines: [
    'int count = 0;',
    'for (int x : values) {',
    '    if (x > 0) {',
    '        count++;',
    '    }',
    '}',
  ],
  distractors: ['if (x >= 0) {', 'count = 0;'],
};
const solution = problem.lines.map((line) => line.trim());

describe('parsons', () => {
  it('normalizes whitespace in lines', () => {
    expect(normLine('   if  (x > 0)\t{ ')).toBe('if (x > 0) {');
  });

  it('accepts the solution, including swapped identical lines', () => {
    expect(checkParsons(problem, solution)).toEqual({
      ok: true,
      firstWrong: null,
      missing: 0,
      extra: 0,
    });
    const swapped = [...solution];
    [swapped[4], swapped[5]] = [swapped[5], swapped[4]];
    expect(checkParsons(problem, swapped).ok).toBe(true);
  });

  it('reports missing duplicate lines, distractors, and the first wrong position', () => {
    expect(checkParsons(problem, solution.slice(0, 5))).toEqual({
      ok: false,
      firstWrong: null,
      missing: 1,
      extra: 0,
    });
    const withDistractor = [...solution];
    withDistractor.splice(2, 1, 'if (x >= 0) {');
    expect(checkParsons(problem, withDistractor)).toEqual({
      ok: false,
      firstWrong: 2,
      missing: 1,
      extra: 1,
    });
    expect(checkParsons(problem, [...solution, '}'])).toEqual({
      ok: false,
      firstWrong: 6,
      missing: 0,
      extra: 1,
    });
    const reordered = [solution[1], solution[0], ...solution.slice(2)];
    expect(checkParsons(problem, reordered)).toMatchObject({
      ok: false,
      firstWrong: 0,
    });
  });

  it('pools trimmed solution lines and distractors in a seeded, unsolved order', () => {
    const pool = parsonsPool(problem, 'cs1000:1-0');
    expect(parsonsPool(problem, 'cs1000:1-0')).toEqual(pool);
    expect(pool.map((block) => block.text).sort()).toEqual(
      [...solution, ...problem.distractors!].sort(),
    );
    expect(new Set(pool.map((block) => block.id)).size).toBe(pool.length);
    const placed = pool
      .map((block) => block.text)
      .filter((text) => solution.includes(text));
    expect(placed).not.toEqual(solution);
  });

  it('indents by brace depth', () => {
    expect(indentFor(solution)).toEqual([0, 0, 1, 2, 1, 0]);
    expect(indentFor(['if (a) {', 'x();', '} else {', 'y();', '}'])).toEqual([
      0, 1, 0, 1, 0,
    ]);
    expect(
      indentFor(['String s = "{";', "char c = '}';", 'f(); // {']),
    ).toEqual([0, 0, 0]);
  });
});

describe('renderUserText', () => {
  it('escapes all HTML', () => {
    expect(renderUserText('<script>alert("x")</script> & \'y\'')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
    );
  });

  it('renders fences, inline code, and line breaks', () => {
    expect(renderUserText('Line one\nuse `a<b` here')).toBe(
      'Line one<br>use <code>a&lt;b</code> here',
    );
    expect(
      renderUserText('Before\n```java\nif (a < b) {\n  go();\n}\n```\nAfter'),
    ).toBe(
      'Before<pre><code class="language-java">if (a &lt; b) {\n  go();\n}</code></pre>After',
    );
    expect(renderUserText('```\n<b>x</b>\n```')).toBe(
      '<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>',
    );
  });
});
