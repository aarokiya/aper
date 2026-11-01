'use client';

import './ambient.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppearance } from '@/components/appearance/appearance-provider';
import { greetingText, longDate } from '@/lib/today/greeting';
import type { NextUp } from '@/lib/today/next';
import { setScreensaverActive } from './ambient-store';
import { Backdrop, useBackdrop } from './backdrop';
import { Clock, useNow } from './clock';
import { useReducedMotion } from './use-reduced-motion';

export const SCREENSAVER_EVENT = 'aper:screensaver';

/** Shown next to every control that starts the screensaver. */
export const SCREENSAVER_SHORTCUT = { keys: '⌥Z', label: 'Option+Z' };

/** Start the screensaver now. Call from a click or key handler: it asks for fullscreen. */
export function startScreensaver() {
  window.dispatchEvent(
    new CustomEvent(SCREENSAVER_EVENT, { detail: { manual: true } }),
  );
}

/** Input this soon after starting is the gesture that started it, not a dismissal. */
const GRACE_MS = 800;
/** Pointer travel (px) that counts as "someone's here" rather than a nudge. */
const JITTER_PX = 24;
const FADE_OUT_MS = 450;

type Phase = 'off' | 'on' | 'leaving';

function dueLabel(due: Date, now: Date) {
  const time = due.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((dueDay.getTime() - today.getTime()) / 864e5);
  if (days <= 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days < 7)
    return `${due.toLocaleDateString('en-US', { weekday: 'long' })} at ${time}`;
  return `${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`;
}

function ScreensaverFace({ showNext }: { showNext: boolean }) {
  const { appearance } = useAppearance();
  const { clock, seconds, name } = appearance.greeting;
  const now = useNow(seconds && clock !== 'off' ? 'second' : 'minute');
  const reducedMotion = useReducedMotion();
  const [next, setNext] = useState<NextUp | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!showNext) return;
    const controller = new AbortController();
    const load = () =>
      fetch('/api/today/next', { signal: controller.signal })
        .then((response) =>
          response.ok ? (response.json() as Promise<NextUp>) : null,
        )
        .then((value) => value && setNext(value))
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 5 * 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [showNext]);

  // Wander slowly so nothing sits on the same pixels for long.
  useEffect(() => {
    const move = () =>
      setOffset({ x: Math.random() * 10, y: -Math.random() * 14 });
    const first = window.setTimeout(move, 400);
    const timer = window.setInterval(move, reducedMotion ? 60_000 : 40_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [reducedMotion]);

  const deadline = showNext && next?.deadline && now ? next.deadline : null;
  const exam = showNext ? next?.exam : null;

  return (
    <div
      className="screensaver-face"
      style={{ transform: `translate3d(${offset.x}vw, ${offset.y}vh, 0)` }}
    >
      <p className="screensaver-date">{now ? longDate(now) : '\u00a0'}</p>
      {clock !== 'off' && (
        <Clock
          now={now}
          mode={clock}
          seconds={seconds}
          className="screensaver-clock"
        />
      )}
      <p className="screensaver-greeting display">
        {greetingText((now ?? new Date()).getHours(), name)}
      </p>
      {(deadline || exam) && (
        <dl className="screensaver-next">
          {deadline && now && (
            <div>
              <dt>Next due</dt>
              <dd>
                <span className="screensaver-next-title">{deadline.title}</span>
                <span className="screensaver-next-meta">
                  {deadline.course}, {dueLabel(new Date(deadline.dueAt), now)}
                </span>
              </dd>
            </div>
          )}
          {exam && (
            <div>
              <dt>Next exam</dt>
              <dd>
                <span className="screensaver-next-title">
                  {exam.code} {exam.title}
                </span>
                <span className="screensaver-next-meta">
                  {exam.days === 0
                    ? 'Today'
                    : exam.days === 1
                      ? 'Tomorrow'
                      : `In ${exam.days} days`}
                  , {exam.when}
                </span>
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/**
 * Full-screen ambient clock over the Today background. Starts after the
 * configured idle time (page visible, enabled), from startScreensaver(), or
 * with Option+Z; any key, click, touch, scroll, or deliberate pointer move
 * ends it. Mounted once by the app shell.
 */
export function Screensaver() {
  const { appearance, customizer } = useAppearance();
  const settings = appearance.screensaver;
  const model = useBackdrop();
  const [phase, setPhase] = useState<Phase>('off');
  const phaseRef = useRef<Phase>('off');
  const lastInput = useRef(0);
  const startedAt = useRef(0);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const ownsFullscreen = useRef(false);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const overlay = useRef<HTMLDivElement>(null);

  const go = (value: Phase) => {
    phaseRef.current = value;
    setPhase(value);
  };

  const start = useCallback((manual: boolean) => {
    if (phaseRef.current === 'on') return;
    if (manual && document.fullscreenEnabled && !document.fullscreenElement) {
      document.documentElement
        .requestFullscreen({ navigationUI: 'hide' })
        .then(() => {
          ownsFullscreen.current = true;
        })
        .catch(() => undefined);
    }
    restoreFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    startedAt.current = performance.now();
    origin.current = null;
    go('on');
    setScreensaverActive(true);
  }, []);

  const stop = useCallback(() => {
    if (phaseRef.current !== 'on') return;
    lastInput.current = Date.now();
    go('leaving');
    if (ownsFullscreen.current && document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
    ownsFullscreen.current = false;
    window.setTimeout(() => {
      if (phaseRef.current !== 'leaving') return;
      go('off');
      setScreensaverActive(false);
      restoreFocus.current?.focus({ preventScroll: true });
    }, FADE_OUT_MS);
  }, []);

  // Manual starts: the window event and the keyboard shortcut.
  useEffect(() => {
    const onStart = (event: Event) =>
      start(
        (event as CustomEvent<{ manual?: boolean }>).detail?.manual ?? true,
      );
    const onKey = (event: KeyboardEvent) => {
      if (
        !event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.code !== 'KeyZ'
      )
        return;
      event.preventDefault();
      if (phaseRef.current === 'off') start(true);
    };
    window.addEventListener(SCREENSAVER_EVENT, onStart);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(SCREENSAVER_EVENT, onStart);
      window.removeEventListener('keydown', onKey);
    };
  }, [start]);

  // Idle detection.
  useEffect(() => {
    lastInput.current = Date.now();
    const mark = () => {
      if (phaseRef.current === 'off') lastInput.current = Date.now();
    };
    const events = [
      'pointermove',
      'pointerdown',
      'keydown',
      'wheel',
      'touchstart',
      'scroll',
    ] as const;
    for (const name of events)
      window.addEventListener(name, mark, { passive: true, capture: true });
    document.addEventListener('visibilitychange', mark);
    const timer = window.setInterval(() => {
      if (!settings.enabled || phaseRef.current !== 'off' || customizer.open)
        return;
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastInput.current >= settings.idleMinutes * 60_000)
        start(false);
    }, 5_000);
    return () => {
      for (const name of events)
        window.removeEventListener(name, mark, { capture: true });
      document.removeEventListener('visibilitychange', mark);
      window.clearInterval(timer);
    };
  }, [settings.enabled, settings.idleMinutes, customizer.open, start]);

  // Dismissal while showing.
  useEffect(() => {
    if (phase !== 'on') return;
    overlay.current?.focus({ preventScroll: true });
    const settled = () => performance.now() - startedAt.current > GRACE_MS;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.code === 'KeyZ') event.preventDefault();
      if (!settled()) return;
      if (event.key !== 'Escape') event.preventDefault();
      stop();
    };
    const onPress = (event: Event) => {
      event.preventDefault();
      if (settled()) stop();
    };
    const onMove = (event: PointerEvent) => {
      if (!settled()) return;
      if (!origin.current) {
        origin.current = { x: event.clientX, y: event.clientY };
        return;
      }
      if (
        Math.hypot(
          event.clientX - origin.current.x,
          event.clientY - origin.current.y,
        ) > JITTER_PX
      )
        stop();
    };
    const onFullscreen = () => {
      if (ownsFullscreen.current && !document.fullscreenElement) {
        ownsFullscreen.current = false;
        stop();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('pointerdown', onPress, { capture: true });
    window.addEventListener('touchstart', onPress, {
      capture: true,
      passive: false,
    });
    window.addEventListener('wheel', onPress, {
      capture: true,
      passive: false,
    });
    window.addEventListener('pointermove', onMove, { capture: true });
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('pointerdown', onPress, { capture: true });
      window.removeEventListener('touchstart', onPress, { capture: true });
      window.removeEventListener('wheel', onPress, { capture: true });
      window.removeEventListener('pointermove', onMove, { capture: true });
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [phase, stop]);

  useEffect(() => () => setScreensaverActive(false), []);

  if (phase === 'off') return null;

  const dim = model.kind === 'photo' ? Math.max(model.dim, 0.3) : model.dim;
  const tone =
    model.kind === 'photo'
      ? dim >= 0.45
        ? 'dark'
        : (model.photo?.tone ?? 'dark')
      : 'theme';
  return (
    <div
      ref={overlay}
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- full-screen overlay with its own fade phases; <dialog> would hide instantly on close
      role="dialog"
      aria-modal="true"
      aria-label="Screensaver. Press any key to return."
      tabIndex={-1}
      className="screensaver dark"
      data-phase={phase}
      data-tone={tone}
    >
      <Backdrop model={{ ...model, dim }} dark slow />
      <div className="screensaver-scrim" aria-hidden="true" />
      <ScreensaverFace showNext={settings.showNext} />
    </div>
  );
}
