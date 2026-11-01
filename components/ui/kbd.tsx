import { cn } from '@/lib/utils';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "border border-rule-2 text-ink-3 in-data-[slot=tooltip-content]:border-paper/30 in-data-[slot=tooltip-content]:text-paper h-[1.125rem] w-fit min-w-[1.125rem] gap-0.5 rounded-[4px] px-1 font-sans text-[0.6875rem] leading-none [&_svg:not([class*='size-'])]:size-3 pointer-events-none inline-flex items-center justify-center select-none",
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn('gap-1 inline-flex items-center', className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
