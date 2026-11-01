'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(listener: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** True when the OS asks for reduced motion (false during SSR). */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
