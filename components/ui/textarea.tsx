import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-rule-2 bg-transparent px-3 py-2 text-sm leading-relaxed text-ink transition-colors outline-none placeholder:text-ink-4 hover:border-ink-4 focus-visible:border-ink focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-bad',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
