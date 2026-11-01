import { describe, expect, it } from 'vitest';
import {
  gradescopeCourseKey,
  gradescopeProviderState,
  inferGradescopeAssignmentType,
  parseGradescopeDate,
} from '@/lib/gradescope/provider';

describe('Gradescope normalization', () => {
  it('matches course codes across Gradescope naming styles', () => {
    expect(gradescopeCourseKey('ISYE-2027-C Probability and Statistics')).toBe('ISYE2027');
    expect(gradescopeCourseKey('CS 1332 Spring 2027')).toBe('CS1332');
  });

  it('normalizes Gradescope Eastern timestamps', () => {
    expect(parseGradescopeDate('2026-09-04 23:59:00 -0400')).toBe(
      '2026-09-05T03:59:00.000Z',
    );
  });

  it('normalizes status and assignment type', () => {
    expect(gradescopeProviderState('No Submission')).toBe('UNSUBMITTED');
    expect(gradescopeProviderState('Submitted')).toBe('SUBMITTED');
    expect(gradescopeProviderState('8.5 / 10.0')).toBe('GRADED');
    expect(inferGradescopeAssignmentType('QUIZ 1')).toBe('QUIZ');
    expect(inferGradescopeAssignmentType('Final Exam')).toBe('EXAM');
  });
});
