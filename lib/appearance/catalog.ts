/**
 * Curated typefaces and accents for Appearance. Every font is self-hosted by
 * next/font (see app/fonts.ts), exposed as `--ff-<id>` on <html>, and only
 * downloaded by the browser once something actually uses it.
 */
export type FontCategory = 'serif' | 'sans' | 'mono';

export type FontChoice = {
  id: string;
  label: string;
  category: FontCategory;
  /** short note shown in the picker */
  note: string;
};

export const FONT_CHOICES: FontChoice[] = [
  {
    id: 'stix',
    label: 'STIX Two',
    category: 'serif',
    note: 'Scholarly, the Study Hub original',
  },
  {
    id: 'newsreader',
    label: 'Newsreader',
    category: 'serif',
    note: 'Warm, made for long reading',
  },
  {
    id: 'fraunces',
    label: 'Fraunces',
    category: 'serif',
    note: 'Soft, old-style display',
  },
  {
    id: 'instrument',
    label: 'Instrument Serif',
    category: 'serif',
    note: 'Tall, condensed, editorial',
  },
  {
    id: 'cormorant',
    label: 'Cormorant',
    category: 'serif',
    note: 'Delicate Garamond display',
  },
  {
    id: 'playfair',
    label: 'Playfair',
    category: 'serif',
    note: 'High-contrast transitional',
  },
  {
    id: 'eb-garamond',
    label: 'EB Garamond',
    category: 'serif',
    note: 'Classic book face',
  },
  {
    id: 'literata',
    label: 'Literata',
    category: 'serif',
    note: 'Sturdy e-reader serif',
  },
  {
    id: 'plex-sans',
    label: 'IBM Plex Sans',
    category: 'sans',
    note: 'Engineered, the Study Hub original',
  },
  {
    id: 'inter',
    label: 'Inter',
    category: 'sans',
    note: 'Neutral interface sans',
  },
  {
    id: 'geist',
    label: 'Geist',
    category: 'sans',
    note: 'Crisp and geometric',
  },
  {
    id: 'manrope',
    label: 'Manrope',
    category: 'sans',
    note: 'Rounded, modern',
  },
  {
    id: 'figtree',
    label: 'Figtree',
    category: 'sans',
    note: 'Friendly geometric',
  },
  {
    id: 'source-sans',
    label: 'Source Sans',
    category: 'sans',
    note: 'Humanist and open',
  },
  {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible',
    category: 'sans',
    note: 'Maximum legibility',
  },
  {
    id: 'bricolage',
    label: 'Bricolage Grotesque',
    category: 'sans',
    note: 'Expressive grotesque',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    category: 'sans',
    note: 'Technical display sans',
  },
  {
    id: 'plex-mono',
    label: 'IBM Plex Mono',
    category: 'mono',
    note: 'The Study Hub original',
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    category: 'mono',
    note: 'Tall x-height for code',
  },
  {
    id: 'geist-mono',
    label: 'Geist Mono',
    category: 'mono',
    note: 'Clean and compact',
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    category: 'mono',
    note: 'Ligatures for operators',
  },
];

export const FONT_BY_ID: Record<string, FontChoice> = Object.fromEntries(
  FONT_CHOICES.map((font) => [font.id, font]),
);

export type FontRole = 'display' | 'body' | 'mono';

const ROLE_FALLBACK: Record<FontRole, string> = {
  display: '"Iowan Old Style", Georgia, serif',
  body: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** CSS font-family value for a font id or `custom:<mediaId>`. */
export function fontStack(id: string, role: FontRole) {
  if (id.startsWith('custom:'))
    return `"aper-font-${id.slice(7)}", ${ROLE_FALLBACK[role]}`;
  const known = FONT_BY_ID[id]
    ? id
    : role === 'display'
      ? 'stix'
      : role === 'body'
        ? 'plex-sans'
        : 'plex-mono';
  return `var(--ff-${known}), ${ROLE_FALLBACK[role]}`;
}

export type AccentPreset = {
  id: string;
  label: string;
  light: string;
  dark: string;
};

/** `ink` keeps the Study Hub's monochrome look. */
export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'ink', label: 'Ink', light: '#141414', dark: '#EDEDED' },
  { id: 'cobalt', label: 'Cobalt', light: '#2F55D4', dark: '#8EA8FF' },
  { id: 'forest', label: 'Forest', light: '#1D7148', dark: '#6CCB97' },
  { id: 'ember', label: 'Ember', light: '#B4441A', dark: '#FF9466' },
  { id: 'plum', label: 'Plum', light: '#7E3B9B', dark: '#D29BEA' },
  { id: 'brass', label: 'Brass', light: '#8A6410', dark: '#E2B84F' },
  { id: 'rose', label: 'Rose', light: '#B0275E', dark: '#F49AC0' },
  { id: 'glacier', label: 'Glacier', light: '#0F6E85', dark: '#7FD3E6' },
];

export const ACCENT_BY_ID: Record<string, AccentPreset> = Object.fromEntries(
  ACCENT_PRESETS.map((accent) => [accent.id, accent]),
);

/** Readable text color (near-black or white) on top of a hex background. */
export function contrastText(hex: string) {
  const value = hex.replace('#', '');
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.42 ? '#141414' : '#FFFFFF';
}

/** Generative backgrounds available when no photo is chosen. */
export const SCENES = [
  { id: 'aurora', label: 'Aurora', note: 'Slow ribbons of light' },
  { id: 'dusk', label: 'Dusk', note: 'Evening sky gradient with grain' },
  { id: 'contours', label: 'Contours', note: 'Drifting topographic lines' },
  {
    id: 'constellation',
    label: 'Constellation',
    note: 'Quiet points of light',
  },
  { id: 'paper', label: 'Paper', note: 'Plain Study Hub paper' },
] as const;

export type SceneId = (typeof SCENES)[number]['id'];
