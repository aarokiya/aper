'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { planSchema, type Plan } from './types';

/**
 * Your plan in the browser, saved the way Study Hub progress is: each change
 * is stamped (`t`) and kept in localStorage at once, then sent to the
 * database 500 ms after the last change and whenever the page is hidden. On
 * load the newer copy wins, so a reload or a failed save can't lose work.
 */
const LOCAL_KEY = 'aper-planner-plan';
const SAVE_DELAY_MS = 500;

export type PlanSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function remember(plan: Plan) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(plan));
  } catch {
    // Storage full or blocked: the database save still runs.
  }
}

export function usePlanStore(initial: Plan) {
  const [plan, setPlan] = useState(initial);
  const [status, setStatus] = useState<PlanSaveStatus>('idle');
  const latest = useRef(initial);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const persist = useCallback(async (keepalive = false) => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    setStatus('saving');
    try {
      const response = await fetch('/api/planner', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(latest.current),
        keepalive,
      });
      if (!response.ok)
        throw new Error(`Saving the plan failed (${response.status}).`);
      setStatus('saved');
    } catch {
      // Kept dirty, so the next change or leaving the page retries.
      dirty.current = true;
      setStatus('error');
    }
  }, []);

  const commit = useCallback(
    (next: Plan) => {
      latest.current = next;
      dirty.current = true;
      setPlan(next);
      remember(next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void persist(), SAVE_DELAY_MS);
    },
    [persist],
  );

  // The browser copy wins when it is newer: a change that never reached the database.
  useEffect(() => {
    let local: Plan | null = null;
    try {
      const parsed = planSchema.safeParse(
        JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null'),
      );
      if (parsed.success) local = parsed.data;
    } catch {
      local = null;
    }
    if (local && local.t > initial.t) commit(local);
    else remember(initial);
  }, [commit, initial]);

  useEffect(() => {
    const flush = () => void persist(true);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [persist]);

  /** Changes the plan: `mutate` edits a copy, which is stamped and saved. */
  const update = useCallback(
    (mutate: (draft: Plan) => void) => {
      const draft = structuredClone(latest.current);
      mutate(draft);
      draft.t = Date.now();
      commit(draft);
    },
    [commit],
  );

  /** Takes a plan the server has already saved (reset). */
  const replace = useCallback((next: Plan) => {
    window.clearTimeout(timer.current);
    dirty.current = false;
    latest.current = next;
    setPlan(next);
    remember(next);
  }, []);

  return { plan, status, update, replace };
}
