import { describe, expect, it } from 'vitest';
import { blankState } from '@/lib/study/model';
import {
  buildProgressFile,
  newerProgress,
  progressFileName,
  readProgressFile,
} from '@/lib/study/progress-file';

const state = (t: number) => ({ ...blankState(), lec: { 1: true }, t });

describe('study hub progress files', () => {
  it('round-trips exported progress, stamped with the newest change', () => {
    const states = {
      cs1000: { ...state(5), lq: { '5-1yawuvk': { a: '1', ok: true } } },
      math2000: state(9),
    };
    const file = buildProgressFile(states, {
      course: 'math2000',
      now: new Date(2026, 9, 2, 12),
    });
    expect(file).toMatchObject({
      format: 'gt-study-hub-progress',
      version: 1,
      course: 'math2000',
      theme: null,
      t: 9,
    });
    expect(
      readProgressFile(JSON.parse(JSON.stringify(file)), [
        'cs1000',
        'math2000',
      ]),
    ).toEqual(states);
    expect(progressFileName(new Date(2026, 9, 2, 12))).toBe(
      'study-hub-progress-2026-10-02.json',
    );
  });

  it('keeps only courses this hub has, filling in missing fields', () => {
    const courses = readProgressFile(
      {
        format: 'gt-study-hub-progress',
        version: 1,
        c: { cs1000: { lec: { 2: true }, t: 7 }, other: state(3) },
      },
      ['cs1000', 'math2000'],
    );
    expect(Object.keys(courses)).toEqual(['cs1000']);
    expect(courses.cs1000).toEqual({ ...blankState(), lec: { 2: true }, t: 7 });
  });

  it('refuses files that are not progress exports or hold none of these courses', () => {
    for (const value of [
      null,
      [],
      { c: {} },
      { format: 'gt-study-hub-progress' },
      { format: 'other', c: {} },
    ])
      expect(() => readProgressFile(value, ['cs1000'])).toThrow(
        /not a study hub progress export/,
      );
    expect(() =>
      readProgressFile(
        { format: 'gt-study-hub-progress', c: { other: state(1) } },
        ['cs1000'],
      ),
    ).toThrow(/no progress for these courses/);
  });

  it('lets bundled progress replace only older saved progress', () => {
    const current = { cs1000: state(10), math2000: state(10) };
    const seed = { cs1000: state(20), math2000: state(10), phys3000: state(1) };
    expect(Object.keys(newerProgress(current, seed))).toEqual([
      'cs1000',
      'phys3000',
    ]);
    expect(newerProgress(current, { cs1000: state(0) })).toEqual({});
  });
});
