'use client';

import type { ReactNode } from 'react';
import { useStudyProgress } from '@/lib/study/progress-client';
import type { StudyCourseState } from '@/lib/study/types';

export type ProgressSeed = { id: string; initial: StudyCourseState };

/**
 * Live progress for several courses at once (the overview sorts exams across
 * courses). Each level subscribes to one course through the shared store, so
 * the hook count per component stays fixed.
 */
export function WithProgress({
  seeds,
  children,
}: {
  seeds: readonly ProgressSeed[];
  children: (states: StudyCourseState[]) => ReactNode;
}) {
  return <Level seeds={seeds} index={0} states={[]} render={children} />;
}

function Level({
  seeds,
  index,
  states,
  render,
}: {
  seeds: readonly ProgressSeed[];
  index: number;
  states: StudyCourseState[];
  render: (states: StudyCourseState[]) => ReactNode;
}) {
  if (index >= seeds.length) return render(states);
  return (
    <Subscribed seeds={seeds} index={index} states={states} render={render} />
  );
}

function Subscribed({
  seeds,
  index,
  states,
  render,
}: {
  seeds: readonly ProgressSeed[];
  index: number;
  states: StudyCourseState[];
  render: (states: StudyCourseState[]) => ReactNode;
}) {
  const { state } = useStudyProgress(seeds[index].id, seeds[index].initial);
  return (
    <Level
      seeds={seeds}
      index={index + 1}
      states={[...states, state]}
      render={render}
    />
  );
}
