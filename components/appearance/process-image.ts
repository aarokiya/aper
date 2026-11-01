/**
 * Prepare an uploaded photo in the browser: downscale to at most 4K on the
 * long edge, re-encode (WebP, or JPEG where WebP encoding isn't supported),
 * and measure its average color plus the tone of the lower-left area where
 * Today's greeting sits.
 */
const MAX_EDGE = 3840;
const QUALITY = 0.9;
/** Formats kept byte-for-byte when they're already small enough. */
const KEEP_AS_IS: Record<string, true> = {
  'image/jpeg': true,
  'image/webp': true,
  'image/avif': true,
  'image/gif': true,
};

export type PreparedImage = {
  blob: Blob;
  name: string;
  meta: {
    width: number;
    height: number;
    tone: 'light' | 'dark';
    color: string;
  };
};

const encode = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));

const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');

export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(
      `Couldn't read ${file.name}. Use a JPEG, PNG, WebP, AVIF, or GIF image.`,
    );
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const probe = document.createElement('canvas');
  probe.width = 64;
  probe.height = Math.max(1, Math.round((64 * height) / width));
  const probeContext = probe.getContext('2d', { willReadFrequently: true });
  if (!probeContext) throw new Error('This browser cannot process images.');
  probeContext.drawImage(bitmap, 0, 0, probe.width, probe.height);
  const pixels = probeContext.getImageData(
    0,
    0,
    probe.width,
    probe.height,
  ).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let textLuma = 0;
  let textCount = 0;
  const linear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  for (let y = 0; y < probe.height; y += 1) {
    for (let x = 0; x < probe.width; x += 1) {
      const i = (y * probe.width + x) * 4;
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      if (x < probe.width * 0.75 && y > probe.height * 0.4) {
        textLuma +=
          0.2126 * linear(pixels[i]) +
          0.7152 * linear(pixels[i + 1]) +
          0.0722 * linear(pixels[i + 2]);
        textCount += 1;
      }
    }
  }
  const count = probe.width * probe.height;
  // 0.18 linear luminance is roughly mid-grey: above it, ink reads better than white.
  const tone = textLuma / Math.max(1, textCount) > 0.18 ? 'light' : 'dark';
  const color = `#${hex(r / count)}${hex(g / count)}${hex(b / count)}`;

  let blob: Blob | null = null;
  let type = file.type;
  if (scale === 1 && KEEP_AS_IS[file.type]) {
    blob = file;
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot process images.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    blob = await encode(canvas, 'image/webp');
    if (!blob || blob.type !== 'image/webp')
      blob = await encode(canvas, 'image/jpeg');
    if (!blob) throw new Error(`Couldn't resize ${file.name}.`);
    type = blob.type;
  }
  bitmap.close();

  const extension =
    type === 'image/webp'
      ? 'webp'
      : type === 'image/jpeg'
        ? 'jpg'
        : (file.name.split('.').pop() ?? 'img');
  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return {
    blob,
    name: `${base}.${extension}`,
    meta: { width, height, tone, color },
  };
}
