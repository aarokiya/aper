'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { studyPrefsSchema, type StudyPrefs } from './prefs-schema';

/**
 * Client-side study preferences: one module store shared by every view, so a
 * change in Settings shows up in the rail and study pages at once. Edits apply
 * immediately and are saved with a debounced PUT (flushed with keepalive when
 * the page is hidden).
 */
const SAVE_DELAY_MS = 400;
const listeners = new Set<() => void>();
let current: StudyPrefs | null = null;
let pending = false;
let timer: number | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function send(keepalive: boolean) {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!pending || !current) return Promise.resolve();
  pending = false;
  return fetch('/api/study/prefs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(current),
    keepalive,
  })
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
    })
    .catch(() => {
      // Keep the edit pending; the next change or page hide retries it.
      pending = true;
    });
}

if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => void send(true));

/** Saves pending preference edits now. */
export function flushStudyPrefs() {
  return send(false);
}

/**
 * Read and edit the study preferences. `initial` (from the server render)
 * seeds the store the first time and is what SSR/hydration see; later edits
 * in this tab always win over it.
 */
export function useStudyPrefs(
  initial: StudyPrefs,
): [StudyPrefs, (mutate: (draft: StudyPrefs) => void) => void] {
  useState(() => {
    if (typeof window !== 'undefined' && current === null) current = initial;
    return null;
  });
  const prefs = useSyncExternalStore(
    subscribe,
    () => current ?? initial,
    () => initial,
  );

  /** Apply an edit to a copy (clamped by the schema), then schedule a save. */
  const updatePrefs = useCallback(
    (mutate: (draft: StudyPrefs) => void) => {
      const draft = structuredClone(current ?? initial);
      mutate(draft);
      current = studyPrefsSchema.parse(draft);
      pending = true;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void send(false), SAVE_DELAY_MS);
      emit();
    },
    [initial],
  );

  return [prefs, updatePrefs];
}
