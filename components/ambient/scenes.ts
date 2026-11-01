import type { SceneId } from '@/lib/appearance/catalog';

/**
 * Generative backgrounds as WebGL2 fragment shaders. Each receives the canvas
 * size, a slow clock in seconds, and whether the dark palette applies. They
 * are drawn by SceneCanvas at a capped resolution and frame rate.
 */
export type SceneProgram = {
  source: string;
  /** render-resolution multiplier on top of the capped device pixel ratio */
  resolution: number;
  /** frames per second while animating */
  fps: number;
  /** clock value used for the still frame (reduced motion, motion off) */
  still: number;
};

export const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const COMMON = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_dark;
out vec4 fragColor;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * snoise(p);
    p = p * 2.03 + vec2(17.13, 9.71);
    amp *= 0.5;
  }
  return sum;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

/* Ordered dither against 8-bit banding in slow gradients. */
vec3 dither(vec3 c) {
  return c + (hash12(gl_FragCoord.xy) - 0.5) / 255.0 * 2.0;
}
`;

const AURORA = `${COMMON}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time * 0.045;

  vec3 skyDark = mix(vec3(0.030, 0.050, 0.075), vec3(0.008, 0.012, 0.030), uv.y);
  vec3 skyLight = mix(vec3(0.925, 0.948, 0.958), vec3(0.985, 0.988, 0.992), uv.y);
  vec3 col = mix(skyLight, skyDark, u_dark);

  vec3 glowDark[4] = vec3[4](vec3(0.16, 0.86, 0.56), vec3(0.10, 0.58, 0.78), vec3(0.50, 0.32, 0.88), vec3(0.22, 0.74, 0.64));
  vec3 tintLight[4] = vec3[4](vec3(0.56, 0.87, 0.74), vec3(0.58, 0.78, 0.95), vec3(0.76, 0.69, 0.95), vec3(0.66, 0.90, 0.84));

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = 0.48 + 0.09 * fi + 0.2 * fbm(vec2(p.x * 0.5 + fi * 3.1 + t * 0.7, t * 0.3 + fi * 1.7), 4);
    float d = p.y - y;
    float rise = smoothstep(-0.015, 0.02, d) * exp(-max(d, 0.0) * (4.0 + fi * 1.6));
    float edge = exp(-d * d * 700.0) * 0.7;
    float rays = 0.68 + 0.32 * snoise(vec2(p.x * 7.0 + fi * 7.3 + t * 1.6, fi + t * 0.35));
    float sway = 0.5 + 0.5 * snoise(vec2(p.x * 0.75 - t * 0.55, fi * 2.3 + t * 0.2));
    float intensity = (rise * rays + edge) * sway * (1.0 - fi * 0.16);
    vec3 dark = glowDark[i] * intensity * 0.85;
    col = mix(col + dark * u_dark, mix(col, tintLight[i], clamp(intensity * 0.9, 0.0, 0.8)), 1.0 - u_dark);
  }

  vec2 cell = floor(gl_FragCoord.xy / 5.0);
  vec2 spot = 1.0 + 3.0 * hash22(cell);
  float star = step(0.985, hash12(cell)) * smoothstep(0.9, 0.1, length(fract(gl_FragCoord.xy / 5.0) * 5.0 - spot))
    * smoothstep(0.35, 1.0, uv.y);
  float twinkle = 0.6 + 0.4 * sin(u_time * (0.4 + hash12(cell + 7.0)) + hash12(cell) * 50.0);
  col += vec3(0.8, 0.85, 1.0) * star * twinkle * 0.55 * u_dark;

  fragColor = vec4(dither(col), 1.0);
}`;

const DUSK = `${COMMON}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time;
  float px = 1.5 / u_res.y;

  vec3 zenith = mix(vec3(0.62, 0.72, 0.87), vec3(0.045, 0.055, 0.15), u_dark);
  vec3 middle = mix(vec3(0.91, 0.82, 0.86), vec3(0.30, 0.17, 0.34), u_dark);
  vec3 horizon = mix(vec3(0.99, 0.84, 0.69), vec3(0.93, 0.46, 0.30), u_dark);
  vec3 sunColor = mix(vec3(1.0, 0.93, 0.80), vec3(1.0, 0.72, 0.45), u_dark);
  vec3 ground = mix(vec3(0.55, 0.52, 0.60), vec3(0.035, 0.030, 0.060), u_dark);

  float horizonY = 0.34;
  vec3 col = mix(horizon, middle, smoothstep(horizonY - 0.02, horizonY + 0.28, uv.y));
  col = mix(col, zenith, smoothstep(horizonY + 0.18, 1.0, uv.y));

  vec2 sun = vec2(0.74 * aspect, horizonY + 0.05 + 0.02 * sin(t * 0.018));
  float sd = length((p - sun) * vec2(0.8, 1.0));
  col += sunColor * (exp(-sd * 6.0) * 0.32 + exp(-sd * 38.0) * 0.45);

  float cloud = fbm(vec2(p.x * 1.3 + t * 0.008, p.y * 7.5 - t * 0.002), 5);
  float band = smoothstep(horizonY + 0.06, 0.62, uv.y) * (1.0 - smoothstep(0.7, 0.95, uv.y));
  vec3 cloudColor = mix(mix(vec3(1.0, 0.92, 0.9), vec3(0.98, 0.62, 0.52), u_dark), zenith, smoothstep(0.45, 0.9, uv.y));
  col = mix(col, cloudColor, smoothstep(0.1, 0.65, cloud) * band * 0.38);

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ridge = horizonY - 0.015 - 0.075 * fi
      + 0.06 * fbm(vec2(p.x * (0.9 + fi * 0.7) + fi * 13.7 + t * 0.0015 * (fi + 1.0), fi * 4.1), 5);
    float m = smoothstep(ridge + px, ridge - px, uv.y);
    col = mix(col, mix(horizon, ground, 0.45 + fi * 0.27), m);
  }

  col += (hash12(gl_FragCoord.xy + fract(t * 0.37) * 211.0) - 0.5) * 0.035;
  fragColor = vec4(dither(col), 1.0);
}`;

const CONTOURS = `${COMMON}
float field(vec2 p, float t) {
  vec2 warp = vec2(snoise(p * 0.55 + vec2(t, 0.0)), snoise(p * 0.55 + vec2(3.7, -t)));
  return fbm(p * 0.8 + warp * 0.3 + vec2(t * 0.2, -t * 0.1), 3);
}

void main() {
  vec2 p = gl_FragCoord.xy / u_res.y * 1.6;
  float t = u_time * 0.012;
  float v = field(p, t) * 9.0;
  float w = fwidth(v);
  float idx = floor(v + 0.5);
  float d = abs(fract(v + 0.5) - 0.5);
  float major = 1.0 - step(0.5, abs(mod(idx, 5.0)));
  float line = 1.0 - smoothstep(0.0, w * mix(1.0, 1.9, major), d);
  float alpha = line * mix(0.15, 0.36, major) * (1.0 - smoothstep(0.3, 0.6, w));

  vec3 paper = mix(vec3(1.0), vec3(0.071), u_dark);
  vec3 ink = mix(vec3(0.08), vec3(0.93), u_dark);
  fragColor = vec4(dither(mix(paper, ink, alpha)), 1.0);
}`;

const CONSTELLATION = `${COMMON}
vec2 starAt(vec2 cell, float t) {
  vec2 h = hash22(cell);
  return cell + 0.18 + 0.64 * h + 0.06 * vec2(sin(t * 0.11 + h.x * 6.28), cos(t * 0.09 + h.y * 6.28));
}

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

void main() {
  float cells = 6.5;
  /* star and line sizes are tuned for a ~700px tall canvas; small previews scale down */
  float scale = clamp(u_res.y / 700.0, 0.3, 1.6);
  float cellPx = u_res.y / cells;
  vec2 p = gl_FragCoord.xy / cellPx + vec2(u_time * 0.010, u_time * 0.004);
  vec2 base = floor(p);
  float stars = 0.0;
  float links = 0.0;
  vec2 forward[4] = vec2[4](vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0), vec2(1.0, -1.0));

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = base + vec2(float(x), float(y));
      vec2 s = starAt(cell, u_time);
      float h = hash12(cell + 3.7);
      float d = length(p - s) * cellPx;
      float size = (0.7 + 1.8 * h * h) * scale;
      float twinkle = 0.65 + 0.35 * sin(u_time * (0.35 + h * 0.6) + h * 40.0);
      stars += (smoothstep(size + 0.9, size - 0.6, d) + exp(-d * d / (size * 22.0 * scale)) * 0.35) * twinkle * (0.45 + 0.55 * h);
      for (int k = 0; k < 4; k++) {
        vec2 other = cell + forward[k];
        if (hash12(cell * 1.7 + other * 3.1) > 0.42) continue;
        vec2 o = starAt(other, u_time);
        float len = length(o - s);
        float sd = segment(p, s, o) * cellPx;
        float breathe = 0.55 + 0.45 * sin(u_time * 0.07 + h * 6.28);
        links += (1.0 - smoothstep(0.0, 0.9 * max(scale, 0.7), sd)) * (1.0 - smoothstep(0.75, 1.3, len)) * breathe;
      }
    }
  }

  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 bgDark = mix(vec3(0.035, 0.045, 0.085), vec3(0.012, 0.016, 0.035), uv.y);
  vec3 bg = mix(vec3(1.0), bgDark, u_dark);
  vec3 light = mix(vec3(0.08), vec3(0.93, 0.94, 1.0), u_dark);
  vec3 col = mix(bg, light, clamp(stars, 0.0, 1.0) * mix(0.75, 1.0, u_dark));
  col = mix(col, light, clamp(links, 0.0, 1.0) * mix(0.16, 0.22, u_dark));
  fragColor = vec4(dither(col), 1.0);
}`;

const PAPER = `${COMMON}
void main() {
  vec2 p = gl_FragCoord.xy;
  float fibre = fbm(vec2(p.x * 0.012, p.y * 0.05), 4) * 0.5 + fbm(p * 0.09, 2) * 0.5;
  vec3 paper = mix(vec3(1.0), vec3(0.071), u_dark);
  vec3 col = paper + fibre * mix(-0.012, 0.012, u_dark);
  fragColor = vec4(dither(col), 1.0);
}`;

export const SCENE_PROGRAMS: Record<SceneId, SceneProgram> = {
  aurora: { source: AURORA, resolution: 0.5, fps: 24, still: 140 },
  dusk: { source: DUSK, resolution: 0.6, fps: 15, still: 60 },
  contours: { source: CONTOURS, resolution: 1, fps: 20, still: 30 },
  constellation: { source: CONSTELLATION, resolution: 1, fps: 24, still: 80 },
  paper: { source: PAPER, resolution: 1, fps: 0, still: 0 },
};
