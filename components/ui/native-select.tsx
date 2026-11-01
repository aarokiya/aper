import * as React from 'react';

import { cn } from '@/lib/utils';
import { ChevronDownIcon } from 'lucide-react';

type NativeSelectProps = Omit<React.ComponentProps<'select'>, 'size'> & {
  size?: 'sm' | 'default';
};

function NativeSelect({
  className,
  size = 'default',
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(
        'group/native-select relative w-fit has-[select:disabled]:opacity-50',
        className,
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className="h-9 w-full min-w-0 appearance-none rounded-md border border-rule-2 bg-transparent py-1.5 pr-8 pl-3 text-sm text-ink transition-colors outline-none select-none hover:border-ink-4 focus-visible:border-ink focus-visible:outline-none aria-invalid:border-bad disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-8 data-[size=sm]:py-1 data-[size=sm]:text-[0.8125rem]"
        {...props}
      />
      <ChevronDownIcon
        className="text-ink-3 top-1/2 right-2.5 size-3.5 -translate-y-1/2 pointer-events-none absolute select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<'option'>) {
  return (
    <option
      data-slot="native-select-option"
      className={cn('bg-paper text-ink', className)}
      {...props}
    />
  );
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<'optgroup'>) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn('bg-paper text-ink', className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
