'use client';

import './ambient.css';
import { useEffect, useRef } from 'react';
import type { SceneId } from '@/lib/appearance/catalog';
import { cn } from '@/lib/utils';
import { SCENE_PROGRAMS, VERTEX_SHADER } from './scenes';

type SceneCanvasProps = {
  scene: SceneId;
  dark: boolean;
  /** advance the clock; false draws one still frame */
  animate: boolean;
  /** clock multiplier (the screensaver runs slower) */
  speed?: number;
  /** stop drawing without unmounting (e.g. covered by the screensaver) */
  paused?: boolean;
  /** device-pixel-ratio cap */
  maxDpr?: number;
  className?: string;
};

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.error(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

/* Contexts are released after unmount; a remount of the same canvas (React
   StrictMode re-running effects) cancels the release and reuses it. */
const pendingRelease = new WeakMap<HTMLCanvasElement, number>();

/**
 * One generative scene on a canvas. Draws at a capped resolution and frame
 * rate, only while on screen and the tab is visible; without WebGL2 the
 * scene's CSS base color (from ambient.css) shows instead.
 */
export function SceneCanvas(props: SceneCanvasProps) {
  return <SceneSurface key={props.scene} {...props} />;
}

function SceneSurface({
  scene,
  dark,
  animate,
  speed = 1,
  paused = false,
  maxDpr = 1.5,
  className,
}: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ dark, animate, speed, paused });
  const wake = useRef<() => void>(() => undefined);

  useEffect(() => {
    live.current = { dark, animate, speed, paused };
    wake.current();
  }, [dark, animate, speed, paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    window.clearTimeout(pendingRelease.get(canvas));
    const program = SCENE_PROGRAMS[scene];
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
    if (!gl) return;
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, program.source);
    const shaderProgram = gl.createProgram();
    if (!vertex || !fragment || !shaderProgram) return;
    gl.attachShader(shaderProgram, vertex);
    gl.attachShader(shaderProgram, fragment);
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(shaderProgram));
      return;
    }
    gl.useProgram(shaderProgram);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const uRes = gl.getUniformLocation(shaderProgram, 'u_res');
    const uTime = gl.getUniformLocation(shaderProgram, 'u_time');
    const uDark = gl.getUniformLocation(shaderProgram, 'u_dark');

    let clock = program.still;
    let lastFrame = 0;
    let lastTick = 0;
    let raf = 0;
    let onScreen = true;
    let drawnStill = false;

    const draw = () => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, clock);
      gl.uniform1f(uDark, live.current.dark ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const running = () =>
      live.current.animate &&
      program.fps > 0 &&
      onScreen &&
      !live.current.paused &&
      document.visibilityState === 'visible';

    const frame = (now: number) => {
      raf = 0;
      if (!running()) {
        lastTick = 0;
        return;
      }
      if (lastTick)
        clock += (Math.min(now - lastTick, 250) / 1000) * live.current.speed;
      lastTick = now;
      if (now - lastFrame >= 1000 / program.fps - 2) {
        lastFrame = now;
        draw();
      }
      raf = requestAnimationFrame(frame);
    };

    const schedule = () => {
      if (running()) {
        drawnStill = false;
        if (!raf) raf = requestAnimationFrame(frame);
      } else if (!drawnStill || !live.current.animate) {
        if (!live.current.animate) clock = program.still;
        draw();
        drawnStill = true;
      }
    };
    wake.current = () => {
      drawnStill = false;
      schedule();
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio =
        Math.min(window.devicePixelRatio || 1, maxDpr) * program.resolution;
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      draw();
    };

    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(canvas);
    const viewObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      schedule();
    });
    viewObserver.observe(canvas);
    document.addEventListener('visibilitychange', schedule);
    resize();
    draw();
    canvas.dataset.ready = 'true';
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      sizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener('visibilitychange', schedule);
      wake.current = () => undefined;
      gl.deleteProgram(shaderProgram);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteVertexArray(vao);
      pendingRelease.set(
        canvas,
        window.setTimeout(
          () => gl.getExtension('WEBGL_lose_context')?.loseContext(),
          0,
        ),
      );
    };
  }, [scene, maxDpr]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('ambient-canvas', className)}
    />
  );
}
