'use client';

import { useSyncExternalStore } from 'react';

/**
 * A wall clock that ticks once a second while any view shows it (session
 * timer, interval previews). The server render and hydration see 0, so
 * time-dependent text appears only after mount.
 */
const listeners = new Set<() => void>();
let now = 0;
let timer: number | null = null;

function tick() {
  now = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    now = Date.now();
    timer = window.setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

const snapshot = () => now || (now = Date.now());
const serverSnapshot = () => 0;

/** Current time in ms (0 during SSR and hydration), updated every second. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Refresh the clock now (after a rating, so previews use the new state at once). */
export function refreshNow() {
  if (timer !== null) tick();
}
