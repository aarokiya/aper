import { describe, expect, it } from 'vitest';
import {
  coursePrefs,
  customSessionSchema,
  DEFAULT_STUDY_PREFS,
  effectiveSources,
  studyPrefsSchema,
} from '@/lib/study/prefs-schema';

describe('study prefs schema', () => {
  it('fills every default', () => {
    expect(DEFAULT_STUDY_PREFS).toEqual({
      retention: 0.9,
      maxInterval: 180,
      learningSteps: [1, 10],
      relearningSteps: [10],
      newPerDay: 15,
      reviewsPerDay: 150,
      dayStartsAt: 4,
      newOrder: 'current-first',
      interleave: true,
      shuffleChoices: true,
      showIntervals: true,
      sources: {
        card: true,
        quick: true,
        practice: true,
        parsons: true,
        mine: true,
      },
      courses: {},
      presets: [],
      timer: {
        focus: 25,
        short: 5,
        long: 15,
        longEvery: 4,
        autoBreak: false,
        sound: true,
      },
    });
    expect(
      studyPrefsSchema.parse({ sources: { card: false } }).sources,
    ).toEqual({
      card: false,
      quick: true,
      practice: true,
      parsons: true,
      mine: true,
    });
  });

  it('clamps out-of-range numbers instead of rejecting them', () => {
    const prefs = studyPrefsSchema.parse({
      retention: 2,
      maxInterval: 0,
      dayStartsAt: 30,
      newPerDay: -4,
      reviewsPerDay: 12.6,
      learningSteps: [0, 2.4, 5000],
      timer: { focus: 999 },
      presets: Array.from({ length: 40 }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
      })),
    });
    expect(prefs).toMatchObject({
      retention: 0.97,
      maxInterval: 1,
      dayStartsAt: 23,
      newPerDay: 0,
      reviewsPerDay: 13,
      learningSteps: [1, 2, 1440],
      timer: { focus: 180, short: 5 },
    });
    expect(prefs.presets).toHaveLength(30);
    expect(studyPrefsSchema.parse({ retention: 0.5 }).retention).toBe(0.7);
    expect(studyPrefsSchema.parse({ dayStartsAt: -2 }).dayStartsAt).toBe(0);
  });

  it('rejects values of the wrong kind', () => {
    expect(() => studyPrefsSchema.parse({ newOrder: 'sideways' })).toThrow();
    expect(() => studyPrefsSchema.parse({ retention: '0.9' })).toThrow();
    expect(() =>
      studyPrefsSchema.parse({ courses: { cs1: { notes: 'all' } } }),
    ).toThrow();
  });

  it('defaults custom sessions and orders a week range', () => {
    expect(
      customSessionSchema.parse({ weeks: [9, 3], kinds: ['card', 'card'] }),
    ).toEqual({
      cids: [],
      weeks: [3, 9],
      kinds: ['card'],
      pick: 'due',
      aheadDays: 3,
      limit: 0,
      order: 'mixed',
      reschedule: true,
    });
  });

  it('reads course options with defaults and source overrides', () => {
    const prefs = studyPrefsSchema.parse({
      sources: { quick: false },
      courses: {
        cs1: { review: false, sources: { quick: true, mine: false } },
      },
    });
    expect(coursePrefs(prefs, 'cs1')).toMatchObject({
      review: false,
      notes: 'key',
      hiddenTabs: [],
      defaultTab: null,
    });
    const fallback = coursePrefs(prefs, 'cs2');
    expect(fallback).toEqual({
      review: true,
      notes: 'key',
      hiddenTabs: [],
      defaultTab: null,
    });
    fallback.hiddenTabs.push('studio');
    expect(coursePrefs(prefs, 'cs2').hiddenTabs).toEqual([]);
    expect(effectiveSources(prefs, 'cs1')).toEqual({
      card: true,
      quick: true,
      practice: true,
      parsons: true,
      mine: false,
    });
    expect(effectiveSources(prefs, 'cs2').quick).toBe(false);
  });
});
