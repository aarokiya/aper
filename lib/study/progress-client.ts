'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { blankState, normalizeState } from './model';
import { readProgressFile } from './progress-file';
import type { StudyCourseState } from './types';

/**
 * Client-side source of truth for Study Hub progress. Views and the rail read
 * the same entries, edits are applied immediately, and a debounced PUT
 * persists them to the local database (flushed with keepalive on page hide).
 * Every edit is also kept in this browser's storage, and whichever copy is
 * newer wins when a page loads (the Study Hub's own rule), so a reload before
 * the save lands, or a failed save, never loses work.
 */
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type Entry = { state: StudyCourseState; timer: number | null; dirty: boolean };

const BLANK = blankState();
const SAVE_DELAY_MS = 500;
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let saveStatus: SaveStatus = 'idle';
const fetches = new Map<string, Promise<void>>();
const saving = new Map<string, Promise<void>>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const localKey = (courseId: string) => `aper-study-progress:${courseId}`;

function remember(courseId: string, state: StudyCourseState) {
  try {
    window.localStorage.setItem(localKey(courseId), JSON.stringify(state));
  } catch {
    // Storage full or blocked: the database save still runs.
  }
}

function recall(courseId: string): StudyCourseState | null {
  try {
    const raw = window.localStorage.getItem(localKey(courseId));
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function persist(courseId: string, keepalive = false) {
  const entry = entries.get(courseId);
  if (!entry?.dirty) return saving.get(courseId) ?? Promise.resolve();
  entry.dirty = false;
  if (entry.timer !== null) {
    window.clearTimeout(entry.timer);
    entry.timer = null;
  }
  saveStatus = 'saving';
  emit();
  const request = fetch(`/api/study/progress/${encodeURIComponent(courseId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry.state),
    keepalive,
  })
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      saveStatus = 'saved';
    })
    .catch(() => {
      entry.dirty = true;
      saveStatus = 'error';
    })
    .finally(() => {
      if (saving.get(courseId) === request) saving.delete(courseId);
      emit();
    });
  saving.set(courseId, request);
  return request;
}

function schedule(courseId: string, entry: Entry) {
  if (entry.timer !== null) window.clearTimeout(entry.timer);
  entry.timer = window.setTimeout(() => void persist(courseId), SAVE_DELAY_MS);
}

if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => {
    for (const courseId of entries.keys()) void persist(courseId, true);
  });

/** The database's copy, unless this browser holds a newer one, which is then saved again. */
function adoptNewest(courseId: string, saved: StudyCourseState) {
  const local = recall(courseId);
  if (local && local.t > saved.t) {
    const entry: Entry = { state: local, timer: null, dirty: true };
    entries.set(courseId, entry);
    schedule(courseId, entry);
  } else
    entries.set(courseId, {
      state: normalizeState(saved),
      timer: null,
      dirty: false,
    });
}

/** Adopt server state unless the client already holds newer edits. */
export function seedStudyProgress(courseId: string, state: StudyCourseState) {
  if (typeof window === 'undefined') return;
  const existing = entries.get(courseId);
  if (existing && (existing.dirty || existing.state.t >= state.t)) return;
  adoptNewest(courseId, state);
  emit();
}

/** Replace a course's progress with one the server already saved (after an import). */
function adoptSaved(courseId: string, state: StudyCourseState) {
  const existing = entries.get(courseId);
  if (existing?.timer != null) window.clearTimeout(existing.timer);
  entries.set(courseId, { state, timer: null, dirty: false });
  remember(courseId, state);
}

function ensureLoaded(courseId: string) {
  if (entries.has(courseId) || fetches.has(courseId)) return;
  const request = fetch(`/api/study/progress/${encodeURIComponent(courseId)}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((payload) => {
      if (payload && !entries.has(courseId))
        adoptNewest(courseId, normalizeState(payload));
      emit();
    })
    .catch(() => undefined)
    .finally(() => fetches.delete(courseId));
  fetches.set(courseId, request);
}

/**
 * Apply an edit to a copy of a course's progress, then schedule a save.
 * Works for any course the store holds (seeded by a view or loaded);
 * views that seed with `initial` call this through `useStudyProgress`.
 */
export function updateStudyProgress(
  courseId: string,
  mutate: (draft: StudyCourseState) => void,
) {
  const entry = entries.get(courseId);
  const draft = structuredClone(
    entry?.state ?? recall(courseId) ?? blankState(),
  );
  mutate(draft);
  draft.t = Date.now();
  const next = entry ?? { state: draft, timer: null, dirty: false };
  next.state = draft;
  next.dirty = true;
  remember(courseId, draft);
  schedule(courseId, next);
  entries.set(courseId, next);
  emit();
}

/** Saves every pending edit now and waits for saves already on their way. */
export async function flushStudyProgress() {
  await Promise.all([...entries.keys()].map((courseId) => persist(courseId)));
}

/**
 * **Export progress**: saves pending edits, then downloads every course's
 * progress as the Study Hub's progress file.
 */
export async function exportStudyProgress(course: string | null) {
  await flushStudyProgress();
  const response = await fetch(
    `/api/study/progress${course ? `?course=${encodeURIComponent(course)}` : ''}`,
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? 'Could not export progress.');
  }
  const name =
    response.headers
      .get('Content-Disposition')
      ?.match(/filename="([^"]+)"/)?.[1] ?? 'study-hub-progress.json';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(await response.blob());
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

/**
 * **Import progress**: after the hub's confirmation, replaces the progress of
 * every course the file holds. Returns the imported course ids, or null when
 * the student cancels; throws with the hub's wording for unusable files.
 */
export async function importStudyProgress(
  file: File,
  courses: ReadonlyArray<{ id: string; code: string }>,
) {
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const ids = Object.keys(
    readProgressFile(
      value,
      courses.map((course) => course.id),
    ),
  );
  const codes = ids.map(
    (id) => courses.find((course) => course.id === id)?.code ?? id,
  );
  if (
    !window.confirm(
      `Replace your progress for ${codes.join(', ')} with the imported file? Export first if you want a backup.`,
    )
  )
    return null;
  await flushStudyProgress();
  const response = await fetch('/api/study/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  const payload = (await response.json().catch(() => null)) as {
    courses?: Record<string, unknown>;
    error?: string;
  } | null;
  if (!response.ok || !payload?.courses)
    throw new Error(payload?.error ?? `The server answered ${response.status}.`);
  for (const [id, state] of Object.entries(payload.courses))
    adoptSaved(id, normalizeState(state));
  emit();
  return ids;
}

/**
 * Read and edit one course's progress. `initial` (from the server render)
 * seeds the store and is what SSR/hydration see, so markup always matches.
 */
export function useStudyProgress(
  courseId: string | null,
  initial?: StudyCourseState,
) {
  useState(() => {
    if (courseId && initial) seedStudyProgress(courseId, initial);
    return null;
  });
  const state = useSyncExternalStore(
    subscribe,
    () => {
      if (!courseId) return BLANK;
      const entry = entries.get(courseId);
      if (!entry) {
        ensureLoaded(courseId);
        return initial ?? BLANK;
      }
      return entry.state;
    },
    () => initial ?? BLANK,
  );

  /** Apply an edit to a copy of the state, then schedule a save. */
  const update = useCallback(
    (mutate: (draft: StudyCourseState) => void) => {
      if (!courseId) return;
      if (!entries.has(courseId) && initial)
        seedStudyProgress(courseId, initial);
      updateStudyProgress(courseId, mutate);
    },
    [courseId, initial],
  );

  /** Clear every answer, rating, grade, and exam score for the course. */
  const reset = useCallback(() => {
    update((draft) => Object.assign(draft, blankState()));
  }, [update]);

  return { state, update, reset };
}

/** "Saved locally" indicator for the rail foot. */
export function useStudySaveStatus(): SaveStatus {
  return useSyncExternalStore(
    subscribe,
    () => saveStatus,
    () => 'idle' as const,
  );
}
