import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-rule-2 bg-transparent px-3 py-1.5 text-sm text-ink transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-4 hover:border-ink-4 focus-visible:border-ink focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-bad',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
