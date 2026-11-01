'use client';

import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { SceneCanvas } from '@/components/ambient/scene-canvas';
import { SCENES } from '@/lib/appearance/catalog';
import type { Appearance } from '@/lib/appearance/schema';
import { cn } from '@/lib/utils';
import { mediaUrl, useAppearance } from './appearance-provider';
import { Group, Range, Segmented, Toggle } from './controls';
import { prepareImage } from './process-image';

type Background = Appearance['background'];

const INTERVALS = [
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 90, label: '90 seconds' },
  { value: 180, label: '3 minutes' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
];

const clampPercent = (value: number) =>
  Math.min(100, Math.max(0, Math.round(value)));

function FocalPoint({
  photoId,
  focus,
  onChange,
}: {
  photoId: string;
  focus: Background['focus'];
  onChange: (focus: Background['focus']) => void;
}) {
  const set = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange({
      x: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
      y: clampPercent(((event.clientY - rect.top) / rect.height) * 100),
    });
  };
  const nudge = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 10 : 2;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange({
      x: clampPercent(focus.x + move[0]),
      y: clampPercent(focus.y + move[1]),
    });
  };
  return (
    <button
      type="button"
      className="focal"
      aria-label={`Focal point, ${focus.x}% across and ${focus.y}% down. Click the photo or use the arrow keys to move it.`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        set(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) set(event);
      }}
      onKeyDown={nudge}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local media route */}
      <img src={mediaUrl(photoId)} alt="" draggable={false} />
      <span
        className="focal-mark"
        style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
        aria-hidden="true"
      />
    </button>
  );
}

export function BackgroundPanel() {
  const { appearance, media, update, uploadMedia, deleteMedia, resolvedTheme } =
    useAppearance();
  const background = appearance.background;
  const images = media.filter((item) => item.kind === 'image');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const setBackground = (patch: Partial<Background>) =>
    update((current) => ({
      ...current,
      background: { ...current.background, ...patch },
    }));

  const upload = async (files: File[]) => {
    const list = files.filter(
      (file) =>
        file.type.startsWith('image/') ||
        /\.(jpe?g|png|webp|avif|gif|heic)$/i.test(file.name),
    );
    if (!list.length) {
      setStatus('Choose an image file: JPEG, PNG, WebP, AVIF, or GIF.');
      return;
    }
    setBusy(true);
    const added: string[] = [];
    const failures: string[] = [];
    for (const [index, file] of list.entries()) {
      setStatus(
        list.length > 1
          ? `Adding photo ${index + 1} of ${list.length}…`
          : 'Adding photo…',
      );
      try {
        const prepared = await prepareImage(file);
        const item = await uploadMedia(
          prepared.blob,
          prepared.name,
          prepared.meta,
        );
        added.push(item.id);
        const first = added.length === 1;
        update((current) => ({
          ...current,
          background: {
            ...current.background,
            ...(first ? { kind: 'photo' as const, photo: item.id } : {}),
            photos: [
              ...current.background.photos.filter((id) => id !== item.id),
              item.id,
            ].slice(-40),
          },
        }));
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : `Couldn't add ${file.name}.`,
        );
      }
    }
    setBusy(false);
    setStatus(
      failures.length
        ? failures.join(' ')
        : added.length === 1
          ? 'Photo added and set as your background.'
          : `${added.length} photos added to your slideshow.`,
    );
  };

  const remove = async (id: string) => {
    if (confirming !== id) {
      setConfirming(id);
      window.setTimeout(
        () => setConfirming((current) => (current === id ? null : current)),
        4000,
      );
      return;
    }
    setConfirming(null);
    try {
      await deleteMedia(id);
      setStatus('Photo deleted.');
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Could not delete that photo.',
      );
    }
  };

  const current =
    background.photo && images.some((item) => item.id === background.photo)
      ? background.photo
      : null;

  return (
    <div className="flex flex-col gap-8">
      <Segmented
        label="Background"
        value={background.kind}
        options={[
          { value: 'photo', label: 'Your photos' },
          { value: 'scene', label: 'Scene' },
        ]}
        onChange={(kind) =>
          setBackground({
            kind,
            photo:
              kind === 'photo'
                ? (current ?? images[0]?.id ?? null)
                : background.photo,
          })
        }
      />

      {background.kind === 'photo' ? (
        <>
          <Group
            title="Photos"
            hint="Large photos are resized to 4K in your browser before they're saved on this computer."
          >
            <div
              className={cn('dropzone', dragging && 'dropzone-active')}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void upload([...event.dataTransfer.files]);
              }}
            >
              <ImagePlus className="size-5 text-ink-3" aria-hidden="true" />
              <p className="text-[13.5px] text-ink-2">Drop photos here</p>
              <button
                type="button"
                className="pill pill-sm"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                Choose photos
              </button>
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/heic,image/heif"
                multiple
                className="sr"
                tabIndex={-1}
                aria-label="Choose photos"
                onChange={(event) => {
                  void upload([...(event.target.files ?? [])]);
                  event.target.value = '';
                }}
              />
            </div>
            <p
              className="mt-2 min-h-[1.25rem] text-[12.5px] text-ink-3"
              aria-live="polite"
              aria-atomic="true"
            >
              {status}
            </p>

            {images.length > 0 && (
              <ul className="photo-grid" aria-label="Your photos">
                {images.map((item) => {
                  const selected = current === item.id;
                  const inShow = background.photos.includes(item.id);
                  return (
                    <li
                      key={item.id}
                      className="photo-tile"
                      data-selected={selected}
                    >
                      <button
                        type="button"
                        className="photo-thumb"
                        aria-pressed={selected}
                        aria-label={`Use ${item.name} as the background`}
                        onClick={() =>
                          setBackground({ kind: 'photo', photo: item.id })
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- local media route */}
                        <img
                          src={mediaUrl(item.id)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                      </button>
                      <div className="flex items-center justify-between gap-1 pt-1.5">
                        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-3">
                          <input
                            type="checkbox"
                            className="accent-[var(--accent-ink)]"
                            checked={inShow}
                            onChange={(event) =>
                              setBackground({
                                photos: event.target.checked
                                  ? [...background.photos, item.id].slice(-40)
                                  : background.photos.filter(
                                      (id) => id !== item.id,
                                    ),
                              })
                            }
                          />
                          Slideshow
                        </label>
                        <button
                          type="button"
                          className={cn(
                            'photo-delete',
                            confirming === item.id && 'photo-delete-confirm',
                          )}
                          aria-label={
                            confirming === item.id
                              ? `Confirm deleting ${item.name}`
                              : `Delete ${item.name}`
                          }
                          onClick={() => void remove(item.id)}
                        >
                          {confirming === item.id ? (
                            'Delete'
                          ) : (
                            <X className="size-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Group>

          {current && (
            <Group
              title="Focal point"
              hint="Click the part of the photo that should stay in view when it's cropped."
            >
              <FocalPoint
                photoId={current}
                focus={background.focus}
                onChange={(focus) => setBackground({ focus })}
              />
            </Group>
          )}

          <Group title="Photo">
            <Range
              label="Dim"
              value={background.dim}
              min={0}
              max={0.9}
              step={0.02}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={(dim) => setBackground({ dim })}
            />
            <Range
              label="Blur"
              value={background.blur}
              min={0}
              max={30}
              step={1}
              format={(value) => (value ? `${value}px` : 'None')}
              onChange={(blur) => setBackground({ blur })}
            />
            <Toggle
              label="Slow pan and zoom"
              description="A gentle drift across the photo."
              checked={background.motion}
              onChange={(motion) => setBackground({ motion })}
            />
            <Toggle
              label="Slideshow"
              description={
                background.photos.length
                  ? `Crossfade through the ${background.photos.length} photo${background.photos.length === 1 ? '' : 's'} marked Slideshow.`
                  : 'Mark photos with Slideshow to include them.'
              }
              checked={background.slideshow}
              onChange={(slideshow) => setBackground({ slideshow })}
            />
            {background.slideshow && (
              <label className="flex items-center justify-between gap-4 py-2 text-[13.5px] text-ink">
                Change every
                <select
                  className="field w-auto"
                  value={
                    INTERVALS.some(
                      (option) => option.value === background.interval,
                    )
                      ? background.interval
                      : ''
                  }
                  onChange={(event) =>
                    setBackground({ interval: Number(event.target.value) })
                  }
                >
                  {!INTERVALS.some(
                    (option) => option.value === background.interval,
                  ) && <option value="">{background.interval} seconds</option>}
                  {INTERVALS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Group>
        </>
      ) : (
        <>
          <fieldset>
            <legend className="section-label mb-2.5">Scene</legend>
            <div className="scene-grid">
              {SCENES.map((scene) => (
                <label key={scene.id} className="scene-option">
                  <input
                    type="radio"
                    name="customizer-scene"
                    className="sr"
                    value={scene.id}
                    checked={background.scene === scene.id}
                    onChange={() =>
                      setBackground({ kind: 'scene', scene: scene.id })
                    }
                  />
                  <span className="scene-preview">
                    <span className="ambient-scene" data-scene={scene.id}>
                      <SceneCanvas
                        scene={scene.id}
                        dark={resolvedTheme === 'dark'}
                        animate={background.motion}
                        maxDpr={1}
                      />
                    </span>
                  </span>
                  <span className="mt-1.5 block text-[13px] text-ink">
                    {scene.label}
                  </span>
                  <span className="block text-[12px] leading-snug text-ink-3">
                    {scene.note}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Group title="Scene">
            <Range
              label="Blur"
              value={background.blur}
              min={0}
              max={30}
              step={1}
              format={(value) => (value ? `${value}px` : 'None')}
              onChange={(blur) => setBackground({ blur })}
            />
            <Toggle
              label="Animate"
              description="Scenes move slowly and pause when they're out of sight."
              checked={background.motion}
              onChange={(motion) => setBackground({ motion })}
            />
          </Group>
        </>
      )}

      <Group title="Size on Today">
        <Range
          label="Height"
          value={background.height}
          min={36}
          max={100}
          step={2}
          format={(value) => `${value}% of the window`}
          onChange={(height) => setBackground({ height })}
        />
      </Group>
    </div>
  );
}
