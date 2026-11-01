import { describe, expect, it } from 'vitest';
import { md } from '@/components/study/ai/format';
import { GroqError } from '@/lib/groq/client';
import { cleanGrade, parseGradeJson } from '@/lib/groq/grade';
import {
  TUTOR_MAX_TURNS,
  tutorMessages,
  type TutorTurn,
} from '@/lib/groq/tutor';

const course = {
  tutor: 'Georgia Tech ABC 1234 (Intro to Widgets). Extra.',
  math: false,
};

describe('grade sanitizer', () => {
  it('clamps the score to the points and rounds to half points', () => {
    expect(cleanGrade({ score: 7.3 }, 10, 1).score).toBe(7.5);
    expect(cleanGrade({ score: 7.2 }, 10, 1).score).toBe(7);
    expect(cleanGrade({ score: 14 }, 10, 1).score).toBe(10);
    expect(cleanGrade({ score: -3 }, 10, 1).score).toBe(0);
    expect(cleanGrade({ score: '6' }, 10, 1).score).toBe(6);
    expect(cleanGrade({ score: 'lots' }, 10, 1).score).toBe(0);
  });

  it('always reports the requested points as the maximum', () => {
    expect(cleanGrade({ score: 3, max: 50 }, 5, 1).max).toBe(5);
  });

  it('derives the verdict from the score when the model gives none or an unknown one', () => {
    expect(cleanGrade({ score: 10 }, 10, 1).verdict).toBe('correct');
    expect(cleanGrade({ score: 4, verdict: 'great' }, 10, 1).verdict).toBe(
      'partial',
    );
    expect(cleanGrade({ score: 0, verdict: 'toString' }, 10, 1).verdict).toBe(
      'incorrect',
    );
    expect(cleanGrade({ score: 10, verdict: 'partial' }, 10, 1).verdict).toBe(
      'partial',
    );
  });

  it('caps and normalizes lines, dropping empty ones', () => {
    const grade = cleanGrade(
      {
        lines: [
          { text: 'x'.repeat(400), mark: 'error', note: 'n'.repeat(250) },
          { text: '   ', mark: 'ok' },
          { text: 'p → q', mark: 'bogus' },
          'not a line',
          ...Array.from({ length: 90 }, (_, i) => ({
            text: `step ${i}`,
            mark: 'ok',
          })),
        ],
      },
      10,
      1,
    );
    expect(grade.lines[0].text).toHaveLength(300);
    expect(grade.lines[0].note).toHaveLength(200);
    expect(grade.lines[1]).toEqual({
      text: 'p → q',
      mark: 'neutral',
      note: '',
    });
    // 80 kept before empties are dropped: two of the first 80 were empty.
    expect(grade.lines).toHaveLength(78);
  });

  it('caps missing steps, summary, and next fix', () => {
    const grade = cleanGrade(
      {
        missing: Array.from({ length: 12 }, () => 'm'.repeat(300)),
        summary: 's'.repeat(600),
        next: 'n'.repeat(400),
      },
      10,
      1,
    );
    expect(grade.missing).toHaveLength(8);
    expect(grade.missing[0]).toHaveLength(200);
    expect(grade.summary).toHaveLength(500);
    expect(grade.next).toHaveLength(300);
  });

  it('empties the transcript when the work was unreadable', () => {
    const grade = cleanGrade(
      {
        readable: false,
        lines: [{ text: 'a', mark: 'ok' }],
        missing: ['b'],
        summary: 'Blank page.',
      },
      10,
      1,
    );
    expect(grade).toMatchObject({
      readable: false,
      lines: [],
      missing: [],
      summary: 'Blank page.',
    });
    expect(cleanGrade({ readable: 'no' }, 10, 1).readable).toBe(true);
  });

  it('rejects replies that are not objects as invalid JSON', () => {
    for (const raw of [null, 'text', 7]) {
      expect(() => cleanGrade(raw, 10, 1)).toThrow(GroqError);
      try {
        cleanGrade(raw, 10, 1);
      } catch (error) {
        expect((error as GroqError).code).toBe('invalid_json');
      }
    }
  });

  it('reads JSON wrapped in prose or a code fence, and rejects anything else', () => {
    expect(parseGradeJson('```json\n{"score": 3}\n```')).toEqual({ score: 3 });
    expect(parseGradeJson('Here you go: {"score": 2} done')).toEqual({
      score: 2,
    });
    expect(() => parseGradeJson('no json here')).toThrow(/invalid json/);
  });
});

describe('tutor markdown', () => {
  it('escapes HTML everywhere, including inside code', () => {
    expect(md('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(md('```\n<b>&</b>\n```')).toBe(
      '<pre><code>&lt;b&gt;&amp;&lt;/b&gt;</code></pre>',
    );
    expect(md('use `a<b`')).toBe('<p>use <code>a&lt;b</code></p>');
  });

  it('renders bold, and bullet or numbered lines as one list', () => {
    expect(md('**Key** idea\n- one\n2) two\n• three\n\nAfter')).toBe(
      '<p><strong>Key</strong> idea</p><ul><li>one</li><li>two</li><li>three</li></ul><p>After</p>',
    );
  });

  it('closes a list at the end of the text and keeps fenced code verbatim', () => {
    expect(md('Steps:\n1. first\n2. second')).toBe(
      '<p>Steps:</p><ul><li>first</li><li>second</li></ul>',
    );
    expect(md('```java\nint x = 1;\n  **y**\n```\nok')).toBe(
      '<pre><code>int x = 1;\n  **y**</code></pre><p>ok</p>',
    );
  });

  it('renders an unclosed fence as code while it is still streaming', () => {
    expect(md('Try:\n```python\nprint(1)')).toBe(
      '<p>Try:</p><pre><code>print(1)</code></pre>',
    );
  });
});

describe('tutor conversation', () => {
  const turns = (count: number): TutorTurn[] =>
    Array.from({ length: count }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `turn ${i}`,
    }));

  it('puts the rules first and wraps the first question with its context', () => {
    const messages = tutorMessages(course, turns(3), {
      label: 'Studio 1',
      text: 'Prove it.',
    });
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain(
      'Georgia Tech ABC 1234 (Intro to Widgets). Extra.',
    );
    expect(messages[0].content).toContain('never LaTeX');
    expect(messages[1].content).toBe(
      'Context:\nProve it.\n\nStudent question: turn 0',
    );
    expect(messages[3].content).toBe('turn 2');
  });

  it('asks math courses for TeX', () => {
    expect(
      tutorMessages({ ...course, math: true }, turns(1), null)[0].content,
    ).toContain('write math in TeX between single dollar signs');
  });

  it('sends only the most recent turns, so old context ages out', () => {
    const messages = tutorMessages(course, turns(15), {
      label: 'x',
      text: 'ctx',
    });
    expect(messages).toHaveLength(TUTOR_MAX_TURNS + 1);
    expect(messages[1].content).toBe('turn 3');
    expect(
      messages.some((message) => String(message.content).includes('Context:')),
    ).toBe(false);
  });
});
