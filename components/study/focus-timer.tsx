'use client';

import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  focusDay,
  focusMinutes,
  focusStatus,
  formatClock,
  IDLE_FOCUS_TIMER,
  parseFocusTimer,
  pause,
  PHASE_LABEL,
  remaining,
  reset,
  resume,
  skip,
  start,
  tick,
  type FocusDurations,
  type FocusTimerState,
} from '@/lib/study/focus-timer';
import { useStudyPrefs } from '@/lib/study/prefs-client';
import type { StudyPrefs } from '@/lib/study/prefs-schema';
import { cn } from '@/lib/utils';

/**
 * The focus timer's shared store: the state lives in localStorage so it
 * survives navigation and reloads, and every tab follows it through the
 * `storage` event. Phase ends are applied under a Web Lock so only one tab
 * chimes.
 */
const STORAGE_KEY = 'aper-focus-timer';
const COMMAND_EVENT = 'aper:focus-timer';
/** Popover width (px); keep in sync with the panel's w-[244px]. */
const PANEL_WIDTH = 244;

type FocusCommand = 'start' | 'pause';

const listeners = new Set<() => void>();
let snapshot: FocusTimerState | null = null;

function readStored(): FocusTimerState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return (raw && parseFocusTimer(JSON.parse(raw))) || IDLE_FOCUS_TIMER;
  } catch {
    return IDLE_FOCUS_TIMER;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  snapshot = readStored();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot() {
  snapshot ??= readStored();
  return snapshot;
}

/** Apply a change to the latest stored timer (another tab may have moved it) and save. */
function commit(change: (state: FocusTimerState) => FocusTimerState) {
  const current = readStored();
  const next = change(current);
  if (next !== current) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: the timer still runs in this tab.
    }
  }
  snapshot = next;
  emit();
}

/** Live focus timer state (idle during server render and hydration). */
export function useFocusTimer(): FocusTimerState {
  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE_FOCUS_TIMER);
}

/** Start a focus session (or resume a paused phase) from anywhere, e.g. the command palette. */
export function startFocusTimer() {
  window.dispatchEvent(
    new CustomEvent<FocusCommand>(COMMAND_EVENT, { detail: 'start' }),
  );
}

/** Pause the running phase from anywhere. */
export function pauseFocusTimer() {
  window.dispatchEvent(
    new CustomEvent<FocusCommand>(COMMAND_EVENT, { detail: 'pause' }),
  );
}

// ── signals ──────────────────────────────────────────────────────────────

let audio: AudioContext | null = null;

/** Create/resume the audio context during a click, so a later chime may play. */
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

/** Three soft descending-then-rising sine notes. */
function chime() {
  try {
    audio ??= new AudioContext();
    const context = audio;
    void context.resume();
    const t = context.currentTime + 0.05;
    for (const [frequency, offset] of [
      [880, 0],
      [660, 0.2],
      [990, 0.4],
    ]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, t + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.6);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(t + offset);
      oscillator.stop(t + offset + 0.65);
    }
  } catch {
    // No audio output available.
  }
}

let flashTimer: number | null = null;

/** Alternate the tab title with `text` for a few seconds (longer while the tab is in the background). */
function flashTitle(text: string) {
  if (flashTimer !== null) window.clearInterval(flashTimer);
  let base = document.title;
  let count = 0;
  flashTimer = window.setInterval(() => {
    count += 1;
    const seen = document.visibilityState === 'visible' && document.hasFocus();
    if (count > 30 || (seen && count > 6)) {
      if (document.title === text) document.title = base;
      if (flashTimer !== null) window.clearInterval(flashTimer);
      flashTimer = null;
      return;
    }
    if (document.title === text) document.title = base;
    else {
      // The page may have changed its title (navigation) since the last flash.
      base = document.title;
      document.title = text;
    }
  }, 1000);
}

/** Run `work` while holding the timer lock (all tabs), or right away without Web Locks. */
function withLock(work: () => void) {
  if (typeof navigator !== 'undefined' && navigator.locks)
    void navigator.locks.request(STORAGE_KEY, () => work());
  else work();
}

// ── control ──────────────────────────────────────────────────────────────

/** Rail-foot focus timer: phase and countdown, with a popover of controls. */
export function FocusTimer({
  initialPrefs,
  className,
}: {
  initialPrefs: StudyPrefs;
  className?: string;
}) {
  const [prefs] = useStudyPrefs(initialPrefs);
  const durations: FocusDurations = prefs.timer;
  const timer = useFocusTimer();
  const status = focusStatus(timer);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(
    null,
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const sound = prefs.timer.sound;
  const settings = useRef({ durations, sound });
  useEffect(() => {
    settings.current = { durations, sound };
  });

  // Apply phase ends (here or after a reload) and keep the countdown fresh.
  useEffect(() => {
    if (status !== 'running') return;
    const step = () => {
      const at = Date.now();
      setNow(at);
      const stored = readStored();
      if (stored.endsAt === null || stored.endsAt > at) return;
      withLock(() => {
        const latest = readStored();
        const endedAt = latest.endsAt;
        if (endedAt === null || endedAt > Date.now()) return;
        const { state, ended } = tick(
          latest,
          Date.now(),
          settings.current.durations,
        );
        commit(() => state);
        // Only signal ends that just happened, not ones missed while closed.
        if (!ended.length || Date.now() - endedAt > 60_000) return;
        const last = ended[ended.length - 1];
        setAnnounce(
          `${last === 'focus' ? 'Focus session done' : `${PHASE_LABEL[last]} over`}. ${PHASE_LABEL[state.phase]} next.`,
        );
        if (settings.current.sound) chime();
        flashTitle(last === 'focus' ? 'Break time' : 'Back to focus');
      });
    };
    const first = window.setTimeout(step, 0);
    const interval = window.setInterval(step, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [status]);

  // Commands from the command palette.
  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<FocusCommand>).detail;
      const at = Date.now();
      if (command === 'start') unlockAudio();
      commit((state) => {
        if (command === 'pause') return pause(state, at);
        if (state.left !== null) return resume(state, at);
        if (state.endsAt !== null) return state;
        return start(state, 'focus', at, settings.current.durations);
      });
      setNow(at);
    };
    window.addEventListener(COMMAND_EVENT, onCommand);
    return () => window.removeEventListener(COMMAND_EVENT, onCommand);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      wrapRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const act = (change: (state: FocusTimerState, at: number) => FocusTimerState) => {
    unlockAudio();
    const at = Date.now();
    setNow(at);
    setAnnounce('');
    commit((state) => change(state, at));
  };

  const left = remaining(timer, now, durations);
  const clock = formatClock(left);
  const today = focusMinutes(timer, focusDay(now));
  const breakPhase = timer.phase !== 'focus';
  const label =
    status === 'idle'
      ? 'Focus timer'
      : `${status === 'paused' ? 'Paused' : breakPhase ? 'Break' : 'Focus'} ${clock}`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={
          status === 'idle'
            ? 'Focus timer'
            : `${PHASE_LABEL[timer.phase]}, ${status === 'paused' ? 'paused, ' : ''}${clock} left`
        }
        onClick={(event) => {
          setNow(Date.now());
          // The rail clips overflow, so the panel is fixed-positioned above the button instead.
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
            bottom: window.innerHeight - rect.top + 8,
          });
          setOpen((value) => !value);
        }}
        className={cn(
          className,
          'tabular-nums',
          status === 'running' && 'text-ink',
        )}
      >
        {label}
      </button>
      <p className="sr" aria-live="polite">
        {announce}
      </p>
      {open && (
        <fieldset
          id={panelId}
          style={anchor ?? undefined}
          className="fixed z-50 m-0 w-[244px] min-w-0 border border-rule bg-paper p-3 text-[12.5px] text-ink-2"
        >
          <legend className="sr">Focus timer</legend>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink-3">
              {PHASE_LABEL[timer.phase]}
              {status === 'paused' ? ', paused' : status === 'idle' ? ', ready' : ''}
            </span>
            <span className="text-[11.5px] text-ink-4">
              {Math.min(timer.cycle, durations.longEvery)} of{' '}
              {durations.longEvery} before a long break
            </span>
          </div>
          <div className="mt-1 font-serif text-[28px] leading-none text-ink tabular-nums">
            {clock}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(['focus', 'short', 'long'] as const).map((phase) => (
              <button
                key={phase}
                type="button"
                className={cn(
                  'pill pill-sm',
                  status !== 'idle' && timer.phase === phase && 'pill-on',
                )}
                onClick={() =>
                  act((state, at) => start(state, phase, at, durations))
                }
              >
                {phase === 'focus' ? 'Start focus' : PHASE_LABEL[phase]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {status === 'idle' ? (
              <button
                type="button"
                className="pill pill-sm pill-primary"
                onClick={() =>
                  act((state, at) => start(state, state.phase, at, durations))
                }
              >
                Start {PHASE_LABEL[timer.phase].toLowerCase()}
              </button>
            ) : (
              <button
                type="button"
                className="pill pill-sm pill-primary"
                onClick={() =>
                  act((state, at) =>
                    status === 'paused' ? resume(state, at) : pause(state, at),
                  )
                }
              >
                {status === 'paused' ? 'Resume' : 'Pause'}
              </button>
            )}
            <button
              type="button"
              className="pill pill-sm"
              onClick={() => act((state, at) => skip(state, at, durations))}
            >
              Skip
            </button>
            <button
              type="button"
              className="pill pill-sm"
              disabled={status === 'idle' && timer.phase === 'focus' && !timer.cycle}
              onClick={() => act((state) => reset(state))}
            >
              Reset
            </button>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-rule pt-2 text-[11.5px] text-ink-3">
            <span>
              Today: {today} {today === 1 ? 'minute' : 'minutes'} focused
            </span>
            <Link
              href="/settings#study-timer"
              onClick={() => setOpen(false)}
              className="hover:text-ink"
            >
              Settings
            </Link>
          </div>
        </fieldset>
      )}
    </div>
  );
}
