import { describe, expect, it } from 'vitest';
import {
  isActionableOverdue,
  isTaskComplete,
  normalizeProviderState,
  urgencyScore,
} from '@/lib/tasks/status';

describe('provider and local status invariants', () => {
  it('uses actual provider fields rather than score inference', () =>
    expect(normalizeProviderState({ score: 10 })).toBe('UNSUBMITTED'));
  it('maps released provider states', () => {
    expect(
      normalizeProviderState({
        workflowState: 'submitted',
        submittedAt: '2026-01-01T00:00:00Z',
      }),
    ).toBe('SUBMITTED');
    expect(
      normalizeProviderState({
        workflowState: 'graded',
        gradedAt: '2026-01-02T00:00:00Z',
      }),
    ).toBe('GRADED');
    expect(normalizeProviderState({ excused: true })).toBe('EXCUSED');
  });
  it('treats local completion like a provider submission in actionable views', () => {
    expect(isTaskComplete('UNSUBMITTED', 'DONE_LOCALLY')).toBe(true);
    expect(isTaskComplete('SUBMITTED', 'NOT_STARTED')).toBe(true);
    expect(isTaskComplete('GRADED', 'NOT_STARTED')).toBe(true);
    expect(isTaskComplete('UNSUBMITTED', 'IN_PROGRESS')).toBe(false);
  });
  it('only treats an unsubmitted past-due item as actionable overdue', () => {
    const due = '2026-08-30T00:00:00Z';
    const now = new Date('2026-08-31T00:00:00Z');
    expect(isActionableOverdue(due, 'UNSUBMITTED', now)).toBe(true);
    expect(isActionableOverdue(due, 'SUBMITTED', now)).toBe(false);
    expect(isActionableOverdue(due, 'EXCUSED', now)).toBe(false);
  });
  it('orders overdue work above future work transparently', () =>
    expect(
      urgencyScore(
        { dueAt: '2026-08-30T00:00:00Z', providerState: 'UNSUBMITTED' },
        new Date('2026-08-31T00:00:00Z'),
      ),
    ).toBeGreaterThan(
      urgencyScore(
        { dueAt: '2026-09-02T00:00:00Z', providerState: 'UNSUBMITTED' },
        new Date('2026-08-31T00:00:00Z'),
      ),
    ));
});
