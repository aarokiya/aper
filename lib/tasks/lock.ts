import { APP_TIME_ZONE } from '@/lib/time-zone';

const stripTags = (value: string) =>
  value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function formatLockDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  }).format(date);
}

/**
 * Canvas hides the contents of an assignment it has locked. It tells us both a
 * flag and its own sentence ("This assignment is locked until Sep 7 at 12am."),
 * which is more accurate than anything derived from unlock_at alone — a lock
 * can also come from a module prerequisite with no date at all.
 */
export function lockNote(
  locked: unknown,
  lockExplanation: unknown,
  unlockAt: string | null | undefined,
) {
  if (!locked) return null;
  const explanation =
    typeof lockExplanation === 'string' ? stripTags(lockExplanation) : '';
  if (explanation) return explanation;
  if (unlockAt) return `Locked until ${formatLockDate(unlockAt)}.`;
  return 'Locked by Canvas.';
}
