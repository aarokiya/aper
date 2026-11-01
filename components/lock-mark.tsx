import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Lock glyph shown beside any assignment Canvas keeps closed. */
export function LockMark({
  note,
  className,
}: {
  note: string | null;
  className?: string;
}) {
  if (!note) return null;
  return (
    <span title={note} className="inline-flex shrink-0">
      <span className="sr-only">{note}</span>
      <Lock aria-hidden="true" className={cn('size-3 text-ink-4', className)} />
    </span>
  );
}
