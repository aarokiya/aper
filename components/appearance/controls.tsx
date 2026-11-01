'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/** A titled group inside a customizer panel. */
export function Group({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 id={id} className="section-label">
          {title}
        </h3>
        {action}
      </div>
      {hint && <p className="-mt-1.5 mb-3 text-[12.5px] text-ink-4">{hint}</p>}
      {children}
    </section>
  );
}

/** Segmented control built on native radios (arrow keys move the choice). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className={hideLabel ? 'sr' : 'mb-2 text-[13px] text-ink-2'}>
        {label}
      </legend>
      <div className="segmented">
        {options.map((option) => (
          <label key={option.value} className="segmented-option">
            <input
              type="radio"
              className="sr"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** On/off switch (a native checkbox with the switch role). */
export function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 py-2',
        disabled && 'opacity-50',
      )}
    >
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[13.5px] text-ink">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[12.5px] text-ink-3">
            {description}
          </span>
        )}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}

/** Labelled range input with its current value shown. */
export function Range({
  label,
  value,
  min,
  max,
  step,
  format,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className={cn('py-2', disabled && 'opacity-50')}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13.5px] text-ink">
          {label}
        </label>
        <output htmlFor={id} className="text-[12.5px] text-ink-3 tabular-nums">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
