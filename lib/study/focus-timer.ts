/**
 * Focus timer (Pomodoro) as a pure state machine: focus, short break, and
 * long break phases; start, pause, resume, reset, and skip; auto-advance when
 * a phase ends (a long break after every `longEvery` focus sessions, breaks
 * starting on their own with `autoBreak`); focus time credited per local day.
 * Every transition takes `now` (epoch ms) and returns a new state.
 */

export type FocusPhase = 'focus' | 'short' | 'long';

/** Phase lengths in minutes, from the study preferences' `timer`. */
export type FocusDurations = {
  focus: number;
  short: number;
  long: number;
  longEvery: number;
  autoBreak: boolean;
};

export type FocusTimerState = {
  phase: FocusPhase;
  /** running: epoch ms the phase ends */
  endsAt: number | null;
  /** paused: ms left */
  left: number | null;
  /** length of the started phase in ms (0 when idle) */
  total: number;
  /** focus sessions finished since the last long break */
  cycle: number;
  /** focus ms per local `YYYY-MM-DD` */
  log: Record<string, number>;
};

export type FocusStatus = 'idle' | 'running' | 'paused';

export const PHASE_LABEL: Record<FocusPhase, string> = {
  focus: 'Focus',
  short: 'Short break',
  long: 'Long break',
};

/** Days of focus history kept. */
const LOG_DAYS = 60;
const MINUTE = 60_000;

export const IDLE_FOCUS_TIMER: FocusTimerState = {
  phase: 'focus',
  endsAt: null,
  left: null,
  total: 0,
  cycle: 0,
  log: {},
};

/** Local `YYYY-MM-DD` of an epoch ms. */
export function focusDay(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function focusStatus(state: FocusTimerState): FocusStatus {
  if (state.endsAt !== null) return 'running';
  return state.left !== null ? 'paused' : 'idle';
}

const phaseMs = (phase: FocusPhase, durations: FocusDurations) =>
  durations[phase] * MINUTE;

/** Ms left in the phase; an idle timer shows the full length of its phase. */
export function remaining(
  state: FocusTimerState,
  now: number,
  durations: FocusDurations,
): number {
  if (state.endsAt !== null) return Math.max(0, state.endsAt - now);
  if (state.left !== null) return state.left;
  return phaseMs(state.phase, durations);
}

/** `mm:ss` (minutes may exceed 59), rounding partial seconds up. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  return `${mm}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Whole focus minutes credited on `day`. */
export function focusMinutes(state: FocusTimerState, day: string): number {
  return Math.floor((state.log[day] ?? 0) / MINUTE);
}

/** Credit focus time to the local day it ended on, dropping old days. */
function credit(
  log: Record<string, number>,
  ms: number,
  at: number,
): Record<string, number> {
  if (ms <= 0) return log;
  const day = focusDay(at);
  const next = { ...log, [day]: (log[day] ?? 0) + ms };
  const days = Object.keys(next).sort();
  for (const old of days.slice(0, Math.max(0, days.length - LOG_DAYS)))
    delete next[old];
  return next;
}

/** Start `phase` from its full length (replacing whatever was running). */
export function start(
  state: FocusTimerState,
  phase: FocusPhase,
  now: number,
  durations: FocusDurations,
): FocusTimerState {
  const total = phaseMs(phase, durations);
  return { ...state, phase, endsAt: now + total, left: null, total };
}

export function pause(state: FocusTimerState, now: number): FocusTimerState {
  if (state.endsAt === null) return state;
  return { ...state, endsAt: null, left: Math.max(0, state.endsAt - now) };
}

export function resume(state: FocusTimerState, now: number): FocusTimerState {
  if (state.left === null) return state;
  return { ...state, endsAt: now + state.left, left: null };
}

/** Stop and go back to a fresh focus phase (the day's focus time stays). */
export function reset(state: FocusTimerState): FocusTimerState {
  return { ...IDLE_FOCUS_TIMER, log: state.log };
}

/**
 * The phase after `phase`: a break after focus (long once `cycle` reaches
 * `longEvery`), focus after a break. `cycle` counts finished focus sessions
 * and starts over after a long break.
 */
function advance(
  state: FocusTimerState,
  at: number,
  durations: FocusDurations,
): FocusTimerState {
  let phase: FocusPhase;
  let cycle = state.cycle;
  if (state.phase === 'focus') {
    cycle += 1;
    phase = cycle >= durations.longEvery ? 'long' : 'short';
  } else {
    if (state.phase === 'long') cycle = 0;
    phase = 'focus';
  }
  const idle: FocusTimerState = {
    ...state,
    phase,
    cycle,
    endsAt: null,
    left: null,
    total: 0,
  };
  return phase !== 'focus' && durations.autoBreak
    ? start(idle, phase, at, durations)
    : idle;
}

/**
 * End the current phase now and move to the next one. Focus time already
 * spent counts toward the day; a skipped focus session still counts toward
 * the long-break cycle.
 */
export function skip(
  state: FocusTimerState,
  now: number,
  durations: FocusDurations,
): FocusTimerState {
  const status = focusStatus(state);
  const spent =
    state.phase === 'focus' && status !== 'idle'
      ? state.total - remaining(state, now, durations)
      : 0;
  return advance({ ...state, log: credit(state.log, spent, now) }, now, durations);
}

/**
 * Apply every phase end up to `now`: a finished focus phase credits its full
 * length on the day it ended. Returns the phases that ended, oldest first
 * (empty when nothing changed, and then `state` is returned as is).
 */
export function tick(
  state: FocusTimerState,
  now: number,
  durations: FocusDurations,
): { state: FocusTimerState; ended: FocusPhase[] } {
  const ended: FocusPhase[] = [];
  let next = state;
  while (next.endsAt !== null && next.endsAt <= now) {
    const at = next.endsAt;
    ended.push(next.phase);
    if (next.phase === 'focus')
      next = { ...next, log: credit(next.log, next.total, at) };
    next = advance(next, at, durations);
  }
  return { state: next, ended };
}

/** A stored timer, or null when it is not a valid one. */
export function parseFocusTimer(value: unknown): FocusTimerState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const num = (field: unknown) =>
    typeof field === 'number' && Number.isFinite(field) ? field : null;
  if (raw.phase !== 'focus' && raw.phase !== 'short' && raw.phase !== 'long')
    return null;
  const log: Record<string, number> = {};
  if (raw.log && typeof raw.log === 'object')
    for (const [day, ms] of Object.entries(raw.log))
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && num(ms) !== null && Number(ms) > 0)
        log[day] = Number(ms);
  const endsAt = num(raw.endsAt);
  const left = endsAt === null ? num(raw.left) : null;
  return {
    phase: raw.phase,
    endsAt,
    left: left === null ? null : Math.max(0, left),
    total: Math.max(0, num(raw.total) ?? 0),
    cycle: Math.max(0, Math.floor(num(raw.cycle) ?? 0)),
    log,
  };
}
