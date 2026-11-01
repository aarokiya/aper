'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the screensaver overlay is showing. Page backgrounds read it to
 * pause their own animation while they're covered.
 */
let active = false;
const listeners = new Set<() => void>();

export function setScreensaverActive(value: boolean) {
  if (active === value) return;
  active = value;
  for (const listener of listeners) listener();
}

export function useScreensaverActive() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => active,
    () => false,
  );
}
