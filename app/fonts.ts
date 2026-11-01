import {
  Atkinson_Hyperlegible,
  Bricolage_Grotesque,
  Cormorant_Garamond,
  EB_Garamond,
  Figtree,
  Fira_Code,
  Fraunces,
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
  Literata,
  Manrope,
  Newsreader,
  Playfair_Display,
  Source_Sans_3,
  Space_Grotesk,
  STIX_Two_Text,
} from 'next/font/google';

/*
 * The Appearance font catalog (lib/appearance/catalog.ts). next/font
 * downloads these at build time and serves them locally; each exposes a
 * `--ff-<id>` variable. Only the Study Hub defaults are preloaded — the rest
 * are fetched by the browser only after someone selects them. next/font
 * requires literal options, hence the repetition.
 */
const stix = STIX_Two_Text({
  subsets: ['latin'],
  variable: '--ff-stix',
  style: ['normal', 'italic'],
  display: 'swap',
});
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--ff-plex-sans',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--ff-plex-mono',
  weight: ['400', '500'],
  display: 'swap',
});
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--ff-newsreader',
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--ff-fraunces',
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const instrument = Instrument_Serif({
  subsets: ['latin'],
  variable: '--ff-instrument',
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--ff-cormorant',
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--ff-playfair',
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  variable: '--ff-eb-garamond',
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const literata = Literata({
  subsets: ['latin'],
  variable: '--ff-literata',
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const inter = Inter({
  subsets: ['latin'],
  variable: '--ff-inter',
  display: 'swap',
  preload: false,
});
const geist = Geist({
  subsets: ['latin'],
  variable: '--ff-geist',
  display: 'swap',
  preload: false,
});
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--ff-manrope',
  display: 'swap',
  preload: false,
});
const figtree = Figtree({
  subsets: ['latin'],
  variable: '--ff-figtree',
  display: 'swap',
  preload: false,
});
const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--ff-source-sans',
  display: 'swap',
  preload: false,
});
const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  variable: '--ff-atkinson',
  weight: ['400', '700'],
  display: 'swap',
  preload: false,
});
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--ff-bricolage',
  display: 'swap',
  preload: false,
});
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--ff-space-grotesk',
  display: 'swap',
  preload: false,
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--ff-jetbrains',
  display: 'swap',
  preload: false,
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--ff-geist-mono',
  display: 'swap',
  preload: false,
});
const firaCode = Fira_Code({
  subsets: ['latin'],
  variable: '--ff-fira-code',
  display: 'swap',
  preload: false,
});

/** Class names that define every `--ff-*` variable; applied to <html>. */
export const fontVariables = [
  stix,
  plexSans,
  plexMono,
  newsreader,
  fraunces,
  instrument,
  cormorant,
  playfair,
  ebGaramond,
  literata,
  inter,
  geist,
  manrope,
  figtree,
  sourceSans,
  atkinson,
  bricolage,
  spaceGrotesk,
  jetbrains,
  geistMono,
  firaCode,
]
  .map((font) => font.variable)
  .join(' ');
