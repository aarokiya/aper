import { describe, expect, it } from 'vitest';
import {
  focusDay,
  focusMinutes,
  focusStatus,
  formatClock,
  IDLE_FOCUS_TIMER,
  parseFocusTimer,
  pause,
  remaining,
  reset,
  resume,
  skip,
  start,
  tick,
  type FocusDurations,
} from '@/lib/study/focus-timer';

const MIN = 60_000;
// Local wall time, so day boundaries hold in any test time zone.
const T0 = new Date(2026, 9, 2, 9, 0).getTime();
const DAY = focusDay(T0);
const D: FocusDurations = {
  focus: 25,
  short: 5,
  long: 15,
  longEvery: 2,
  autoBreak: false,
};

describe('focus timer', () => {
  it('starts idle and shows the full focus length', () => {
    expect(focusStatus(IDLE_FOCUS_TIMER)).toBe('idle');
    expect(remaining(IDLE_FOCUS_TIMER, T0, D)).toBe(25 * MIN);
    expect(formatClock(remaining(IDLE_FOCUS_TIMER, T0, D))).toBe('25:00');
  });

  it('counts down, pauses, and resumes', () => {
    const running = start(IDLE_FOCUS_TIMER, 'focus', T0, D);
    expect(focusStatus(running)).toBe('running');
    expect(remaining(running, T0 + 10 * MIN, D)).toBe(15 * MIN);
    const paused = pause(running, T0 + 10 * MIN);
    expect(focusStatus(paused)).toBe('paused');
    expect(remaining(paused, T0 + 60 * MIN, D)).toBe(15 * MIN);
    const resumed = resume(paused, T0 + 60 * MIN);
    expect(remaining(resumed, T0 + 70 * MIN, D)).toBe(5 * MIN);
    expect(pause(paused, T0)).toBe(paused);
    expect(resume(running, T0)).toBe(running);
  });

  it('formats partial seconds up and long phases past an hour', () => {
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(90 * MIN)).toBe('90:00');
  });

  it('ends a focus phase into an idle short break and credits the day', () => {
    const running = start(IDLE_FOCUS_TIMER, 'focus', T0, D);
    expect(tick(running, T0 + 24 * MIN, D)).toEqual({
      state: running,
      ended: [],
    });
    const { state, ended } = tick(running, T0 + 26 * MIN, D);
    expect(ended).toEqual(['focus']);
    expect(state.phase).toBe('short');
    expect(focusStatus(state)).toBe('idle');
    expect(state.cycle).toBe(1);
    expect(focusMinutes(state, DAY)).toBe(25);
  });

  it('takes a long break every longEvery focus sessions, then restarts the cycle', () => {
    let state = start(IDLE_FOCUS_TIMER, 'focus', T0, D);
    state = tick(state, T0 + 25 * MIN, D).state;
    expect(state.phase).toBe('short');
    state = start(state, 'short', T0 + 25 * MIN, D);
    state = tick(state, T0 + 30 * MIN, D).state;
    expect(state.phase).toBe('focus');
    state = start(state, 'focus', T0 + 30 * MIN, D);
    state = tick(state, T0 + 55 * MIN, D).state;
    expect(state.phase).toBe('long');
    expect(state.cycle).toBe(2);
    state = start(state, 'long', T0 + 55 * MIN, D);
    state = tick(state, T0 + 70 * MIN, D).state;
    expect(state.phase).toBe('focus');
    expect(state.cycle).toBe(0);
    expect(focusMinutes(state, DAY)).toBe(50);
  });

  it('auto-starts breaks and catches up on several phase ends at once', () => {
    const auto = { ...D, autoBreak: true };
    const running = start(IDLE_FOCUS_TIMER, 'focus', T0, auto);
    // Away for an hour: focus ended at +25, the break ran +25..+30.
    const { state, ended } = tick(running, T0 + 60 * MIN, auto);
    expect(ended).toEqual(['focus', 'short']);
    expect(state.phase).toBe('focus');
    expect(focusStatus(state)).toBe('idle');
    expect(focusMinutes(state, DAY)).toBe(25);

    const mid = tick(running, T0 + 27 * MIN, auto).state;
    expect(mid.phase).toBe('short');
    expect(focusStatus(mid)).toBe('running');
    expect(remaining(mid, T0 + 27 * MIN, auto)).toBe(3 * MIN);
  });

  it('skips: credits focus time spent and moves on', () => {
    const running = start(IDLE_FOCUS_TIMER, 'focus', T0, D);
    const skipped = skip(running, T0 + 10 * MIN, D);
    expect(skipped.phase).toBe('short');
    expect(focusStatus(skipped)).toBe('idle');
    expect(focusMinutes(skipped, DAY)).toBe(10);
    const backToFocus = skip(skipped, T0 + 11 * MIN, D);
    expect(backToFocus.phase).toBe('focus');
    expect(focusMinutes(backToFocus, DAY)).toBe(10);
  });

  it('reset keeps the day log only', () => {
    const done = tick(start(IDLE_FOCUS_TIMER, 'focus', T0, D), T0 + 25 * MIN, D)
      .state;
    const cleared = reset(start(done, 'short', T0 + 25 * MIN, D));
    expect(focusStatus(cleared)).toBe('idle');
    expect(cleared.phase).toBe('focus');
    expect(cleared.cycle).toBe(0);
    expect(focusMinutes(cleared, DAY)).toBe(25);
  });

  it('credits focus to the local day the phase ended on', () => {
    const late = new Date(2026, 9, 2, 23, 50).getTime();
    const { state } = tick(
      start(IDLE_FOCUS_TIMER, 'focus', late, D),
      late + 30 * MIN,
      D,
    );
    expect(focusMinutes(state, focusDay(late))).toBe(0);
    expect(focusMinutes(state, focusDay(late + 25 * MIN))).toBe(25);
  });

  it('parses stored state and rejects junk', () => {
    const running = start(IDLE_FOCUS_TIMER, 'short', T0, D);
    expect(parseFocusTimer(JSON.parse(JSON.stringify(running)))).toEqual(
      running,
    );
    expect(parseFocusTimer(null)).toBeNull();
    expect(parseFocusTimer({ phase: 'nap' })).toBeNull();
    expect(
      parseFocusTimer({ phase: 'focus', log: { bad: 5, '2026-10-02': -1 } }),
    ).toEqual(IDLE_FOCUS_TIMER);
  });
});
