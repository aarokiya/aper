'use client';

import { useEffect, useState } from 'react';
import { clockParts, type ClockMode } from '@/lib/today/greeting';
import { cn } from '@/lib/utils';

/**
 * The current time, ticking on whole seconds or minutes. Null until mounted
 * so server and first client render agree.
 */
export function useNow(unit: 'second' | 'minute') {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const date = new Date();
      setNow(date);
      const elapsed =
        unit === 'second'
          ? date.getMilliseconds()
          : date.getSeconds() * 1000 + date.getMilliseconds();
      timer = window.setTimeout(
        tick,
        (unit === 'second' ? 1000 : 60_000) - elapsed + 8,
      );
    };
    tick();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(timer);
      tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [unit]);
  return now;
}

/**
 * Serif tabular clock. Before mount it renders an invisible placeholder of
 * the same shape so nothing shifts when the time appears.
 */
export function Clock({
  now,
  mode,
  seconds,
  className,
}: {
  now: Date | null;
  mode: ClockMode;
  seconds: boolean;
  className?: string;
}) {
  const parts = clockParts(
    now ?? new Date(2026, 0, 1, 10, 0, 0),
    mode,
    seconds,
  );
  return (
    <time
      dateTime={now ? now.toISOString() : undefined}
      className={cn('ambient-clock numeral', !now && 'invisible', className)}
    >
      <span>{parts.time}</span>
      {parts.seconds && (
        <span className="ambient-clock-seconds">:{parts.seconds}</span>
      )}
      {parts.period && (
        <span className="ambient-clock-period">{parts.period}</span>
      )}
    </time>
  );
}
