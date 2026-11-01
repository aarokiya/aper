'use client';

import './customizer.css';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  SCREENSAVER_SHORTCUT,
  startScreensaver,
} from '@/components/ambient/screensaver';
import { ACCENT_PRESETS } from '@/lib/appearance/catalog';
import {
  DEFAULT_APPEARANCE,
  TODAY_SECTIONS,
  type Appearance,
  type TodaySectionId,
} from '@/lib/appearance/schema';
import { cn } from '@/lib/utils';
import { useAppearance, type CustomizerSection } from './appearance-provider';
import { BackgroundPanel } from './background-panel';
import { Group, Segmented, Toggle } from './controls';
import { TypePanel } from './type-panel';

const SECTIONS: ReadonlyArray<{ id: CustomizerSection; label: string }> = [
  { id: 'background', label: 'Background' },
  { id: 'type', label: 'Type' },
  { id: 'color', label: 'Color' },
  { id: 'greeting', label: 'Greeting' },
  { id: 'layout', label: 'Today' },
  { id: 'screensaver', label: 'Screensaver' },
];

/** What "Reset" restores for each section; uploaded photos stay in the slideshow list. */
const RESET: Record<CustomizerSection, (current: Appearance) => Appearance> = {
  background: (current) => ({
    ...current,
    background: {
      ...DEFAULT_APPEARANCE.background,
      photos: current.background.photos,
    },
  }),
  type: (current) => ({
    ...current,
    fonts: DEFAULT_APPEARANCE.fonts,
    textScale: DEFAULT_APPEARANCE.textScale,
  }),
  color: (current) => ({
    ...current,
    theme: DEFAULT_APPEARANCE.theme,
    accent: DEFAULT_APPEARANCE.accent,
    customAccent: DEFAULT_APPEARANCE.customAccent,
  }),
  greeting: (current) => ({
    ...current,
    greeting: DEFAULT_APPEARANCE.greeting,
  }),
  layout: (current) => ({ ...current, today: DEFAULT_APPEARANCE.today }),
  screensaver: (current) => ({
    ...current,
    screensaver: DEFAULT_APPEARANCE.screensaver,
  }),
};

const RESET_LABEL: Record<CustomizerSection, string> = {
  background: 'Reset background',
  type: 'Reset type',
  color: 'Reset colors',
  greeting: 'Reset greeting',
  layout: 'Reset sections',
  screensaver: 'Reset screensaver',
};

const SAVE_LABEL: Record<'idle' | 'saving' | 'saved' | 'error', string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved. Check that _aper is still running.',
};

const IDLE_MINUTES = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120];

function ColorPanel() {
  const { appearance, update } = useAppearance();
  const [draft, setDraft] = useState(appearance.customAccent);
  const name = useId();
  const valid = /^#[0-9a-fA-F]{6}$/.test(draft);

  const setCustom = (value: string) => {
    setDraft(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value))
      update((current) => ({
        ...current,
        accent: 'custom',
        customAccent: value.toUpperCase(),
      }));
  };

  return (
    <div className="flex flex-col gap-8">
      <Segmented
        label="Theme"
        value={appearance.theme}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={(theme) => update((current) => ({ ...current, theme }))}
      />

      <fieldset>
        <legend className="mb-1 text-[13px] text-ink-2">Accent</legend>
        <p className="mb-3 text-[12.5px] text-ink-4">
          Used for primary buttons, focus rings, and selection. Each accent has
          a light and a dark shade.
        </p>
        <div className="swatch-grid">
          {ACCENT_PRESETS.map((accent) => (
            <label key={accent.id} className="swatch-option">
              <input
                type="radio"
                name={name}
                className="sr"
                checked={appearance.accent === accent.id}
                onChange={() =>
                  update((current) => ({ ...current, accent: accent.id }))
                }
              />
              <span
                className="swatch"
                aria-hidden="true"
                style={{
                  background: `linear-gradient(135deg, ${accent.light} 0 50%, ${accent.dark} 50% 100%)`,
                }}
              />
              <span className="text-[12px] text-ink-2">{accent.label}</span>
            </label>
          ))}
          <label className="swatch-option">
            <input
              type="radio"
              name={name}
              className="sr"
              checked={appearance.accent === 'custom'}
              onChange={() =>
                update((current) => ({ ...current, accent: 'custom' }))
              }
            />
            <span
              className="swatch"
              aria-hidden="true"
              style={{ background: appearance.customAccent }}
            />
            <span className="text-[12px] text-ink-2">Custom</span>
          </label>
        </div>
      </fieldset>

      <Group
        title="Custom color"
        hint="Pick any color; it's used in both light and dark themes."
      >
        <div className="flex items-center gap-3">
          <input
            type="color"
            className="color-well"
            aria-label="Custom accent color"
            value={valid ? draft : appearance.customAccent}
            onChange={(event) => setCustom(event.target.value)}
          />
          <input
            className="field w-32 font-mono uppercase"
            aria-label="Custom accent hex value"
            aria-invalid={!valid}
            value={draft}
            maxLength={7}
            spellCheck={false}
            onChange={(event) =>
              setCustom(
                event.target.value.startsWith('#')
                  ? event.target.value
                  : `#${event.target.value}`,
              )
            }
          />
          {!valid && (
            <span className="text-[12px] text-bad">
              Use six hex digits, like #2F55D4.
            </span>
          )}
        </div>
      </Group>

      <div
        className="flex flex-wrap items-center gap-3 border-t border-rule pt-5"
        aria-label="Accent preview"
      >
        <span className="pill pill-primary">Primary action</span>
        <span className="pill">Secondary</span>
        <span className="text-[13px] text-ink-3">
          Focus rings and selection follow the accent.
        </span>
      </div>
    </div>
  );
}

function GreetingPanel() {
  const { appearance, update } = useAppearance();
  const greeting = appearance.greeting;
  const set = (patch: Partial<Appearance['greeting']>) =>
    update((current) => ({
      ...current,
      greeting: { ...current.greeting, ...patch },
    }));
  return (
    <div className="flex flex-col gap-7">
      <label className="block">
        <span className="mb-1.5 block text-[13px] text-ink-2">Your name</span>
        <input
          className="field"
          value={greeting.name}
          maxLength={40}
          placeholder="Shown after Good afternoon"
          autoComplete="off"
          onChange={(event) => set({ name: event.target.value })}
        />
      </label>
      <div>
        <Segmented
          label="Clock"
          value={greeting.clock}
          options={[
            { value: 'off', label: 'Off' },
            { value: '12h', label: '12-hour' },
            { value: '24h', label: '24-hour' },
          ]}
          onChange={(clock) => set({ clock })}
        />
        <Toggle
          label="Show seconds"
          checked={greeting.seconds}
          disabled={greeting.clock === 'off'}
          onChange={(seconds) => set({ seconds })}
        />
      </div>
      <label className="block">
        <span className="mb-1.5 flex items-baseline justify-between text-[13px] text-ink-2">
          Message
          <span className="text-[12px] text-ink-4 tabular-nums">
            {greeting.message.length}/160
          </span>
        </span>
        <textarea
          className="field min-h-20 resize-y"
          value={greeting.message}
          maxLength={160}
          placeholder="A line under the greeting, like a goal for the semester"
          onChange={(event) => set({ message: event.target.value })}
        />
      </label>
    </div>
  );
}

function LayoutPanel() {
  const { appearance, update } = useAppearance();
  const { order, hidden } = appearance.today;
  const ids = [
    ...order,
    ...TODAY_SECTIONS.map((section) => section.id).filter(
      (id) => !order.includes(id),
    ),
  ];
  const label = (id: TodaySectionId) =>
    TODAY_SECTIONS.find((section) => section.id === id)?.label ?? id;

  const move = (id: TodaySectionId, by: -1 | 1) => {
    const from = ids.indexOf(id);
    const to = from + by;
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    update((current) => ({
      ...current,
      today: { ...current.today, order: next },
    }));
    const edge = to === 0 || to === ids.length - 1;
    requestAnimationFrame(() =>
      document
        .getElementById(
          `layout-${id}-${edge ? (by < 0 ? 'down' : 'up') : by < 0 ? 'up' : 'down'}`,
        )
        ?.focus(),
    );
  };

  return (
    <Group
      title="Sections on Today"
      hint="Show, hide, and reorder what appears below the greeting."
    >
      <ol className="rule-rows">
        {ids.map((id, index) => (
          <li key={id} className="flex items-center gap-3 py-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-[13.5px] text-ink">
              <input
                type="checkbox"
                className="accent-[var(--accent-ink)]"
                checked={!hidden.includes(id)}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    today: {
                      ...current.today,
                      hidden: event.target.checked
                        ? current.today.hidden.filter((value) => value !== id)
                        : [...current.today.hidden, id],
                    },
                  }))
                }
              />
              <span
                className={cn('truncate', hidden.includes(id) && 'text-ink-4')}
              >
                {label(id)}
              </span>
            </label>
            <button
              id={`layout-${id}-up`}
              type="button"
              className="icon-button"
              aria-label={`Move ${label(id)} up`}
              disabled={index === 0}
              onClick={() => move(id, -1)}
            >
              <ArrowUp className="size-3.5" aria-hidden="true" />
            </button>
            <button
              id={`layout-${id}-down`}
              type="button"
              className="icon-button"
              aria-label={`Move ${label(id)} down`}
              disabled={index === ids.length - 1}
              onClick={() => move(id, 1)}
            >
              <ArrowDown className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </Group>
  );
}

function ScreensaverPanel() {
  const { appearance, update, closeCustomizer } = useAppearance();
  const settings = appearance.screensaver;
  const set = (patch: Partial<Appearance['screensaver']>) =>
    update((current) => ({
      ...current,
      screensaver: { ...current.screensaver, ...patch },
    }));
  return (
    <div className="flex flex-col gap-7">
      <div>
        <Toggle
          label="Start when idle"
          description="Shows a full-screen clock over your Today background when you step away."
          checked={settings.enabled}
          onChange={(enabled) => set({ enabled })}
        />
        <label
          className={cn(
            'flex items-center justify-between gap-4 py-2 text-[13.5px] text-ink',
            !settings.enabled && 'opacity-50',
          )}
        >
          After
          <select
            className="field w-auto"
            value={settings.idleMinutes}
            disabled={!settings.enabled}
            onChange={(event) =>
              set({ idleMinutes: Number(event.target.value) })
            }
          >
            {(IDLE_MINUTES.includes(settings.idleMinutes)
              ? IDLE_MINUTES
              : [...IDLE_MINUTES, settings.idleMinutes].sort((a, b) => a - b)
            ).map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 1
                  ? '1 minute'
                  : minutes < 60 || minutes % 60
                    ? `${minutes} minutes`
                    : `${minutes / 60} hour${minutes === 60 ? '' : 's'}`}
              </option>
            ))}
          </select>
        </label>
        <Toggle
          label="Show what's next"
          description="The next deadline and exam, under the clock."
          checked={settings.showNext}
          onChange={(showNext) => set({ showNext })}
        />
      </div>
      <div className="border-t border-rule pt-5">
        <button
          type="button"
          className="pill pill-primary"
          onClick={() => {
            closeCustomizer();
            startScreensaver();
          }}
        >
          Preview now
        </button>
        <p className="mt-3 text-[12.5px] text-ink-3">
          Any key, click, or touch brings you back. Start it any time with{' '}
          <span className="kbd">{SCREENSAVER_SHORTCUT.keys}</span>.
        </p>
      </div>
    </div>
  );
}

const PANELS: Record<CustomizerSection, () => React.ReactNode> = {
  background: BackgroundPanel,
  type: TypePanel,
  color: ColorPanel,
  greeting: GreetingPanel,
  layout: LayoutPanel,
  screensaver: ScreensaverPanel,
};

/**
 * Appearance drawer (artifact tutor-drawer style). Every change applies to
 * the page immediately and is saved in the background. Mounted once by the
 * app shell; opened with useAppearance().openCustomizer(section).
 */
export function Customizer() {
  const { customizer, openCustomizer, closeCustomizer, update, saveState } =
    useAppearance();
  const { open, section } = customizer;
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const frame = requestAnimationFrame(() => {
        setShown(true);
        panel.current
          ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
          ?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), 220);
    if (
      returnFocus.current?.isConnected &&
      !document.querySelector('.screensaver')
    )
      returnFocus.current.focus({ preventScroll: true });
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        closeCustomizer();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = [
        ...panel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
        ),
      ].filter(
        (element) =>
          !(
            element instanceof HTMLInputElement &&
            element.type === 'radio' &&
            !element.checked
          ) &&
          (element.offsetParent !== null || element.matches('input.sr')),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!panel.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeCustomizer]);

  if (!mounted) return null;

  const Panel = PANELS[section];

  const onTabKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = SECTIONS.findIndex((item) => item.id === section);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % SECTIONS.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + SECTIONS.length) % SECTIONS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? SECTIONS.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    openCustomizer(SECTIONS[next].id);
    requestAnimationFrame(() =>
      document.getElementById(`customizer-tab-${SECTIONS[next].id}`)?.focus(),
    );
  };

  return (
    <>
      <div
        className="customizer-scrim"
        data-open={shown}
        aria-hidden="true"
        onClick={closeCustomizer}
      />
      <div
        ref={panel}
        // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- stays mounted so it can slide out; <dialog> would hide instantly
        role="dialog"
        aria-modal="true"
        aria-labelledby="customizer-title"
        className="customizer"
        data-open={shown}
      >
        <header className="customizer-head">
          <div className="min-w-0">
            <h2
              id="customizer-title"
              className="font-serif text-[19px] leading-tight font-medium"
            >
              Customize
            </h2>
            <p
              className="mt-0.5 min-h-[1.125rem] text-[12px] text-ink-4"
              aria-live="polite"
              aria-atomic="true"
            >
              {SAVE_LABEL[saveState] || 'Changes apply as you make them.'}
            </p>
          </div>
          <button
            type="button"
            className="pill pill-sm"
            onClick={closeCustomizer}
          >
            Close
          </button>
        </header>

        <div
          role="tablist"
          tabIndex={-1}
          aria-label="Appearance sections"
          className="customizer-tabs"
          onKeyDown={onTabKey}
        >
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              id={`customizer-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={item.id === section}
              aria-controls="customizer-panel"
              tabIndex={item.id === section ? 0 : -1}
              className="customizer-tab"
              onClick={() => openCustomizer(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div
          id="customizer-panel"
          role="tabpanel"
          aria-labelledby={`customizer-tab-${section}`}
          className="customizer-body"
          tabIndex={-1}
        >
          <Panel key={section} />
        </div>

        <footer className="customizer-foot">
          <button
            type="button"
            className="textlink"
            onClick={() => update(RESET[section])}
          >
            {RESET_LABEL[section]}
          </button>
          <button type="button" className="textlink" onClick={closeCustomizer}>
            Done
          </button>
        </footer>
      </div>
    </>
  );
}
