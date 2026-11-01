/**
 * The artifact's ink pad (inkPad) and photo preparation, kept free of React so
 * the strokes outlive any one render: a pad's state lives in the grader's
 * draft map and is re-attached to a fresh canvas whenever the pad remounts.
 */

export type Stroke = Array<[number, number]>;
export type PadState = { strokes: Stroke[]; height: number };

export const PAD_START_HEIGHT = 320;
const PAD_GROWTH = 256;

/** One stroke, smoothed through the midpoints of its samples; a tap is a dot. */
function trace(context: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.length === 1) {
    context.beginPath();
    context.arc(stroke[0][0], stroke[0][1], 1.2, 0, 7);
    context.fill();
    return;
  }
  context.beginPath();
  context.moveTo(stroke[0][0], stroke[0][1]);
  for (let i = 1; i < stroke.length - 1; i++) {
    const mx = (stroke[i][0] + stroke[i + 1][0]) / 2;
    const my = (stroke[i][1] + stroke[i + 1][1]) / 2;
    context.quadraticCurveTo(stroke[i][0], stroke[i][1], mx, my);
  }
  const last = stroke[stroke.length - 1];
  context.lineTo(last[0], last[1]);
  context.stroke();
}

export type PadControls = {
  undo: () => void;
  clear: () => void;
  more: () => void;
  detach: () => void;
};

/**
 * Draws `pad` into `canvas` (sized to `wrap`) and records pointer strokes into
 * it. Coalesced pointer events keep fast pen strokes smooth; the pen follows
 * the theme's ink and redraws when the theme flips.
 */
export function attachPad(
  wrap: HTMLElement,
  canvas: HTMLCanvasElement,
  pad: PadState,
  onChange: () => void,
): PadControls {
  let current: Stroke | null = null;
  const draw = () => {
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 2.2;
    const ink =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--ink')
        .trim() || '#141414';
    context.strokeStyle = ink;
    context.fillStyle = ink;
    pad.strokes.forEach((stroke) => trace(context, stroke));
  };
  const size = () => {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, wrap.clientWidth * ratio);
    canvas.height = pad.height * ratio;
    canvas.style.height = `${pad.height}px`;
    draw();
  };
  const point = (event: PointerEvent): [number, number] => {
    const box = canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };
  const down = (event: PointerEvent) => {
    if (event.button > 0) return;
    canvas.setPointerCapture(event.pointerId);
    current = [point(event)];
    pad.strokes.push(current);
    draw();
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (!current) return;
    const samples =
      typeof event.getCoalescedEvents === 'function'
        ? event.getCoalescedEvents()
        : [];
    (samples.length ? samples : [event]).forEach((sample) =>
      current?.push(point(sample)),
    );
    draw();
  };
  const end = () => {
    if (current) onChange();
    current = null;
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  const resize = new ResizeObserver(size);
  resize.observe(wrap);
  const theme = new MutationObserver(draw);
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
  size();
  return {
    undo() {
      pad.strokes.pop();
      draw();
      onChange();
    },
    clear() {
      pad.strokes = [];
      draw();
      onChange();
    },
    more() {
      pad.height += PAD_GROWTH;
      size();
    },
    detach() {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointercancel', end);
      resize.disconnect();
      theme.disconnect();
    },
  };
}

/**
 * The handwriting as a PNG for the grader: cropped to the strokes' height with
 * 24px to spare, at 2×, dark strokes on white whatever the on-screen theme.
 */
export function exportPad(pad: PadState, width: number): Promise<Blob> {
  let minY = Infinity;
  let maxY = 0;
  pad.strokes.forEach((stroke) =>
    stroke.forEach(([, y]) => {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }),
  );
  const top = Math.max(0, minY - 24);
  const height = Math.min(pad.height, maxY + 24) - top;
  const scale = 2;
  const out = document.createElement('canvas');
  out.width = Math.max(1, width) * scale;
  out.height = Math.max(40, height) * scale;
  const context = out.getContext('2d');
  if (!context) return Promise.reject(new Error('Canvas is unavailable.'));
  context.fillStyle = '#fff';
  context.fillRect(0, 0, out.width, out.height);
  context.setTransform(scale, 0, 0, scale, 0, -top * scale);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 2.6;
  context.strokeStyle = '#111';
  context.fillStyle = '#111';
  pad.strokes.forEach((stroke) => trace(context, stroke));
  const { promise, resolve, reject } = Promise.withResolvers<Blob>();
  out.toBlob(
    (blob) =>
      blob ? resolve(blob) : reject(new Error('Could not export the drawing.')),
    'image/png',
  );
  return promise;
}

const PHOTO_MAX_SIDE = 2_000;
const PHOTO_KEEP_BYTES = 1_500_000;

/**
 * Phone photos are often 12 MP and several megabytes, well past what a vision
 * model needs to read handwriting. Large or unusual photos are redrawn as a
 * JPEG at most 2000px on the long side (which also converts HEIC where the
 * browser can decode it); anything the browser cannot decode goes as is and
 * the server decides.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  const plain =
    file.type === 'image/jpeg' ||
    file.type === 'image/png' ||
    file.type === 'image/webp';
  if (file.type === 'image/gif' || (plain && file.size <= PHOTO_KEEP_BYTES))
    return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const scale = Math.min(
    1,
    PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
  );
  const out = document.createElement('canvas');
  out.width = Math.round(bitmap.width * scale);
  out.height = Math.round(bitmap.height * scale);
  const context = out.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }
  context.fillStyle = '#fff';
  context.fillRect(0, 0, out.width, out.height);
  context.drawImage(bitmap, 0, 0, out.width, out.height);
  bitmap.close();
  const encoded = Promise.withResolvers<Blob | null>();
  out.toBlob(encoded.resolve, 'image/jpeg', 0.88);
  return (await encoded.promise) ?? file;
}
