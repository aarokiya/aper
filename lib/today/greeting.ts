/** Time-of-day words and clock formatting shared by Today and the screensaver. */

export type PartOfDay = 'morning' | 'afternoon' | 'evening';

export function partOfDay(hour: number): PartOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/** "Good afternoon" or "Good afternoon, Sam". */
export function greetingText(hour: number, name: string) {
  const trimmed = name.trim();
  return `Good ${partOfDay(hour)}${trimmed ? `, ${trimmed}` : ''}`;
}

export type ClockMode = '12h' | '24h';

export type ClockParts = {
  time: string;
  seconds: string | null;
  period: string | null;
};

export function clockParts(
  date: Date,
  mode: ClockMode,
  withSeconds: boolean,
): ClockParts {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = withSeconds
    ? String(date.getSeconds()).padStart(2, '0')
    : null;
  if (mode === '24h')
    return {
      time: `${String(hours).padStart(2, '0')}:${minutes}`,
      seconds,
      period: null,
    };
  return {
    time: `${hours % 12 || 12}:${minutes}`,
    seconds,
    period: hours < 12 ? 'AM' : 'PM',
  };
}

/** "Thursday, October 1" */
export const longDate = (date: Date) =>
  date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
