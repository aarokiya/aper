/**
 * The rail's red / yellow / green dot for each class: behind, something open
 * today, or caught up.
 *
 * Every class counts its open Canvas and Gradescope work with Today's rules:
 * past its due time (your target date wins) is behind, due later today is
 * today. Classes in the Study zone also follow the Study Hub's lights: a week
 * that ended without being complete (see `topicStatus`) is behind, and an
 * incomplete current week is in progress. Pure and isomorphic, so the rail
 * recomputes study status as progress changes.
 */
import { isTaskComplete } from '@/lib/tasks/status';
import {
  behindWeeks,
  courseLight,
  curWeek,
  eventsOn,
  localDayKey,
  type LightCourse,
} from './model';
import type { StudyCourseState } from './types';

/** Open work for one class. */
export type ClassWork = {
  /** past its (personal or provider) due time */
  overdue: number;
  /** due later today */
  dueToday: number;
};

export type WorkRow = {
  courseId: number;
  /** personal target date when set, else the provider's due date */
  dueAt: string;
  providerState: string;
  workflowStatus: string;
};

/** Tallies open work per course that is overdue or due later today; complete work doesn't count. */
export function tallyClassWork(
  rows: readonly WorkRow[],
  now: Date,
): Record<number, ClassWork> {
  const today = localDayKey(now);
  const work: Record<number, ClassWork> = {};
  for (const row of rows) {
    if (isTaskComplete(row.providerState, row.workflowStatus)) continue;
    const due = new Date(row.dueAt);
    const overdue = row.providerState === 'UNSUBMITTED' && due < now;
    if (!overdue && localDayKey(due) !== today) continue;
    const entry = (work[row.courseId] ??= { overdue: 0, dueToday: 0 });
    if (overdue) entry.overdue += 1;
    else entry.dueToday += 1;
  }
  return work;
}

export type ClassStatusLevel = 'behind' | 'today' | 'clear';

export type ClassStatus = {
  level: ClassStatusLevel;
  /** why it is behind: "1 overdue assignment", "weeks 1–5 not complete" */
  behind: string[];
  /** Canvas and Gradescope work due later today: "2 assignments" */
  today: string[];
  /** the Study Hub week in progress, with today's events from its schedule */
  week: { n: number; events: string[] } | null;
};

/** A Study Hub course (full or rail outline) as its light reads it. */
export type StudyPace = LightCourse;

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** [1, 2, 3, 5] → "1–3, 5" */
export function weekRanges(weeks: readonly number[]) {
  const runs: Array<[number, number]> = [];
  for (const n of [...weeks].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  return runs
    .map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`))
    .join(', ');
}

/**
 * Status for one class. `study` is set only for classes in the Study zone;
 * `today` is the local `YYYY-MM-DD` the rail renders for.
 */
export function classStatus({
  work,
  study,
  today,
}: {
  work?: ClassWork;
  study?: { course: StudyPace; state: StudyCourseState };
  today: string;
}): ClassStatus {
  const behind: string[] = [];
  const due: string[] = [];
  let week: ClassStatus['week'] = null;
  if (work?.overdue) behind.push(count(work.overdue, 'overdue assignment'));
  if (work?.dueToday) due.push(count(work.dueToday, 'assignment'));
  if (study) {
    const { course, state } = study;
    const late = behindWeeks(course.labels, state, course.weeks, today).map(
      (item) => item.n,
    );
    if (late.length)
      behind.push(
        `${late.length === 1 ? 'week' : 'weeks'} ${weekRanges(late)} not complete`,
      );
    else if (courseLight(course, state, today).level === 'yellow') {
      const current = course.weeks.find(
        (item) => item.n === curWeek(course.weeks, today),
      );
      if (current) week = { n: current.n, events: eventsOn(current, today) };
    }
  }
  return {
    level: behind.length ? 'behind' : due.length || week ? 'today' : 'clear',
    behind,
    today: due,
    week,
  };
}

/** "Behind: 1 overdue assignment; due today: 2 assignments", "Week 6 in progress (today: Quiz)", or "Caught up". */
export function statusText(status: ClassStatus) {
  const parts: string[] = [];
  if (status.behind.length) parts.push(`Behind: ${status.behind.join(', ')}`);
  if (status.today.length) parts.push(`due today: ${status.today.join(', ')}`);
  if (status.week)
    parts.push(
      `week ${status.week.n} in progress${status.week.events.length ? ` (today: ${status.week.events.join('; ')})` : ''}`,
    );
  const text = parts.join('; ');
  return text ? text[0].toUpperCase() + text.slice(1) : 'Caught up';
}
