'use client';

import { useId, useState } from 'react';

/**
 * A list of short phrases edited as removable chips plus a text input:
 * Enter or comma adds, Backspace on an empty input removes the last chip.
 */
export function TokenField({
  label,
  hint,
  placeholder,
  values,
  onChange,
  max = 30,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const commit = (raw: string) => {
    const additions = raw
      .split(',')
      .map((part) => part.trim().replace(/\s+/g, ' '))
      .filter(
        (part) =>
          part.length > 0 &&
          part.length <= 60 &&
          !values.some((value) => value.toLowerCase() === part.toLowerCase()),
      );
    if (additions.length)
      onChange([...values, ...new Set(additions)].slice(0, max));
    setDraft('');
  };
  return (
    <div>
      <label htmlFor={id} className="text-[0.8125rem] text-ink-2">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-[0.75rem] text-ink-4">
          {hint}
        </p>
      )}
      <div className="mt-1.5 flex min-h-[2.25rem] flex-wrap items-center gap-1.5 rounded-[6px] border border-rule-2 px-2 py-1.5 transition-colors focus-within:border-ink hover:border-ink-4">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full border border-rule-2 py-0.5 pr-1 pl-2.5 text-[0.78125rem] text-ink"
          >
            {value}
            <button
              type="button"
              className="grid size-4 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-wash hover:text-ink"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              <span aria-hidden>×</span>
            </button>
          </span>
        ))}
        <input
          id={id}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="min-w-[8rem] flex-1 bg-transparent px-1 text-[0.875rem] text-ink outline-none placeholder:text-ink-4"
          placeholder={values.length >= max ? '' : placeholder}
          disabled={values.length >= max}
          value={draft}
          onChange={(event) => {
            const next = event.target.value;
            if (next.includes(',')) commit(next);
            else setDraft(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(draft);
            } else if (event.key === 'Backspace' && !draft && values.length)
              onChange(values.slice(0, -1));
          }}
          onBlur={() => draft.trim() && commit(draft)}
        />
      </div>
    </div>
  );
}
