import { describe, expect, it } from 'vitest';
import { applicableDeadline, dateBucket, normalizeTimestamp } from '@/lib/sync/dates';

describe('date semantics', () => {
  it('normalizes source timestamps to UTC and preserves the source value', () => {
    expect(normalizeTimestamp('2026-09-04T23:59:00-04:00')).toBe('2026-09-05T03:59:00.000Z');
  });
  it('selects a student-specific date over the base date', () => {
    expect(applicableDeadline({ dueAt: '2026-09-04T03:59:00Z', allDates: [{ base: true, due_at: '2026-09-04T03:59:00Z' }, { base: false, due_at: '2026-09-05T03:59:00Z' }] })).toEqual({ dueAt: '2026-09-05T03:59:00.000Z', sourceTimestamp: '2026-09-05T03:59:00Z', overrideApplied: true });
  });
  it('does not treat lock time as a due date', () => expect(applicableDeadline({ dueAt: null })).toEqual({ dueAt: null, sourceTimestamp: null, overrideApplied: false }));
  it('buckets in the given zone', () => {
    expect(dateBucket('2026-09-01T03:30:00Z', new Date('2026-08-31T16:00:00Z'), 'America/New_York')).toBe('TODAY');
    expect(dateBucket('2026-09-01T03:30:00Z', new Date('2026-08-31T16:00:00Z'), 'UTC')).toBe('TOMORROW');
  });
});
