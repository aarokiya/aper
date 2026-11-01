import { describe, expect, it } from 'vitest';
import { courseColors, getCourseColor } from '@/lib/course-colors';

describe('course color mapping', () => {
  const courses = [{ id: 41 }, { id: 12 }, { id: 99 }];

  it('assigns colors from the canonical sidebar course order', () => {
    expect(getCourseColor(41, courses)).toBe(courseColors[0]);
    expect(getCourseColor(12, courses)).toBe(courseColors[1]);
    expect(getCourseColor(99, courses)).toBe(courseColors[2]);
  });

  it('returns the same color every time a course appears', () => {
    expect(getCourseColor(12, courses)).toBe(getCourseColor(12, courses));
    expect(getCourseColor(12, courses)).not.toBe(getCourseColor(41, courses));
  });

  it('uses a neutral color for personal tasks', () => {
    expect(getCourseColor(null, courses)).toBe('var(--muted-foreground)');
  });
});
