'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@/lib/utils';

function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: 'sm' | 'default';
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink focus-visible:outline-solid aria-invalid:border-bad data-[size=default]:h-[18px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] data-checked:bg-accent-ink data-unchecked:border-rule-2 data-unchecked:bg-wash data-disabled:cursor-not-allowed data-disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.18)] ring-0 transition-transform duration-150 group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-2.5 data-checked:bg-accent-ink-fg data-unchecked:bg-ink-3 group-data-[size=default]/switch:data-checked:translate-x-[15px] group-data-[size=sm]/switch:data-checked:translate-x-[11px] group-data-[size=default]/switch:data-unchecked:translate-x-[1px] group-data-[size=sm]/switch:data-unchecked:translate-x-[1px]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
