'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  FONT_CHOICES,
  type FontCategory,
  type FontRole,
} from '@/lib/appearance/catalog';
import { useAppearance } from './appearance-provider';
import { Group, Range, Segmented } from './controls';

const ROLES: ReadonlyArray<{ value: FontRole; label: string }> = [
  { value: 'display', label: 'Headings' },
  { value: 'body', label: 'Interface' },
  { value: 'mono', label: 'Code' },
];

/** Categories offered per role, in order. */
const ROLE_CATEGORIES: Record<FontRole, FontCategory[]> = {
  display: ['serif', 'sans'],
  body: ['sans', 'serif'],
  mono: ['mono'],
};

const SAMPLE: Record<FontRole, string> = {
  display: 'Good afternoon',
  body: 'Three courses, one place.',
  mono: 'for (int i = 0; i < n; i++)',
};

const CATEGORY_LABEL: Record<FontCategory, string> = {
  serif: 'Serif',
  sans: 'Sans serif',
  mono: 'Monospace',
};

export function TypePanel() {
  const { appearance, media, update, uploadMedia, deleteMedia } =
    useAppearance();
  const [role, setRole] = useState<FontRole>('display');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fonts = media.filter((item) => item.kind === 'font');
  const selected = appearance.fonts[role];

  const choose = (id: string) =>
    update((current) => ({
      ...current,
      fonts: { ...current.fonts, [role]: id },
    }));

  const upload = async (file: File) => {
    if (!/\.(woff2?|otf|ttf)$/i.test(file.name)) {
      setStatus('Choose a .woff2, .woff, .otf, or .ttf font file.');
      return;
    }
    setBusy(true);
    setStatus('Adding font…');
    try {
      const item = await uploadMedia(file, file.name);
      choose(`custom:${item.id}`);
      setStatus(
        `${item.name} added and used for ${ROLES.find((entry) => entry.value === role)?.label.toLowerCase()}.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Could not add that font.',
      );
    } finally {
      setBusy(false);
    }
  };

  const option = (
    id: string,
    label: string,
    family: string,
    note: string,
    removable?: string,
  ) => (
    <li key={id} className="font-option" data-selected={selected === id}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-3 py-2.5">
        <input
          type="radio"
          name={`font-${role}`}
          className="font-radio"
          checked={selected === id}
          onChange={() => choose(id)}
        />
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-[1.0625rem] leading-snug text-ink"
            style={{ fontFamily: family }}
          >
            {label}
          </span>
          <span className="block truncate text-[12px] text-ink-3">{note}</span>
        </span>
        <span
          className="hidden max-w-[45%] truncate text-[14px] text-ink-2 sm:block"
          style={{ fontFamily: family }}
          aria-hidden="true"
        >
          {SAMPLE[role]}
        </span>
      </label>
      {removable && (
        <button
          type="button"
          className="photo-delete"
          aria-label={`Delete ${removable}`}
          onClick={() =>
            void deleteMedia(id.slice(7))
              .then(() => setStatus(`${removable} deleted.`))
              .catch(() => setStatus('Could not delete that font.'))
          }
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="type-specimen" aria-label="Preview">
        <p className="font-serif text-[2rem] leading-[1.05] tracking-[-0.015em] text-ink">
          Good afternoon
        </p>
        <p className="mt-2 text-[14px] text-ink-2">
          Exam 1 for ABC 1234 is in six days. Practice set 4 is half done.
        </p>
        <p className="mt-2 font-mono text-[12.5px] text-ink-3">
          ∀x ∈ S, P(x) → Q(x)
        </p>
      </div>

      <div>
        <Segmented
          label="Typeface for"
          value={role}
          options={ROLES}
          onChange={setRole}
        />
        {ROLE_CATEGORIES[role].map((category) => (
          <div key={category} className="mt-5">
            <h3 className="section-label mb-1">{CATEGORY_LABEL[category]}</h3>
            <ul
              className="rule-rows"
              aria-label={`${CATEGORY_LABEL[category]} typefaces`}
            >
              {FONT_CHOICES.filter((font) => font.category === category).map(
                (font) =>
                  option(
                    font.id,
                    font.label,
                    `var(--ff-${font.id})`,
                    font.note,
                  ),
              )}
            </ul>
          </div>
        ))}
        {fonts.length > 0 && (
          <div className="mt-5">
            <h3 className="section-label mb-1">Your fonts</h3>
            <ul className="rule-rows" aria-label="Your fonts">
              {fonts.map((font) =>
                option(
                  `custom:${font.id}`,
                  font.name.replace(/\.[^.]+$/, ''),
                  `"aper-font-${font.id}", ${role === 'mono' ? 'monospace' : 'serif'}`,
                  'Uploaded',
                  font.name,
                ),
              )}
            </ul>
          </div>
        )}
      </div>

      <Group
        title="Add a font"
        hint="Upload a .woff2, .woff, .otf, or .ttf file. It's used for the role selected above."
      >
        <button
          type="button"
          className="pill"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Upload a font
        </button>
        <input
          ref={input}
          type="file"
          accept=".woff2,.woff,.otf,.ttf,font/woff2,font/woff,font/otf,font/ttf"
          className="sr"
          tabIndex={-1}
          aria-label="Upload a font"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
        <p
          className="mt-2 min-h-[1.25rem] text-[12.5px] text-ink-3"
          aria-live="polite"
          aria-atomic="true"
        >
          {status}
        </p>
      </Group>

      <Group title="Size">
        <Range
          label="Text size"
          value={appearance.textScale}
          min={0.85}
          max={1.25}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) =>
            update((current) => ({
              ...current,
              textScale: Math.round(value * 100) / 100,
            }))
          }
        />
      </Group>
    </div>
  );
}
