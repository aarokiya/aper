import { describe, expect, it } from 'vitest';
import { handshakeSyncDue } from '@/lib/handshake/cadence';
import {
  careerProfileSchema,
  DEFAULT_CAREER_PROFILE,
  explainRelevance,
  mentions,
  scoreEvent,
  type CareerProfile,
  type ScorableEvent,
} from '@/lib/handshake/relevance';

const NOW = new Date('2026-10-01T16:00:00.000Z');
const DAY = 86_400_000;
const inDays = (days: number) =>
  new Date(NOW.getTime() + days * DAY).toISOString();

const PROFILE: CareerProfile = {
  interests: ['software engineering', 'machine learning', 'data'],
  excludes: ['senior', 'PhD only'],
};

const event = (overrides: Partial<ScorableEvent>): ScorableEvent => ({
  title: 'Event',
  category: 'Other',
  descriptionText: '',
  organizerName: null,
  location: null,
  eventFormat: null,
  startsAt: inDays(5),
  postedBySchool: false,
  rsvpStatus: null,
  listRank: null,
  ...overrides,
});

const labels = (reasons: Array<{ label: string }>) =>
  reasons.map((reason) => reason.label);

describe('keyword matching', () => {
  it('tolerates inflections but not unrelated words', () => {
    expect(
      mentions('Senior software engineers mentor you', 'software engineering'),
    ).toBe(true);
    expect(mentions('Datadog Tech Talk', 'data')).toBe(false);
    expect(mentions('Financial aid office assistant', 'ai')).toBe(false);
    expect(mentions('AI/ML research intern', 'ml')).toBe(true);
    expect(mentions('Undergraduate researchers', 'research')).toBe(true);
  });
});

describe('event relevance', () => {
  it('puts an on-campus school career fair this week above a distant virtual social', () => {
    const fair = scoreEvent(
      event({
        title: 'Spring 2027 All-Majors Career Fair',
        category: 'Career fair',
        location: 'McCamish Pavilion, Atlanta, GA',
        eventFormat: 'in-person',
        startsAt: inDays(3),
        postedBySchool: true,
        listRank: 2,
      }),
      PROFILE,
      NOW,
    );
    const social = scoreEvent(
      event({
        title: 'Virtual coffee hour',
        category: 'Other',
        eventFormat: 'virtual',
        startsAt: inDays(40),
      }),
      PROFILE,
      NOW,
    );
    expect(labels(fair.reasons)).toEqual(
      expect.arrayContaining([
        'career fair',
        'on campus',
        'within two weeks',
        'posted by Georgia Tech',
        'ranked #2 by Handshake',
      ]),
    );
    expect(fair.score).toBeGreaterThan(social.score + 40);
  });

  it('matches interests in the title more strongly than in the description', () => {
    const titled = scoreEvent(
      event({ title: 'Machine Learning Tech Talk', category: 'Tech talk' }),
      PROFILE,
      NOW,
    );
    const described = scoreEvent(
      event({
        title: 'Tech Talk',
        category: 'Tech talk',
        descriptionText: 'We cover machine learning infrastructure.',
      }),
      PROFILE,
      NOW,
    );
    expect(titled.score).toBeGreaterThan(described.score);
  });

  it('lowers events whose title or stated requirements name a leave-out phrase', () => {
    const base = scoreEvent(
      event({ title: 'Engineering Panel', category: 'Panel' }),
      PROFILE,
      NOW,
    );
    const titled = scoreEvent(
      event({ title: 'Senior Engineering Panel', category: 'Panel' }),
      PROFILE,
      NOW,
    );
    const required = scoreEvent(
      event({
        title: 'Engineering Panel',
        category: 'Panel',
        descriptionText: 'Open to PhD students only.',
      }),
      PROFILE,
      NOW,
    );
    const mentorship = scoreEvent(
      event({
        title: 'Engineering Panel',
        category: 'Panel',
        descriptionText: 'Hear from senior engineers about their work.',
      }),
      PROFILE,
      NOW,
    );
    expect(labels(titled.reasons)).toContain('title mentions senior');
    expect(labels(required.reasons)).toContain('requirements mention PhD');
    expect(required.score).toBeLessThan(base.score);
    expect(mentorship.score).toBe(base.score);
  });

  it('ranks by Handshake rank and event kind when no interests are set', () => {
    expect(DEFAULT_CAREER_PROFILE).toEqual({ interests: [], excludes: [] });
    const ranked = scoreEvent(
      event({ title: 'Machine Learning Tech Talk', category: 'Career fair', listRank: 1 }),
      DEFAULT_CAREER_PROFILE,
      NOW,
    );
    const plain = scoreEvent(
      event({ title: 'Machine Learning Tech Talk', category: 'Other' }),
      DEFAULT_CAREER_PROFILE,
      NOW,
    );
    expect(labels(ranked.reasons)).toEqual(
      expect.arrayContaining(['ranked #1 by Handshake', 'career fair']),
    );
    expect(labels(ranked.reasons).some((l) => l.startsWith('matches'))).toBe(false);
    expect(ranked.score).toBeGreaterThan(plain.score);
  });

  it('reads profiles saved with retired keys instead of resetting them', () => {
    expect(
      careerProfileSchema.parse({
        interests: ['robotics'],
        classYear: 'first-year',
        jobTypes: ['internship'],
        locations: ['Atlanta', 'remote'],
        excludes: ['senior'],
      }),
    ).toEqual({ interests: ['robotics'], excludes: ['senior'] });
  });

  it('explains positives as a sentence and keeps cautions separate', () => {
    expect(
      explainRelevance([
        { label: 'ranked #1 by Handshake', points: 20 },
        { label: 'title mentions senior', points: -30 },
        { label: 'career fair', points: 18 },
      ]),
    ).toEqual({
      why: 'Ranked #1 by Handshake, career fair.',
      caution: 'Title mentions senior.',
    });
  });
});

describe('daily Handshake cadence', () => {
  const morning = new Date(2026, 9, 2, 8, 0);
  const base = {
    now: morning,
    hasSession: true,
    authStatus: 'CONNECTED',
    lastSuccessAt: new Date(morning.getTime() - 25 * 3_600_000).toISOString(),
    lastAttemptAt: new Date(morning.getTime() - 25 * 3_600_000).toISOString(),
  };

  it('runs once a day after the morning hour for a connected student', () => {
    expect(handshakeSyncDue(base)).toBe(true);
    expect(
      handshakeSyncDue({ ...base, now: new Date(2026, 9, 2, 6, 30) }),
    ).toBe(false);
    expect(handshakeSyncDue({ ...base, hasSession: false })).toBe(false);
    expect(
      handshakeSyncDue({
        ...base,
        lastSuccessAt: new Date(
          morning.getTime() - 10 * 3_600_000,
        ).toISOString(),
      }),
    ).toBe(false);
    expect(
      handshakeSyncDue({ ...base, lastSuccessAt: null, lastAttemptAt: null }),
    ).toBe(true);
  });

  it('backs off after failures, longer when sign-in is needed', () => {
    const threeHoursAgo = new Date(
      morning.getTime() - 3 * 3_600_000,
    ).toISOString();
    const oneHourAgo = new Date(morning.getTime() - 3_600_000).toISOString();
    expect(
      handshakeSyncDue({
        ...base,
        authStatus: 'ERROR',
        lastAttemptAt: threeHoursAgo,
      }),
    ).toBe(true);
    expect(
      handshakeSyncDue({
        ...base,
        authStatus: 'ERROR',
        lastAttemptAt: oneHourAgo,
      }),
    ).toBe(false);
    expect(
      handshakeSyncDue({
        ...base,
        authStatus: 'AUTHENTICATION_REQUIRED',
        lastAttemptAt: threeHoursAgo,
      }),
    ).toBe(false);
  });
});
