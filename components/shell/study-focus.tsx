'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import {
  isStudyPath,
  STUDY_FOCUS_ATTR,
  STUDY_FOCUS_KEY,
} from './study-focus-boot';

const listeners = new Set<() => void>();
let focus: boolean | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function studyFocusOn() {
  if (focus === null) {
    try {
      focus = localStorage.getItem(STUDY_FOCUS_KEY) === '1';
    } catch {
      focus = false;
    }
  }
  return focus;
}

/** Focus mode applies only on /study pages; elsewhere the app looks normal. */
function applyStudyFocus(pathname: string) {
  document.documentElement.toggleAttribute(
    STUDY_FOCUS_ATTR,
    studyFocusOn() && isStudyPath(pathname),
  );
}

/**
 * The hub's `toggleFocus`/`applyFocus`: saves the choice, hides or shows the
 * rail at once (so a following `focus()` can reach it), and with
 * `tryFullscreen` asks the browser for full screen where it's allowed.
 */
export function setStudyFocus(on: boolean, tryFullscreen: boolean) {
  focus = on;
  try {
    if (on) localStorage.setItem(STUDY_FOCUS_KEY, '1');
    else localStorage.removeItem(STUDY_FOCUS_KEY);
  } catch {
    // Private mode: focus mode still works for this page.
  }
  applyStudyFocus(window.location.pathname);
  for (const listener of listeners) listener();
  if (!tryFullscreen) return;
  try {
    const root = document.documentElement;
    if (on && !document.fullscreenElement && root.requestFullscreen)
      root.requestFullscreen().catch(() => undefined);
    if (!on && document.fullscreenElement && document.exitFullscreen)
      document.exitFullscreen().catch(() => undefined);
  } catch {
    // Full screen is optional.
  }
}

function useStudyFocus() {
  return useSyncExternalStore(subscribe, studyFocusOn, () => false);
}

/** Rail foot button ("Hide sidebar"). */
export function StudyFocusToggle({ className }: { className?: string }) {
  const on = useStudyFocus();
  return (
    <button
      type="button"
      aria-pressed={on}
      title={
        on ? 'Show sidebar (F)' : 'Hide sidebar for a full-width view (F)'
      }
      onClick={() => setStudyFocus(!on, true)}
      className={className}
    >
      Hide sidebar
    </button>
  );
}

/**
 * Focus mode on /study pages: keeps <html> in step with the route, binds the
 * hub's F and Escape keys, and draws the floating "Sidebar" button that
 * brings the rail back (globals.css shows it only in focus mode).
 */
export function StudyFocus() {
  const pathname = usePathname();
  const on = useStudyFocus();
  const study = isStudyPath(pathname);

  useEffect(() => {
    applyStudyFocus(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!study) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (studyFocusOn() && !document.fullscreenElement)
          setStudyFocus(false, false);
        return;
      }
      if (event.key !== 'f' && event.key !== 'F') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = document.activeElement as HTMLElement | null;
      if (
        target &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.isContentEditable)
      )
        return;
      event.preventDefault();
      setStudyFocus(!studyFocusOn(), true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [study]);

  if (!study) return null;
  return (
    <button
      type="button"
      className="study-focus-exit"
      aria-label="Show sidebar"
      aria-pressed={on}
      title={
        on ? 'Show sidebar (F)' : 'Hide sidebar for a full-width view (F)'
      }
      onClick={() => setStudyFocus(!on, true)}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </svg>
      <span>Sidebar</span>
    </button>
  );
}
