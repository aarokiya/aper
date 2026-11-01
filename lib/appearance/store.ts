import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { dataDir } from '@/lib/db/client';
import { readSetting, writeSetting } from '@/lib/db/settings';
import {
  appearanceSchema,
  DEFAULT_APPEARANCE,
  type Appearance,
  type AppearanceMedia,
} from './schema';

const APPEARANCE_KEY = 'appearance';
const MEDIA_KEY = 'appearance-media';
export const mediaDir = path.join(dataDir, 'appearance', 'media');

export function getAppearance(): Appearance {
  return readSetting(APPEARANCE_KEY, appearanceSchema, DEFAULT_APPEARANCE);
}

export function saveAppearance(value: unknown): Appearance {
  const appearance = appearanceSchema.parse(value);
  const known = new Set(listMedia().map((item) => item.id));
  appearance.background.photos = appearance.background.photos.filter((id) =>
    known.has(id),
  );
  if (appearance.background.photo && !known.has(appearance.background.photo))
    appearance.background.photo = null;
  for (const role of ['display', 'body', 'mono'] as const) {
    const id = appearance.fonts[role];
    if (id.startsWith('custom:') && !known.has(id.slice(7)))
      appearance.fonts[role] = DEFAULT_APPEARANCE.fonts[role];
  }
  writeSetting(APPEARANCE_KEY, appearance);
  return appearance;
}

const mediaListSchema = z.array(
  z.object({
    id: z.string(),
    kind: z.enum(['image', 'font']),
    name: z.string(),
    type: z.string(),
    size: z.number(),
    createdAt: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
    tone: z.enum(['light', 'dark']).optional(),
    color: z.string().optional(),
  }),
);

export function listMedia(): AppearanceMedia[] {
  return readSetting(MEDIA_KEY, mediaListSchema, []);
}

/** Accepted uploads, identified by content rather than the file name. */
const IMAGE_SIGNATURES: Array<{
  type: string;
  ext: string;
  test: (b: Buffer) => boolean;
}> = [
  {
    type: 'image/jpeg',
    ext: 'jpg',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: 'image/png',
    ext: 'png',
    test: (b) =>
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    type: 'image/gif',
    ext: 'gif',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  },
  {
    type: 'image/webp',
    ext: 'webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    type: 'image/avif',
    ext: 'avif',
    test: (b) =>
      b.subarray(4, 12).toString('latin1') === 'ftypavif' ||
      b.subarray(4, 12).toString('latin1') === 'ftypavis',
  },
];

const FONT_SIGNATURES: Array<{
  type: string;
  ext: string;
  test: (b: Buffer) => boolean;
}> = [
  {
    type: 'font/woff2',
    ext: 'woff2',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'wOF2',
  },
  {
    type: 'font/woff',
    ext: 'woff',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'wOFF',
  },
  {
    type: 'font/otf',
    ext: 'otf',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'OTTO',
  },
  {
    type: 'font/ttf',
    ext: 'ttf',
    test: (b) =>
      b.readUInt32BE(0) === 0x00010000 ||
      b.subarray(0, 4).toString('latin1') === 'true',
  },
];

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_FONT_BYTES = 8 * 1024 * 1024;

export class MediaError extends Error {}

export function saveMedia(
  bytes: Buffer,
  name: string,
  meta: Pick<AppearanceMedia, 'width' | 'height' | 'tone' | 'color'> = {},
): AppearanceMedia {
  if (bytes.length < 12) throw new MediaError('That file is empty.');
  const image = IMAGE_SIGNATURES.find((signature) => signature.test(bytes));
  const font = image
    ? undefined
    : FONT_SIGNATURES.find((signature) => signature.test(bytes));
  const match = image ?? font;
  if (!match) {
    if (bytes.subarray(4, 12).toString('latin1').startsWith('ftyphei'))
      throw new MediaError(
        'HEIC photos are not supported by browsers. Export it as JPEG first.',
      );
    throw new MediaError(
      'Upload a JPEG, PNG, WebP, AVIF, or GIF image, or a WOFF2, WOFF, OTF, or TTF font.',
    );
  }
  const kind = image ? 'image' : 'font';
  if (kind === 'image' && bytes.length > MAX_IMAGE_BYTES)
    throw new MediaError('Images must be 30 MB or smaller.');
  if (kind === 'font' && bytes.length > MAX_FONT_BYTES)
    throw new MediaError('Fonts must be 8 MB or smaller.');
  const id = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, `${id}.${match.ext}`), bytes, {
    mode: 0o600,
  });
  const item: AppearanceMedia = {
    id,
    kind,
    name:
      name.replace(/[^\w .()-]+/g, '').slice(0, 120) || `${kind}.${match.ext}`,
    type: match.type,
    size: bytes.length,
    createdAt: new Date().toISOString(),
    ...(kind === 'image' ? meta : {}),
  };
  writeSetting(MEDIA_KEY, [...listMedia(), item]);
  return item;
}

/** Absolute path of a stored media file, or null (guards traversal). */
export function mediaFile(id: string) {
  if (!/^[a-z0-9]+-[a-f0-9]{8}$/.test(id)) return null;
  const item = listMedia().find((entry) => entry.id === id);
  if (!item) return null;
  const ext = [...IMAGE_SIGNATURES, ...FONT_SIGNATURES].find(
    (signature) => signature.type === item.type,
  )?.ext;
  const target = path.join(mediaDir, `${id}.${ext}`);
  return fs.existsSync(target) ? { item, target } : null;
}

export function deleteMedia(id: string) {
  const file = mediaFile(id);
  if (file) fs.rmSync(file.target, { force: true });
  writeSetting(
    MEDIA_KEY,
    listMedia().filter((item) => item.id !== id),
  );
  saveAppearance(getAppearance());
}
