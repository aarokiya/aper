import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'group/badge inline-flex min-h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-px text-xs leading-tight font-normal whitespace-nowrap transition-colors has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-bad [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'border-ink text-ink [a]:hover:bg-wash',
        secondary: 'bg-wash text-ink-2 [a]:hover:text-ink',
        destructive: 'border-bad/50 text-bad [a]:hover:border-bad',
        outline: 'border-rule-2 text-ink-2 [a]:hover:border-ink [a]:hover:text-ink',
        ghost: 'px-0 text-ink-3 [a]:hover:text-ink',
        link: 'px-0 text-ink-3 underline-offset-[3px] hover:text-ink hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge, badgeVariants };
