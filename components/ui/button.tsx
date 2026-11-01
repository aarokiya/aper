import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Study Hub pill buttons. `default` is the accent-filled `.pill-primary`,
 * `outline` the hairline `.pill`, `ghost` a borderless pill, and `link` the
 * quiet muted `.textlink`. Sizes keep the shadcn names so callers don't change.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding font-sans text-[0.8125rem] leading-tight font-normal whitespace-nowrap transition-[border-color,background-color,color,opacity] duration-150 select-none disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-bad [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          'border-accent-ink bg-accent-ink text-accent-ink-fg hover:opacity-85',
        outline:
          'border-rule-2 bg-transparent text-ink hover:border-ink aria-expanded:border-ink',
        secondary:
          'border-transparent bg-wash text-ink hover:border-rule-2 aria-expanded:border-rule-2',
        ghost:
          'text-ink-2 hover:bg-wash hover:text-ink aria-expanded:bg-wash aria-expanded:text-ink',
        destructive:
          'border-rule-2 bg-transparent text-bad hover:border-bad aria-expanded:border-bad',
        link: 'rounded-sm px-0! text-ink-3 underline-offset-[3px] hover:text-ink hover:underline',
      },
      size: {
        default:
          'min-h-[1.875rem] gap-1.5 px-3.5 py-[0.3125rem] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: "min-h-6 gap-1 px-2.5 py-0.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-7 gap-1 px-3 py-1 text-[0.8125rem] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'min-h-9 gap-2 px-[1.125rem] py-1.5 text-sm has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5',
        icon: 'size-8',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
