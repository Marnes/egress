/**
 * Small deterministic toolkit for baking surface maps in the browser: seeded
 * noise, colour maths, and canvas plumbing. Everything here is pure and
 * repeatable so a given theme always bakes byte-identical textures.
 */
import * as THREE from 'three';

export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;
export type Rgb = [number, number, number];

export function defaultCanvasFactory(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasSupported(): boolean {
  try {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false;
    return typeof document.createElement('canvas').getContext === 'function';
  } catch {
    return false;
  }
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-cell randomness, used to give every brick its own tone. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Value noise on a wrapping lattice. Independent periods per axis let a field
 * be stretched into vertical streaks (short X period, long Y period).
 */
export function noiseField(
  width: number,
  height: number,
  periodX: number,
  periodY: number,
  rng: () => number
): Float32Array {
  const px = Math.max(1, Math.round(periodX));
  const py = Math.max(1, Math.round(periodY));
  const lattice = new Float32Array(px * py);
  for (let i = 0; i < lattice.length; i += 1) lattice[i] = rng();

  // Lattice lookups depend only on the row or column, so resolve them once per
  // axis rather than per pixel — these loops run over millions of texels.
  const colA = new Int32Array(width);
  const colB = new Int32Array(width);
  const weightX = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    const gx = (x * px) / width;
    const cell = Math.floor(gx);
    const wrapped = ((cell % px) + px) % px;
    colA[x] = wrapped;
    colB[x] = (wrapped + 1) % px;
    weightX[x] = fade(gx - cell);
  }

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const gy = (y * py) / height;
    const cell = Math.floor(gy);
    const ty = fade(gy - cell);
    const rowA = ((((cell % py) + py) % py) * px) | 0;
    const rowB = ((((cell + 1) % py) + py) % py) * px;
    const offset = y * width;
    for (let x = 0; x < width; x += 1) {
      const a = colA[x];
      const b = colB[x];
      const tx = weightX[x];
      const topLeft = lattice[rowA + a];
      const bottomLeft = lattice[rowB + a];
      const top = topLeft + (lattice[rowA + b] - topLeft) * tx;
      const bottom = bottomLeft + (lattice[rowB + b] - bottomLeft) * tx;
      out[offset + x] = top + (bottom - top) * ty;
    }
  }
  return out;
}

/** Fractal sum of {@link noiseField} octaves, normalised to 0..1. */
export function fbm(
  width: number,
  height: number,
  periodX: number,
  periodY: number,
  octaves: number,
  rng: () => number,
  gain = 0.5
): Float32Array {
  const out = new Float32Array(width * height);
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const octaveX = periodX * 2 ** octave;
    const octaveY = periodY * 2 ** octave;
    // Past two pixels per lattice cell an octave only aliases, while its
    // lattice keeps growing. Always take the first one so `total` is non-zero.
    if (octave > 0 && (octaveX > width / 2 || octaveY > height / 2)) break;
    const layer = noiseField(width, height, octaveX, octaveY, rng);
    for (let i = 0; i < out.length; i += 1) out[i] += layer[i] * amplitude;
    total += amplitude;
    amplitude *= gain;
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= total;
  return out;
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16)
  ];
}

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 1) + 1) % 1;
  if (s <= 0) {
    const v = Math.round(clamp01(l) * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return [
    Math.round(clamp01(channel(hue + 1 / 3)) * 255),
    Math.round(clamp01(channel(hue)) * 255),
    Math.round(clamp01(channel(hue - 1 / 3)) * 255)
  ];
}

/** Shift a base colour in HSL space; the workhorse for per-brick variation. */
export function shift(
  base: Rgb,
  options: { hue?: number; saturation?: number; lightness?: number; saturationScale?: number } = {}
): Rgb {
  const [h, s, l] = rgbToHsl(base);
  const saturation = clamp01((s + (options.saturation ?? 0)) * (options.saturationScale ?? 1));
  return hslToRgb(h + (options.hue ?? 0), saturation, clamp01(l + (options.lightness ?? 0)));
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp01(t);
  return [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];
}

/** Per-pixel channels a surface generator fills before anything is rasterised. */
export type Channels = {
  width: number;
  height: number;
  /** Linear-ish sRGB bytes, RGBA. */
  color: Uint8ClampedArray;
  /** 0 = deepest recess, 1 = highest ridge. Baked into a normal map. */
  relief: Float32Array;
  /** 0 = mirror, 1 = fully diffuse. */
  rough: Float32Array;
  /** 0 = dielectric, 1 = bare metal. */
  metal: Float32Array;
};

export function createChannels(width: number, height: number): Channels {
  return {
    width,
    height,
    color: new Uint8ClampedArray(width * height * 4),
    relief: new Float32Array(width * height),
    rough: new Float32Array(width * height),
    metal: new Float32Array(width * height)
  };
}

function fillCanvas(
  factory: CanvasFactory,
  width: number,
  height: number,
  write: (data: Uint8ClampedArray) => void
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = factory(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas context is required to bake surfaces');
  const image = context.createImageData(width, height);
  write(image.data);
  context.putImageData(image, 0, 0);
  return { canvas, context };
}

/**
 * Canvases a generator may draw vector detail onto after the noise pass:
 * cracks, drips, scratches. Draw the same path on each so relief and
 * roughness stay in register with the albedo.
 */
export type Overlay = {
  color: CanvasRenderingContext2D;
  relief: CanvasRenderingContext2D;
  /** R = ambient occlusion (unused), G = roughness, B = metalness. */
  orm: CanvasRenderingContext2D;
};

export type BakedSurface = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  ormMap: THREE.Texture;
};

/** Rasterise channels into the three GPU maps, running vector overlays between. */
export function bakeChannels(
  channels: Channels,
  factory: CanvasFactory,
  options: { normalStrength?: number; overlay?: (overlay: Overlay) => void } = {}
): BakedSurface {
  const { width, height } = channels;
  const pixels = width * height;

  const color = fillCanvas(factory, width, height, (data) => data.set(channels.color));
  const relief = fillCanvas(factory, width, height, (data) => {
    for (let i = 0; i < pixels; i += 1) {
      const value = Math.round(clamp01(channels.relief[i]) * 255);
      data[i * 4] = value;
      data[i * 4 + 1] = value;
      data[i * 4 + 2] = value;
      data[i * 4 + 3] = 255;
    }
  });
  const orm = fillCanvas(factory, width, height, (data) => {
    for (let i = 0; i < pixels; i += 1) {
      data[i * 4] = 255;
      data[i * 4 + 1] = Math.round(clamp01(channels.rough[i]) * 255);
      data[i * 4 + 2] = Math.round(clamp01(channels.metal[i]) * 255);
      data[i * 4 + 3] = 255;
    }
  });

  options.overlay?.({ color: color.context, relief: relief.context, orm: orm.context });

  const reliefPixels = relief.context.getImageData(0, 0, width, height).data;
  const heights = new Float32Array(pixels);
  for (let i = 0; i < pixels; i += 1) heights[i] = reliefPixels[i * 4] / 255;
  const normal = fillCanvas(factory, width, height, (data) => {
    writeNormals(heights, width, height, options.normalStrength ?? 2.4, data);
  });

  return {
    map: createTexture(color.canvas, THREE.SRGBColorSpace),
    normalMap: createTexture(normal.canvas, THREE.NoColorSpace),
    ormMap: createTexture(orm.canvas, THREE.NoColorSpace)
  };
}

function writeNormals(
  heights: Float32Array,
  width: number,
  height: number,
  strength: number,
  out: Uint8ClampedArray
): void {
  const at = (x: number, y: number): number =>
    heights[(((y % height) + height) % height) * width + (((x % width) + width) % width)];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      // Canvas Y runs downward while the texture is sampled with flipY, so the
      // green channel keeps the canvas gradient sign (OpenGL tangent space).
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(-dx, dy, 1);
      const index = (y * width + x) * 4;
      out[index] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      out[index + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
      out[index + 2] = Math.round((1 / length) * 0.5 * 255 + 127.5);
      out[index + 3] = 255;
    }
  }
}

function createTexture(canvas: HTMLCanvasElement, colorSpace: string): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace as THREE.ColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Random polyline used for cracks, drips, and scratches. */
export function wanderPath(
  rng: () => number,
  start: [number, number],
  direction: number,
  length: number,
  segments: number,
  wander: number
): [number, number][] {
  const points: [number, number][] = [start];
  let angle = direction;
  let [x, y] = start;
  const step = length / segments;
  for (let i = 0; i < segments; i += 1) {
    angle += (rng() - 0.5) * wander;
    x += Math.cos(angle) * step;
    y += Math.sin(angle) * step;
    points.push([x, y]);
  }
  return points;
}

export function strokePath(
  context: CanvasRenderingContext2D,
  points: readonly [number, number][],
  style: string,
  lineWidth: number
): void {
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = style;
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) context.lineTo(points[i][0], points[i][1]);
  context.stroke();
  context.restore();
}

/**
 * A stain built from overlapping lobes. A single blot reads as a printed dot
 * once the tile repeats across a wall; a clustered one reads as a stain.
 */
export function smudge(
  context: CanvasRenderingContext2D,
  rng: () => number,
  x: number,
  y: number,
  radius: number,
  inner: string,
  lobes = 4
): void {
  for (let i = 0; i < lobes; i += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = rng() * radius * 0.7;
    blot(
      context,
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance,
      radius * (0.4 + rng() * 0.55),
      inner
    );
  }
}

/** Soft circular blot; the base ingredient of stains, blooms, and puddles. */
export function blot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  inner: string,
  outer = 'rgba(0,0,0,0)'
): void {
  const gradient = context.createRadialGradient(x, y, 0, x, y, Math.max(radius, 1));
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.24, inner);
  gradient.addColorStop(1, outer);
  context.save();
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, Math.max(radius, 1), 0, Math.PI * 2);
  context.fill();
  context.restore();
}
