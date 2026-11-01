import { z } from 'zod';
import { SCENES } from './catalog';

/** Sections of the Today page, in their default order. */
export const TODAY_SECTIONS = [
  { id: 'attention', label: 'Needs attention' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'exams', label: 'Coming up (exams)' },
  { id: 'study', label: 'This week in study' },
  { id: 'fortnight', label: 'Next 2 weeks' },
  { id: 'events', label: 'Campus events' },
  { id: 'graded', label: 'Recently graded' },
  { id: 'changes', label: 'Recent changes' },
] as const;

export type TodaySectionId = (typeof TODAY_SECTIONS)[number]['id'];

const sectionIds = TODAY_SECTIONS.map((section) => section.id) as [
  TodaySectionId,
  ...TodaySectionId[],
];
const isSectionId = (id: string): id is TodaySectionId =>
  (sectionIds as readonly string[]).includes(id);
/**
 * Section ids, dropping ones the Today page no longer has (e.g. a retired
 * section) so an old saved order never invalidates the whole appearance.
 */
const sectionList = z
  .array(z.string())
  .transform((ids) => ids.filter(isSectionId));

const sceneIds = SCENES.map((scene) => scene.id) as [
  (typeof SCENES)[number]['id'],
  ...Array<(typeof SCENES)[number]['id']>,
];
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const fontId = z
  .string()
  .regex(/^(custom:[a-z0-9-]+|[a-z0-9-]+)$/)
  .max(64);

export const appearanceSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  /** preset id from ACCENT_PRESETS, or `custom` (uses customAccent) */
  accent: z.string().max(24).default('ink'),
  customAccent: hex.default('#2F55D4'),
  fonts: z
    .object({
      display: fontId.default('stix'),
      body: fontId.default('plex-sans'),
      mono: fontId.default('plex-mono'),
    })
    .default({ display: 'stix', body: 'plex-sans', mono: 'plex-mono' }),
  /** root font-size multiplier */
  textScale: z.number().min(0.85).max(1.25).default(1),
  greeting: z
    .object({
      name: z.string().max(40).default(''),
      clock: z.enum(['off', '12h', '24h']).default('12h'),
      seconds: z.boolean().default(false),
      /** optional line under the greeting */
      message: z.string().max(160).default(''),
    })
    .default({ name: '', clock: '12h', seconds: false, message: '' }),
  background: z
    .object({
      kind: z.enum(['scene', 'photo']).default('scene'),
      scene: z.enum(sceneIds).default('aurora'),
      /** uploaded image media ids, in slideshow order */
      photos: z.array(z.string().max(64)).max(40).default([]),
      /** media id shown when not shuffling */
      photo: z.string().max(64).nullable().default(null),
      /** rotate through `photos` */
      slideshow: z.boolean().default(false),
      /** seconds per photo */
      interval: z.number().int().min(10).max(3600).default(90),
      /** 0 = untouched, 0.9 = nearly black */
      dim: z.number().min(0).max(0.9).default(0.32),
      blur: z.number().min(0).max(30).default(0),
      /** slow pan/zoom on photos, animation on scenes */
      motion: z.boolean().default(true),
      /** focal point, percent */
      focus: z
        .object({
          x: z.number().min(0).max(100),
          y: z.number().min(0).max(100),
        })
        .default({ x: 50, y: 50 }),
      /** hero height on Today, percent of the viewport */
      height: z.number().int().min(36).max(100).default(64),
    })
    .default({
      kind: 'scene',
      scene: 'aurora',
      photos: [],
      photo: null,
      slideshow: false,
      interval: 90,
      dim: 0.32,
      blur: 0,
      motion: true,
      focus: { x: 50, y: 50 },
      height: 64,
    }),
  screensaver: z
    .object({
      enabled: z.boolean().default(true),
      idleMinutes: z.number().int().min(1).max(120).default(10),
      /** show the next deadline under the clock */
      showNext: z.boolean().default(true),
    })
    .default({ enabled: true, idleMinutes: 10, showNext: true }),
  today: z
    .object({
      /** section order; ids not listed are appended in default order */
      order: sectionList.default(sectionIds),
      hidden: sectionList.default([]),
    })
    .default({ order: sectionIds, hidden: [] }),
});

export type Appearance = z.output<typeof appearanceSchema>;

export const DEFAULT_APPEARANCE: Appearance = appearanceSchema.parse({});

export type AppearanceMedia = {
  id: string;
  kind: 'image' | 'font';
  name: string;
  type: string;
  size: number;
  createdAt: string;
  /** images: intrinsic size and average tone, measured at upload */
  width?: number;
  height?: number;
  tone?: 'light' | 'dark';
  color?: string;
};

export const mediaMetaSchema = z.object({
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  tone: z.enum(['light', 'dark']).optional(),
  color: hex.optional(),
});
