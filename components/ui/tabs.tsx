'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

function Tabs({
  className,
  orientation = 'horizontal',
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        'group/tabs flex gap-6 data-horizontal:flex-col',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Study Hub tabs: muted sentence-case labels on a hairline with a 1.5px ink
 * underline under the active tab. `line` and `default` render the same; the
 * variant prop stays for API compatibility.
 */
const tabsListVariants = cva(
  'group/tabs-list flex max-w-full items-end gap-6 overflow-x-auto text-ink-3 group-data-horizontal/tabs:border-b group-data-horizontal/tabs:border-rule group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:items-stretch group-data-vertical/tabs:gap-0.5 group-data-vertical/tabs:border-l group-data-vertical/tabs:border-rule',
  {
    variants: {
      variant: {
        default: '',
        line: '',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function TabsList({
  className,
  variant = 'default',
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-baseline gap-1.5 border-transparent pt-2 pb-2.5 text-sm whitespace-nowrap text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 data-active:text-ink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        'group-data-horizontal/tabs:-mb-px group-data-horizontal/tabs:border-b-[1.5px] group-data-horizontal/tabs:data-active:border-ink',
        'group-data-vertical/tabs:-ml-px group-data-vertical/tabs:border-l-[1.5px] group-data-vertical/tabs:py-1.5 group-data-vertical/tabs:pl-3 group-data-vertical/tabs:data-active:border-ink',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
