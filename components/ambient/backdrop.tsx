'use client';

import './ambient.css';
import { useEffect, useMemo, useState } from 'react';
import {
  mediaUrl,
  useAppearance,
} from '@/components/appearance/appearance-provider';
import type { SceneId } from '@/lib/appearance/catalog';
import type { AppearanceMedia } from '@/lib/appearance/schema';
import { SceneCanvas } from './scene-canvas';
import { useReducedMotion } from './use-reduced-motion';

/**
 * Text tone over the background: `theme` follows the page's own ink and
 * paper (scenes are drawn in the active theme's palette); photos use the
 * tone measured at upload, unless dimmed far enough to read as dark.
 */
export type BackdropTone = 'light' | 'dark' | 'theme';

export type BackdropModel = {
  kind: 'scene' | 'photo';
  scene: SceneId;
  photo: AppearanceMedia | null;
  /** next slideshow photo, preloaded so the crossfade never waits */
  upcoming: AppearanceMedia | null;
  tone: BackdropTone;
  dim: number;
  blur: number;
  motion: boolean;
  focus: { x: number; y: number };
  interval: number;
};

/** Photos to show: the slideshow list, or the single chosen photo. */
export function useBackdrop(): BackdropModel {
  const { appearance, media } = useAppearance();
  const background = appearance.background;
  const list = useMemo(() => {
    const images = new Map(
      media
        .filter((item) => item.kind === 'image')
        .map((item) => [item.id, item]),
    );
    const ids =
      background.slideshow && background.photos.length
        ? background.photos
        : [background.photo ?? background.photos[0]];
    return ids.flatMap((id) => {
      const item = id ? images.get(id) : undefined;
      return item ? [item] : [];
    });
  }, [media, background.slideshow, background.photos, background.photo]);
  const rotating =
    background.kind === 'photo' && background.slideshow && list.length > 1;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(
      () => setStep((value) => value + 1),
      background.interval * 1000,
    );
    return () => window.clearInterval(timer);
  }, [rotating, background.interval]);

  const start = Math.max(
    0,
    list.findIndex((item) => item.id === background.photo),
  );
  const photo = list.length
    ? list[(start + (rotating ? step : 0)) % list.length]
    : null;
  const kind = background.kind === 'photo' && photo ? 'photo' : 'scene';
  return {
    kind,
    scene: background.scene,
    photo: kind === 'photo' ? photo : null,
    upcoming: rotating ? list[(start + step + 1) % list.length] : null,
    tone:
      kind === 'photo'
        ? background.dim >= 0.45
          ? 'dark'
          : (photo?.tone ?? 'dark')
        : 'theme',
    dim: background.dim,
    blur: background.blur,
    motion: background.motion,
    focus: background.focus,
    interval: background.interval,
  };
}

type Layer = { id: string; key: number; ready: boolean };

function PhotoLayers({
  photo,
  upcoming,
  focus,
  motion,
  paused,
  drift,
}: {
  photo: AppearanceMedia;
  upcoming: AppearanceMedia | null;
  focus: { x: number; y: number };
  motion: boolean;
  paused: boolean;
  drift: number;
}) {
  const [layers, setLayers] = useState<Layer[]>([
    { id: photo.id, key: 0, ready: true },
  ]);
  const top = layers[layers.length - 1];
  if (top.id !== photo.id)
    setLayers([
      ...layers.slice(-1),
      { id: photo.id, key: top.key + 1, ready: false },
    ]);

  useEffect(() => {
    if (!upcoming) return;
    const preload = new Image();
    preload.src = mediaUrl(upcoming.id);
  }, [upcoming]);

  const reveal = (key: number) => {
    setLayers((current) =>
      current.map((layer) =>
        layer.key === key ? { ...layer, ready: true } : layer,
      ),
    );
    window.setTimeout(
      () => setLayers((current) => current.filter((layer) => layer.key >= key)),
      2600,
    );
  };

  return layers.map((layer) => (
    <div
      key={layer.key}
      className="ambient-photo"
      data-ready={layer.ready}
      data-motion={motion}
      data-paused={paused}
      style={
        {
          '--focus': `${focus.x}% ${focus.y}%`,
          '--drift': `${drift}s`,
        } as React.CSSProperties
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local media route, sized by CSS */}
      <img
        ref={(element) => {
          if (element?.complete && element.naturalWidth && !layer.ready)
            reveal(layer.key);
        }}
        src={mediaUrl(layer.id)}
        alt=""
        decoding="async"
        draggable={false}
        onLoad={() => {
          if (!layer.ready) reveal(layer.key);
        }}
      />
    </div>
  ));
}

/**
 * The background itself: a photo (crossfading slideshow, slow drift) or a
 * generative scene, then blur and dim. Decorative, so hidden from assistive
 * technology.
 */
export function Backdrop({
  model,
  dark,
  slow = false,
  paused = false,
}: {
  model: BackdropModel;
  dark: boolean;
  /** screensaver pacing: longer drift, slower scene clock */
  slow?: boolean;
  paused?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const animate = model.motion && !reducedMotion;
  const drift = Math.max(model.interval * 1.5, 60) * (slow ? 1.6 : 1);
  return (
    <div className="ambient-backdrop" aria-hidden="true">
      <div
        className="ambient-layer"
        style={
          model.blur
            ? { filter: `blur(${model.blur}px)`, inset: -model.blur * 2 }
            : undefined
        }
      >
        {model.kind === 'photo' && model.photo ? (
          <PhotoLayers
            photo={model.photo}
            upcoming={model.upcoming}
            focus={model.focus}
            motion={animate}
            paused={paused}
            drift={drift}
          />
        ) : (
          <div className="ambient-scene" data-scene={model.scene}>
            <SceneCanvas
              scene={model.scene}
              dark={dark}
              animate={animate}
              speed={slow ? 0.6 : 1}
              paused={paused}
              maxDpr={slow ? 1.25 : 1.5}
            />
          </div>
        )}
      </div>
      {model.kind === 'photo' && model.dim > 0 && (
        <div className="ambient-dim" style={{ opacity: model.dim }} />
      )}
    </div>
  );
}
