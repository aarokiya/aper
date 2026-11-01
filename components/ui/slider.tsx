import { Slider as SliderPrimitive } from '@base-ui/react/slider';

import { cn } from '@/lib/utils';

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max];

  return (
    <SliderPrimitive.Root
      className={cn('data-horizontal:w-full data-vertical:h-full', className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="data-vertical:min-h-40 relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="bg-rule-2 rounded-full data-horizontal:h-0.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-0.5 relative grow overflow-hidden select-none"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-accent-ink select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="relative block size-3.5 shrink-0 cursor-grab rounded-full border border-accent-ink bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.12)] transition-[transform,box-shadow] duration-150 select-none after:absolute after:-inset-2 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink focus-visible:outline-solid active:cursor-grabbing disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
