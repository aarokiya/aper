import { describe, expect, it } from 'vitest';
import { isProjectTitle, selectAttention } from '@/lib/tasks/priority';
import { scoreColorClass, scorePercentage } from '@/lib/grades/score-color';
import { lockNote } from '@/lib/tasks/lock';
import { parseCapture } from '@/lib/groq/capture';

describe('project detection', () => {
  it('flags project-style titles', () => {
    expect(isProjectTitle('Project 1: Avatar')).toBe(true);
    expect(isProjectTitle('Capstone milestone 2')).toBe(true);
    expect(isProjectTitle('Final Deliverable')).toBe(true);
  });
  it('leaves ordinary work alone', () => {
    expect(isProjectTitle('HW1')).toBe(false);
    expect(isProjectTitle('Week 2 Syllabus Quiz')).toBe(false);
    expect(isProjectTitle(null)).toBe(false);
  });
  it('does not match inside longer words', () =>
    expect(isProjectTitle('Projection reading')).toBe(false));
});

describe('score colors', () => {
  it('scales red, amber, green by percentage', () => {
    expect(scoreColorClass(scorePercentage(50, 100))).toContain('destructive');
    expect(scoreColorClass(scorePercentage(80, 100))).toContain('amber');
    expect(scoreColorClass(scorePercentage(95, 100))).toContain('emerald');
  });
  it('returns null percentage when it cannot be computed', () => {
    expect(scorePercentage(5, 0)).toBeNull();
    expect(scorePercentage(null, 100)).toBeNull();
    expect(scoreColorClass(null)).toBe('text-foreground');
  });
});

describe('needs attention selection', () => {
  const now = new Date('2026-09-01T12:00:00Z');
  const at = (days: number) =>
    new Date(now.getTime() + days * 86_400_000).toISOString();
  const task = (
    name: string,
    over: Partial<{
      dueAt: string | null;
      personalDueAt: string | null;
      urgent: boolean;
      priority: number;
    }>,
  ) => ({ name, dueAt: null, urgent: false, priority: 0, ...over });

  it('keeps prioritised work only inside the 30-day horizon', () => {
    const picked = selectAttention(
      [
        task('soon', { priority: 3, dueAt: at(10) }),
        task('far', { priority: 3, dueAt: at(45) }),
      ],
      now,
    );
    expect(picked.map((item) => item.name)).toEqual(['soon']);
  });

  it('sorts overdue and due-today above prioritised work', () => {
    const picked = selectAttention(
      [
        task('project', { priority: 3, dueAt: at(20) }),
        task('today', { urgent: true, dueAt: at(0) }),
        task('overdue', { urgent: true, dueAt: at(-3) }),
      ],
      now,
    );
    expect(picked.map((item) => item.name)).toEqual([
      'overdue',
      'today',
      'project',
    ]);
  });

  it('drops unprioritised, non-urgent work and honours personal targets', () => {
    const picked = selectAttention(
      [
        task('ordinary', { dueAt: at(3) }),
        task('pulled in', { priority: 2, dueAt: at(60), personalDueAt: at(5) }),
      ],
      now,
    );
    expect(picked.map((item) => item.name)).toEqual(['pulled in']);
  });
});

describe('lock notes', () => {
  it('prefers Canvas own explanation', () =>
    expect(
      lockNote(1, 'This assignment is locked until Sep 7 at 12am.', null),
    ).toBe('This assignment is locked until Sep 7 at 12am.'));
  it('falls back to the unlock date', () =>
    expect(lockNote(1, null, '2026-09-07T04:00:00Z')).toBe(
      'Locked until Sep 7, 12:00 AM.',
    ));
  it('stays silent when nothing is locked', () =>
    expect(lockNote(0, 'ignored', '2026-09-07T04:00:00Z')).toBeNull());
  it('handles a lock with no date at all', () =>
    expect(lockNote(true, '', null)).toBe('Locked by Canvas.'));
});

describe('groq capture parsing', () => {
  it('reads a dated capture into a local task', () => {
    const task = parseCapture(
      '{"title":"Finish pset 3","notes":"chapter 4","startLocal":"2026-09-07T15:00","priority":"high","courseCode":"CS 2110"}',
      'finish pset 3 monday 3pm for 2110',
    );
    expect(task.title).toBe('Finish pset 3');
    expect(task.personalDueAt).toBe('2026-09-07T19:00:00.000Z');
    expect(task.priority).toBe(3);
    expect(task.courseCode).toBe('CS 2110');
  });
  it('keeps the raw text when the model returns nothing usable', () => {
    const task = parseCapture('not json at all', '  read chapter 4  ');
    expect(task).toMatchObject({
      title: 'read chapter 4',
      personalDueAt: null,
      priority: 0,
    });
  });
  it('never drops a task over an unreadable date', () => {
    const task = parseCapture(
      '{"title":"Lab","startLocal":"next tuesday","priority":"normal"}',
      'lab next tuesday',
    );
    expect(task.personalDueAt).toBeNull();
    expect(task.notes).toContain('unparsed time: next tuesday');
  });
});
