import { describe, expect, it } from 'vitest';
import {
  condensePart,
  condenseWeek,
  SHORT_PART_CHARS,
  wordCount,
} from '@/lib/study/condense';
import type { StudyLecturePart, StudyWeek } from '@/lib/study/types';

/** A paragraph long enough to push a part past the short-part limit. */
const filler = `<p>${'Filler words explain the idea at length again. '.repeat(30)}</p>`;
const def =
  '<div class="box def"><p class="box-t">In plain English</p><p>A loop repeats code.</p></div>';
const key =
  '<div class="box key"><p class="box-t">Remember</p><p>Loops need an exit.</p></div>';
const warn1 =
  '<div class="box warn"><p class="box-t">Watch out</p><p>Off by one.</p></div>';
const warn2 =
  '<div class="box warn"><p class="box-t">Classic traps</p><ul><li>Semicolon after for.</li></ul></div>';
const ex =
  '<div class="box ex"><p class="box-t">Example</p><p>Count to ten.</p></div>';
const pre1 =
  '<pre><code class="language-java">for (int i = 0; i &lt; n; i++) {\n    sum += i;\n}</code></pre>';
const pre2 = '<pre><code class="language-java">while (x) {}</code></pre>';

const part = (h: string, b: string): StudyLecturePart => ({ h, b });

describe('condensePart', () => {
  it('collapses orientation parts whatever their length', () => {
    for (const h of [
      'Start here: what this lecture is about',
      'start here',
      'What to read in Liang',
      'In lecture this week',
    ])
      expect(condensePart(part(h, filler))).toEqual({
        mode: 'collapsed',
        label: h,
        fullWords: wordCount(filler),
      });
    expect(condensePart(part('In lecture this week', '<p>Short.</p>'))).toEqual(
      { mode: 'collapsed', label: 'In lecture this week', fullWords: 1 },
    );
  });

  it('collapses worked examples and exam traps under their heading', () => {
    expect(condensePart(part('Worked example: a Bike', filler + pre1))).toMatchObject({
      mode: 'collapsed',
      label: 'Worked example: a Bike',
    });
    expect(condensePart(part('Exam traps: loops', '<p>Short.</p>'))).toMatchObject({
      mode: 'collapsed',
      label: 'Exam traps: loops',
    });
  });

  it('keeps cheat sheets and short parts whole', () => {
    expect(condensePart(part('Cheat sheet: loops', filler + def))).toEqual({
      mode: 'full',
      fullWords: wordCount(filler + def),
    });
    const short = `<p>${'x'.repeat(SHORT_PART_CHARS)}</p>`;
    expect(condensePart(part('Loops', short)).mode).toBe('full');
    expect(
      condensePart(part('Loops', `<p>${'x'.repeat(SHORT_PART_CHARS + 1)}</p>`))
        .mode,
    ).toBe('key');
  });

  it('keeps def and key boxes plus the first code block, in order', () => {
    const body = [filler, key, '<p>Middle.</p>', pre1, warn1, def, pre2, ex, warn2].join(
      '',
    );
    const out = condensePart(part('Loops', body));
    expect(out).toEqual({
      mode: 'key',
      html: key + pre1 + def,
      traps: [warn1, warn2],
      fullWords: wordCount(body),
      keyWords: wordCount(key + pre1 + def),
    });
    if (out.mode === 'key') expect(out.keyWords).toBeLessThan(out.fullWords);
  });

  it('keeps nested divs inside boxes intact', () => {
    const nested =
      '<div class="box def"><p class="box-t">In plain English</p><div class="tbl-wrap"><table><tr><td>a</td></tr></table></div><div><p>inner</p></div></div>';
    const out = condensePart(part('Tables', filler + nested + warn1));
    expect(out).toMatchObject({ mode: 'key', html: nested, traps: [warn1] });
  });

  it('falls back to the first paragraph and code block without def/key boxes', () => {
    const body = [
      '<ul><li>intro</li></ul>',
      pre1,
      filler,
      '<p>Second.</p>',
      pre2,
      warn1,
    ].join('');
    expect(condensePart(part('Loops', body))).toMatchObject({
      mode: 'key',
      html: pre1 + filler,
      traps: [warn1],
    });
  });

  it('keeps a long part whole when nothing can stand for it', () => {
    const body = `<ul><li>${'word '.repeat(400)}</li></ul>`;
    expect(condensePart(part('Lists', body))).toEqual({
      mode: 'full',
      fullWords: 400,
    });
  });
});

describe('condenseWeek', () => {
  const week = (parts: StudyLecturePart[][]): Pick<StudyWeek, 'lectures'> => ({
    lectures: parts.map((list, i) => ({
      title: `L${i}`,
      when: '',
      sec: '',
      parts: list,
    })),
  });

  it('condenses every part of a week with long notes, per lecture', () => {
    const out = condenseWeek(
      week([
        [part('In lecture this week', '<p>Hi.</p>'), part('Loops', filler + def)],
        [part('Worked example', '<p>Short.</p>'), part('Recap', '<p>Short.</p>')],
      ]),
    );
    expect(out.map((list) => list.map((item) => item.mode))).toEqual([
      ['collapsed', 'key'],
      ['collapsed', 'full'],
    ]);
  });

  it('leaves a week of short parts whole', () => {
    const out = condenseWeek(
      week([[part('Worked example', '<p>Two words.</p>'), part('Start here', '<p>Go.</p>')]]),
    );
    expect(out).toEqual([
      [
        { mode: 'full', fullWords: 2 },
        { mode: 'full', fullWords: 1 },
      ],
    ]);
  });
});
