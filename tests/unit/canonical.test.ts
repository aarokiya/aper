import { describe, expect, it } from 'vitest';
import { matchWorkItems } from '@/lib/tasks/canonical';

describe('canonical matching', () => {
  it('merges explicit cross-provider links', () => expect(matchWorkItems({ provider: 'canvas', courseSourceId: '1', title: 'HW', linkedCanvasAssignmentId: '42' }, { provider: 'gradescope', courseSourceId: '1', title: 'Different', linkedCanvasAssignmentId: '42' }).decision).toBe('MERGE'));
  it('marks same-title/date records as possible instead of silently merging', () => expect(matchWorkItems({ provider: 'canvas', courseSourceId: '1', title: 'Homework 1', dueAt: '2026-09-01T00:00:00Z' }, { provider: 'gradescope', courseSourceId: '1', title: 'Homework 1', dueAt: '2026-09-01T00:02:00Z' }).decision).toBe('POSSIBLE'));
  it('keeps different courses separate', () => expect(matchWorkItems({ provider: 'canvas', courseSourceId: '1', title: 'HW' }, { provider: 'gradescope', courseSourceId: '2', title: 'HW' }).decision).toBe('SEPARATE'));
});
