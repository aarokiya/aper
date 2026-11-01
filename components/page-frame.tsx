import { cn } from '@/lib/utils';

/**
 * Standard page body: a muted dateline-style eyebrow, a serif title, optional
 * actions, and left-aligned content like the Study Hub. The rail and command
 * palette live in the root layout's AppShell.
 */
export function PageFrame({
  title,
  eyebrow,
  actions,
  width = 'wide',
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  /** `reading` caps content at the Study Hub's 780px measure */
  width?: 'wide' | 'reading';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'px-5 pt-7 pb-24 sm:px-10 lg:px-14 lg:pt-9',
        width === 'reading' ? 'max-w-[892px]' : 'max-w-[1292px]',
      )}
    >
      <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {eyebrow && <p className="text-[13px] text-ink-3">{eyebrow}</p>}
          <h1 className="display mt-1 text-[32px] sm:text-[40px]">{title}</h1>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
