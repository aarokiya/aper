'use client';

import { useAppearance } from '@/components/appearance/appearance-provider';
import { useScreensaverActive } from '@/components/ambient/ambient-store';
import { Backdrop, useBackdrop } from '@/components/ambient/backdrop';
import { Clock, useNow } from '@/components/ambient/clock';
import {
  SCREENSAVER_SHORTCUT,
  startScreensaver,
} from '@/components/ambient/screensaver';
import { d8 } from '@/lib/study/model';
import { greetingText, longDate } from '@/lib/today/greeting';

/**
 * Today's opening: the chosen photo or scene, the date, a live clock, the
 * greeting, and one sentence about the day. Server render uses the server's
 * date and hour; the client takes over with a ticking clock after mount.
 */
export function TodayHero({
  today,
  hour,
  summary,
}: {
  today: string;
  hour: number;
  summary: string;
}) {
  const { appearance, resolvedTheme, openCustomizer } = useAppearance();
  const { greeting, background } = appearance;
  const model = useBackdrop();
  const covered = useScreensaverActive();
  const now = useNow(
    greeting.clock !== 'off' && greeting.seconds ? 'second' : 'minute',
  );

  return (
    <section
      aria-labelledby="today-greeting"
      className="today-hero"
      data-tone={model.tone}
      style={{ '--hero-h': `${background.height}vh` } as React.CSSProperties}
    >
      <Backdrop
        model={model}
        dark={resolvedTheme === 'dark'}
        paused={covered}
      />
      <div className="today-hero-scrim" aria-hidden="true" />
      <div className="today-hero-inner">
        <div className="today-hero-top">
          <p className="today-dateline">{longDate(now ?? d8(today))}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="hero-pill"
              onClick={() => openCustomizer('background')}
            >
              Customize
            </button>
            <button
              type="button"
              className="hero-pill"
              onClick={startScreensaver}
              aria-keyshortcuts="Alt+Z"
              title={`Start the screensaver (${SCREENSAVER_SHORTCUT.label})`}
            >
              Screensaver
              <kbd className="max-sm:hidden" aria-hidden="true">
                {SCREENSAVER_SHORTCUT.keys}
              </kbd>
            </button>
          </div>
        </div>
        <div className="today-hero-copy">
          {greeting.clock !== 'off' && (
            <Clock
              now={now}
              mode={greeting.clock}
              seconds={greeting.seconds}
              className="today-hero-clock"
            />
          )}
          <h1 id="today-greeting" className="today-greeting">
            {greetingText(now ? now.getHours() : hour, greeting.name)}
          </h1>
          <p className="today-summary">{summary}</p>
          {greeting.message.trim() && (
            <p className="today-message">{greeting.message}</p>
          )}
        </div>
      </div>
    </section>
  );
}
