'use client';

import { useSyncExternalStore } from 'react';

/**
 * Practice-exam clocks, kept in memory per course+exam so a running timer
 * keeps counting while you switch tabs or weeks (artifact `timers`). Like the
 * artifact, they reset on reload.
 */
type Clock = { left: number; run: boolean };

const clocks = new Map<string, Clock>();
const intervals = new Map<string, number>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function clockFor(key: string, total: number) {
  let clock = clocks.get(key);
  if (!clock) {
    clock = { left: total, run: false };
    clocks.set(key, clock);
  }
  return clock;
}

function stop(key: string) {
  const handle = intervals.get(key);
  if (handle !== undefined) window.clearInterval(handle);
  intervals.delete(key);
}

function set(key: string, clock: Clock) {
  clocks.set(key, clock);
  emit();
}

export function useExamTimer(key: string, minutes: number) {
  const total = Math.max(0, Math.round(minutes * 60));
  const clock = useSyncExternalStore(
    subscribe,
    () => clockFor(key, total),
    () => clockFor(key, total),
  );

  const pause = () => {
    stop(key);
    set(key, { ...clockFor(key, total), run: false });
  };

  const start = () => {
    if (clockFor(key, total).left === 0) return;
    stop(key);
    set(key, { ...clockFor(key, total), run: true });
    intervals.set(
      key,
      window.setInterval(() => {
        const left = Math.max(0, clockFor(key, total).left - 1);
        if (left === 0) stop(key);
        set(key, { left, run: left > 0 });
      }, 1000),
    );
  };

  const reset = () => {
    stop(key);
    set(key, { left: total, run: false });
  };

  return { ...clock, total, start, pause, reset };
}
