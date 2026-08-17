/**
 * Procedural surface maps for the room shell and props: brickwork with damp
 * and efflorescence, poured-concrete slabs, and steel in various states of
 * rust. Every generator bakes an albedo, a normal map, and a packed
 * roughness/metalness map from seeded noise, so the room looks weathered
 * without shipping a single image file.
 */
import * as THREE from 'three';
import type { Palette } from '../types.js';
import {
  bakeChannels,
  canvasSupported,
  clamp01,
  createChannels,
  defaultCanvasFactory,
  fbm,
  hash2,
  hexToRgb,
  mix,
  mixRgb,
  mulberry32,
  shift,
  smoothstep,
  smudge,
  strokePath,
  wanderPath,
  type CanvasFactory,
  type Channels,
  type Overlay,
  type Rgb
} from './procedural.js';

export type SurfaceKind =
  | 'brick'
  | 'concreteFloor'
  | 'concreteCeiling'
  | 'concreteWall'
  | 'rustedSteel'
  | 'darkMetal'
  | 'paintedSteel'
  | 'paper';

export type Surface = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  ormMap: THREE.Texture;
  /** World size one texture tile covers, in metres, used to derive UV repeats. */
  tileM: [number, number];
  normalScale: number;
};

/**
 * Weathering that depends on where it sits in the room rather than on the
 * material — it tiles sideways but never vertically, so it is applied as a
 * band laid over the wall instead of being baked into the brick.
 */
export type DecalKind = 'damp' | 'soot' | 'puddle' | 'waterSheet';

export type Decal = {
  map: THREE.Texture;
  /** Horizontal world size of one tile. */
  tileM: number;
};

export type SurfaceKit = {
  get(kind: SurfaceKind): Surface | undefined;
  decal(kind: DecalKind): Decal | undefined;
  dispose(): void;
};

export type Recipe = {
  width: number;
  height: number;
  tileM: [number, number];
  normalScale: number;
  normalStrength: number;
  build(width: number, height: number, palette: Palette): Channels;
  overlay?(overlay: Overlay, width: number, height: number): void;
};

function writeColor(channels: Channels, index: number, rgb: Rgb): void {
  const offset = index * 4;
  channels.color[offset] = rgb[0];
  channels.color[offset + 1] = rgb[1];
  channels.color[offset + 2] = rgb[2];
  channels.color[offset + 3] = 255;
}

/* ------------------------------------------------------------------ brick */

function brick(width: number, height: number, palette: Palette): Channels {
  const channels = createChannels(width, height);
  const rng = mulberry32(0x42b17c);
  const grain = fbm(width, height, 160, 160, 4, rng);
  const patch = fbm(width, height, 10, 10, 4, rng);
  const jitter = fbm(width, height, 96, 96, 3, rng);
  const dampField = fbm(width, height, 5, 3, 4, rng);
  const streak = fbm(width, height, 110, 3, 4, rng);
  const bloom = fbm(width, height, 12, 9, 3, rng);
  const sootField = fbm(width, height, 6, 5, 3, rng);

  const cols = 10;
  const rows = 20;
  const cellW = width / cols;
  const cellH = height / rows;
  const jointX = cellW * 0.035;
  const jointY = cellH * 0.1;

  // Decades underground: the clay has gone brown and dusty, nothing like the
  // orange it was fired. The palette entry is only the starting point.
  const base = shift(hexToRgb(palette.wall), { saturationScale: 0.56, lightness: -0.07 });
  const mortarBase = shift(base, { saturationScale: 0.2, lightness: 0.06 });
  const soot: Rgb = [26, 24, 23];
  const dampTint = shift(base, { saturationScale: 0.35, lightness: -0.2 });
  const salt: Rgb = [222, 220, 210];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const row = Math.floor(y / cellH);
      const shifted = x + (row % 2 === 0 ? 0 : cellW / 2);
      const col = Math.floor(shifted / cellW);
      const u = shifted - col * cellW;
      const v = y - row * cellH;

      const wobble = (jitter[index] - 0.5) * cellH * 0.11;
      const toEdgeX = Math.min(u, cellW - u) - wobble;
      const toEdgeY = Math.min(v, cellH - v) - wobble;
      const rise = Math.min(
        smoothstep(jointX, jointX + cellW * 0.035, toEdgeX),
        smoothstep(jointY, jointY + cellH * 0.09, toEdgeY)
      );

      const id = ((col % cols) + cols) % cols;
      const tone = hash2(id, row, 1);
      const kiln = hash2(id, row, 2);
      const hue = hash2(id, row, 3);
      const face = shift(base, {
        lightness: (tone - 0.5) * 0.11 + (kiln < 0.16 ? -0.1 : 0) + (kiln > 0.9 ? 0.07 : 0),
        hue: (hue - 0.5) * 0.04,
        saturationScale: kiln < 0.16 ? 0.5 : 0.8 + tone * 0.35
      });

      // Weathering: faces are eaten back at the arris and blotchy in the middle.
      const wear = mix(0.78, 1.06, clamp01(grain[index] * 0.55 + patch[index] * 0.65));
      const arris = mix(0.82, 1, smoothstep(0, 0.45, rise));
      const brickColor = mixRgb(face, soot, clamp01((patch[index] - 0.72) * 1.6) * 0.35);
      const mortarColor = mixRgb(
        mortarBase,
        soot,
        clamp01(grain[index] * 0.4 + (1 - patch[index]) * 0.25) * 0.4
      );

      let rgb = mixRgb(mortarColor, brickColor, rise);
      rgb = [rgb[0] * wear * arris, rgb[1] * wear * arris, rgb[2] * wear * arris];

      let relief = mix(0.24 + grain[index] * 0.12, 0.82 + grain[index] * 0.1, rise);
      let rough = mix(0.97, 0.86 - grain[index] * 0.08, rise);

      // Soot, damp, and salt bloom are kept statistically even across the tile:
      // any vertical bias here would band once the tile repeats up a wall.
      // Height-driven weathering is applied per wall by the shell instead.
      const grime = clamp01((sootField[index] - 0.44) * 1.7);
      const damp = clamp01((dampField[index] * 0.7 + streak[index] * 0.55 - 0.6) * 2.6);
      const efflorescence = clamp01((bloom[index] - 0.66) * 3.2) * (1 - damp * 0.8);

      rgb = mixRgb(rgb, soot, grime * 0.5);
      rgb = mixRgb(rgb, dampTint, damp * 0.5);
      rgb = mixRgb(rgb, salt, efflorescence * 0.66);
      rough = clamp01(rough - damp * 0.3 + efflorescence * 0.04 + grime * 0.02);
      relief = clamp01(relief + efflorescence * 0.05);

      writeColor(channels, index, rgb);
      channels.relief[index] = relief;
      channels.rough[index] = rough;
      channels.metal[index] = 0;
    }
  }
  return channels;
}

function brickOverlay(overlay: Overlay, width: number, height: number): void {
  const rng = mulberry32(0x9f21a);

  // Water tracks bleeding down out of the joints.
  for (let i = 0; i < 14; i += 1) {
    const x = rng() * width;
    const top = height * (0.08 + rng() * 0.35);
    const run = height * (0.2 + rng() * 0.5);
    const path = wanderPath(rng, [x, top], Math.PI / 2, run, 10, 0.16);
    const alpha = 0.1 + rng() * 0.16;
    strokePath(overlay.color, path, `rgba(34,30,27,${alpha.toFixed(3)})`, 3 + rng() * 9);
    strokePath(overlay.orm, path, `rgba(255,120,0,${(alpha * 1.4).toFixed(3)})`, 3 + rng() * 9);
  }

  // Hairline cracks stepping through the bond, plus a few spalled faces.
  for (let i = 0; i < 5; i += 1) {
    const path = wanderPath(
      rng,
      [width * (0.1 + rng() * 0.8), height * (0.15 + rng() * 0.7)],
      Math.PI / 2 + (rng() - 0.5) * 1.2,
      height * (0.14 + rng() * 0.26),
      12,
      0.9
    );
    strokePath(overlay.color, path, 'rgba(18,16,15,0.5)', 1.6);
    strokePath(overlay.relief, path, 'rgba(0,0,0,0.65)', 1.8);
    strokePath(overlay.orm, path, 'rgba(255,255,0,0.45)', 1.8);
  }
  for (let i = 0; i < 11; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const radius = 6 + rng() * 15;
    smudge(overlay.color, mulberry32(i * 257 + 11), x, y, radius, 'rgba(46,38,33,0.2)', 4);
    smudge(overlay.relief, mulberry32(i * 257 + 11), x, y, radius, 'rgba(0,0,0,0.28)', 4);
  }

  // Salt bloom crusting out of the lower courses.
  for (let i = 0; i < 12; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const radius = 16 + rng() * 40;
    smudge(overlay.color, mulberry32(i * 181 + 23), x, y, radius, 'rgba(224,221,210,0.12)', 5);
    smudge(overlay.orm, mulberry32(i * 181 + 23), x, y, radius, 'rgba(255,255,0,0.16)', 5);
  }
}

/* --------------------------------------------------------------- concrete */

function concreteBase(
  width: number,
  height: number,
  base: Rgb,
  options: { aggregate: number; mottle: number; seed: number; roughness: number }
): { channels: Channels; blotch: Float32Array; grain: Float32Array } {
  const channels = createChannels(width, height);
  const rng = mulberry32(options.seed);
  const grain = fbm(width, height, 200, 200, 3, rng);
  const blotch = fbm(width, height, 7, 7, 4, rng);
  const stain = fbm(width, height, 4, 4, 3, rng);
  const speck = fbm(width, height, 220, 220, 2, rng);
  const dirt: Rgb = [38, 34, 30];

  for (let i = 0; i < width * height; i += 1) {
    const mottle = mix(1 - options.mottle, 1 + options.mottle, blotch[i]);
    let rgb: Rgb = [base[0] * mottle, base[1] * mottle, base[2] * mottle];

    // Exposed aggregate: pale chips of stone sitting proud of the screed.
    const chip = clamp01((speck[i] - 0.62) * 4) * options.aggregate;
    rgb = mixRgb(rgb, shift(base, { lightness: 0.16, saturationScale: 0.5 }), chip);
    rgb = mixRgb(rgb, dirt, clamp01((stain[i] - 0.55) * 1.6) * 0.3);

    writeColor(channels, i, rgb);
    channels.relief[i] = clamp01(0.5 + (blotch[i] - 0.5) * 0.25 + grain[i] * 0.12 + chip * 0.2);
    channels.rough[i] = clamp01(options.roughness + grain[i] * 0.06 - chip * 0.08);
    channels.metal[i] = 0;
  }
  return { channels, blotch, grain };
}

function concreteFloor(width: number, height: number, palette: Palette): Channels {
  const base = hexToRgb(palette.floor);
  const { channels } = concreteBase(width, height, base, {
    aggregate: 0.6,
    mottle: 0.22,
    seed: 0x5c0f10,
    roughness: 0.9
  });
  return channels;
}

function concreteFloorOverlay(overlay: Overlay, width: number, height: number): void {
  const rng = mulberry32(0x11ab3);

  // Oil and coolant: dark, glossy, and soaked into the slab. Kept irregular and
  // low-contrast so the 2.4 m tile does not read as a pattern of dots.
  for (let i = 0; i < 5; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const radius = 26 + rng() * 60;
    const alpha = (0.09 + rng() * 0.13).toFixed(3);
    smudge(overlay.color, mulberry32(i * 977 + 13), x, y, radius, `rgba(26,21,17,${alpha})`, 5);
    smudge(overlay.orm, mulberry32(i * 977 + 13), x, y, radius, 'rgba(255,110,30,0.22)', 5);
  }

  // Shrinkage cracks with grit worked into them.
  for (let i = 0; i < 9; i += 1) {
    const path = wanderPath(
      rng,
      [rng() * width, rng() * height],
      rng() * Math.PI * 2,
      60 + rng() * 190,
      16,
      0.8
    );
    strokePath(overlay.color, path, 'rgba(20,18,16,0.55)', 1.2 + rng() * 1.6);
    strokePath(overlay.relief, path, 'rgba(0,0,0,0.8)', 1.4 + rng() * 1.4);
    strokePath(overlay.orm, path, 'rgba(255,255,0,0.5)', 1.6);
  }

  // Scuffs and drag marks from whatever used to stand here.
  for (let i = 0; i < 16; i += 1) {
    const path = wanderPath(rng, [rng() * width, rng() * height], rng() * Math.PI * 2, 30 + rng() * 90, 5, 0.25);
    strokePath(overlay.color, path, `rgba(200,196,186,${(0.05 + rng() * 0.1).toFixed(3)})`, 1 + rng() * 3);
  }

  // Rust rings where something metal sat in a puddle.
  for (let i = 0; i < 3; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const radius = 12 + rng() * 26;
    overlay.color.save();
    overlay.color.strokeStyle = 'rgba(122,68,34,0.22)';
    overlay.color.lineWidth = 2 + rng() * 3;
    overlay.color.beginPath();
    overlay.color.arc(x, y, radius, 0, Math.PI * 2);
    overlay.color.stroke();
    overlay.color.restore();
  }
}

function concreteCeiling(width: number, height: number, palette: Palette): Channels {
  const base = hexToRgb(palette.ceiling);
  const { channels } = concreteBase(width, height, base, {
    aggregate: 0.24,
    mottle: 0.13,
    seed: 0x7d2244,
    roughness: 0.94
  });
  return channels;
}

function concreteCeilingOverlay(overlay: Overlay, width: number, height: number): void {
  const rng = mulberry32(0x3ac71);
  const boards = 6;

  // Board marks left by the shuttering the slab was poured against.
  for (let i = 0; i < boards; i += 1) {
    const y = (i / boards) * height;
    strokePath(overlay.color, [[0, y], [width, y]], 'rgba(30,28,26,0.3)', 2.4);
    strokePath(overlay.relief, [[0, y], [width, y]], 'rgba(0,0,0,0.55)', 3);
    strokePath(overlay.color, [[0, y + 2.5], [width, y + 2.5]], 'rgba(232,228,220,0.12)', 1.4);
  }

  // Water finding its way through: brown-edged stains and lime leaching.
  for (let i = 0; i < 4; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const radius = 30 + rng() * 60;
    smudge(overlay.color, mulberry32(i * 613 + 7), x, y, radius, 'rgba(96,66,40,0.1)', 5);
    smudge(overlay.color, mulberry32(i * 613 + 7), x, y, radius * 0.6, 'rgba(58,44,32,0.11)', 4);
    smudge(overlay.orm, mulberry32(i * 613 + 7), x, y, radius, 'rgba(255,215,0,0.18)', 5);
  }

  // Spalled patches where the cover has come away.
  for (let i = 0; i < 5; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const radius = 7 + rng() * 16;
    smudge(overlay.color, mulberry32(i * 331 + 5), x, y, radius, 'rgba(52,46,40,0.2)', 3);
    smudge(overlay.relief, mulberry32(i * 331 + 5), x, y, radius, 'rgba(0,0,0,0.35)', 3);
  }
}

function concreteWall(width: number, height: number, palette: Palette): Channels {
  const base = hexToRgb(palette.structure);
  const { channels } = concreteBase(width, height, base, {
    aggregate: 0.2,
    mottle: 0.12,
    seed: 0x2211fe,
    roughness: 0.88
  });
  return channels;
}

function concreteWallOverlay(overlay: Overlay, width: number, height: number): void {
  const rng = mulberry32(0x60d1e);
  for (let i = 0; i < 7; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const radius = 12 + rng() * 26;
    smudge(overlay.color, mulberry32(i * 419 + 3), x, y, radius, 'rgba(40,36,32,0.11)', 4);
    smudge(overlay.relief, mulberry32(i * 419 + 3), x, y, radius, 'rgba(0,0,0,0.14)', 4);
  }
  for (let i = 0; i < 12; i += 1) {
    const path = wanderPath(rng, [rng() * width, rng() * height], rng() * Math.PI * 2, 20 + rng() * 70, 6, 0.5);
    strokePath(overlay.color, path, `rgba(22,20,18,${(0.15 + rng() * 0.2).toFixed(3)})`, 1 + rng() * 2);
  }
}

/* ------------------------------------------------------------------ metal */

type SteelOptions = {
  seed: number;
  base: Rgb;
  /** Threshold on the rust field; lower means more of the surface has gone. */
  corrosion: number;
  /** How far rust bleeds downhill from where it starts. */
  weep: number;
  cleanMetalness: number;
  cleanRoughness: number;
};

const RUST_DEEP: Rgb = [72, 38, 22];
const RUST_MID: Rgb = [128, 66, 30];
const RUST_BRIGHT: Rgb = [168, 96, 42];

function steel(width: number, height: number, options: SteelOptions): Channels {
  const channels = createChannels(width, height);
  const rng = mulberry32(options.seed);
  const bloom = fbm(width, height, 6, 6, 4, rng);
  const fleck = fbm(width, height, 120, 120, 3, rng);
  const weep = fbm(width, height, 70, 5, 4, rng);
  const grime = fbm(width, height, 9, 9, 3, rng);
  const mill = fbm(width, height, 5, 160, 2, rng);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;

      // Rust starts as blooms, then weeps downward in streaks. The streaks
      // carry the direction; no vertical ramp, or the tile would band.
      const seedField = bloom[index] * 0.72 + fleck[index] * 0.28;
      const patches = clamp01((seedField - options.corrosion) * 4.2);
      const runs = clamp01((weep[index] - 0.52) * 3) * options.weep * (0.4 + patches);
      const rust = clamp01(patches + runs * 0.7);

      const rustColor = mixRgb(
        mixRgb(RUST_DEEP, RUST_MID, clamp01(fleck[index] * 1.5)),
        RUST_BRIGHT,
        clamp01((bloom[index] - 0.45) * 2)
      );

      // Rolled steel keeps a faint directional sheen under the grime.
      const sheen = mix(0.95, 1.05, mill[index]);
      let rgb: Rgb = [options.base[0] * sheen, options.base[1] * sheen, options.base[2] * sheen];
      rgb = mixRgb(rgb, [30, 28, 26], clamp01((grime[index] - 0.48) * 1.8) * 0.35);
      rgb = mixRgb(rgb, rustColor, rust);

      writeColor(channels, index, rgb);
      channels.relief[index] = clamp01(0.62 + (fleck[index] - 0.5) * 0.1 - rust * 0.32 * fleck[index] - patches * 0.12);
      channels.rough[index] = clamp01(mix(options.cleanRoughness, 0.95, rust) + grime[index] * 0.06);
      channels.metal[index] = clamp01(mix(options.cleanMetalness, 0.04, rust));
    }
  }
  return channels;
}

function scratchOverlay(seed: number, count: number, brightness: number) {
  return (overlay: Overlay, width: number, height: number): void => {
    const rng = mulberry32(seed);
    for (let i = 0; i < count; i += 1) {
      const path = wanderPath(rng, [rng() * width, rng() * height], rng() * Math.PI * 2, 25 + rng() * 120, 6, 0.16);
      strokePath(overlay.color, path, `rgba(226,224,220,${(brightness * (0.3 + rng() * 0.7)).toFixed(3)})`, 0.8 + rng() * 1.4);
      strokePath(overlay.orm, path, 'rgba(255,90,220,0.35)', 1);
    }
    // Weld seams and drip trails: dark, pitted, and slightly proud.
    for (let i = 0; i < Math.round(count / 3); i += 1) {
      const x = rng() * width;
      const y = rng() * height;
      const radius = 4 + rng() * 12;
      smudge(overlay.color, mulberry32(i * 149 + seed), x, y, radius, 'rgba(74,40,22,0.28)', 3);
      smudge(overlay.relief, mulberry32(i * 149 + seed), x, y, radius, 'rgba(0,0,0,0.22)', 3);
      smudge(overlay.orm, mulberry32(i * 149 + seed), x, y, radius, 'rgba(255,240,10,0.4)', 3);
    }
  };
}

function rustedSteel(width: number, height: number, palette: Palette): Channels {
  return steel(width, height, {
    seed: 0xb17ea,
    base: hexToRgb(palette.metal),
    corrosion: 0.46,
    weep: 0.9,
    cleanMetalness: 0.72,
    cleanRoughness: 0.42
  });
}

function darkMetal(width: number, height: number, palette: Palette): Channels {
  return steel(width, height, {
    seed: 0x3d0c91,
    // Equipment cabinets and conduit are painted a good deal darker than the
    // palette entry, which has to stay light enough to carry ink legibly.
    base: shift(hexToRgb(palette.metalDark), { lightness: -0.17, saturationScale: 0.55 }),
    corrosion: 0.62,
    weep: 0.5,
    cleanMetalness: 0.6,
    cleanRoughness: 0.55
  });
}

function paintedSteel(width: number, height: number, palette: Palette): Channels {
  const channels = createChannels(width, height);
  const rng = mulberry32(0x7ea01c);
  const chipField = fbm(width, height, 14, 14, 4, rng);
  const fleck = fbm(width, height, 130, 130, 3, rng);
  const weep = fbm(width, height, 60, 4, 4, rng);
  const wear = fbm(width, height, 8, 8, 3, rng);

  const paint = shift(hexToRgb(palette.metal), { saturationScale: 0.7, lightness: -0.08 });
  const primer = shift(hexToRgb(palette.metal), { lightness: -0.26, saturationScale: 0.4 });
  const paintRust: Rgb = [92, 54, 34];
  const paintRustBright: Rgb = [126, 76, 42];

  for (let y = 0; y < height; y += 1) {
    const vertical = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;

      // Paint fails from the bottom edge up, and wherever it was knocked.
      const skirt = smoothstep(0.68, 1, vertical);
      const chipped = clamp01((chipField[index] + skirt * 0.4 + fleck[index] * 0.12 - 0.72) * 4.5);
      const bleed = clamp01((weep[index] - 0.58) * 3) * smoothstep(0.3, 1, vertical) * 0.7;
      const rust = clamp01(chipped * 0.75 + bleed * 0.45);

      let rgb = mixRgb(paint, [24, 23, 22], clamp01((wear[index] - 0.5) * 1.4) * 0.26);
      rgb = mixRgb(rgb, primer, clamp01(chipped * 1.4) * 0.55);
      rgb = mixRgb(rgb, mixRgb(paintRust, paintRustBright, fleck[index]), rust * 0.85);

      writeColor(channels, index, rgb);
      channels.relief[index] = clamp01(0.7 - chipped * 0.3 + (fleck[index] - 0.5) * 0.08);
      channels.rough[index] = clamp01(mix(0.52, 0.94, rust) + wear[index] * 0.08);
      channels.metal[index] = clamp01(mix(0.24, 0.05, rust));
    }
  }
  return channels;
}


/* ------------------------------------------------------------------ paper */

/**
 * Aged drawing paper. Unlike the rest of these, it takes nothing from the
 * palette: a document is not one of the room's surfaces, and its colour is a
 * property of the paper stock rather than of the building.
 */
function paper(width: number, height: number): Channels {
  const channels = createChannels(width, height);
  const rng = mulberry32(0x9a17c3);
  // Laid paper has a directional fibre; the long, thin period gives it a grain.
  const fibre = fbm(width, height, 210, 34, 3, rng);
  const tooth = fbm(width, height, 150, 150, 3, rng);
  const mottle = fbm(width, height, 6, 6, 4, rng);
  const damp = fbm(width, height, 3, 4, 3, rng);

  const stock: Rgb = [206, 191, 152];
  const shade: Rgb = [150, 133, 98];
  const foxed: Rgb = [126, 92, 48];

  for (let y = 0; y < height; y += 1) {
    const vertical = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const horizontal = x / (width - 1);

      // Handling grime: paper darkens at the edges long before the middle.
      const toEdge = Math.min(horizontal, 1 - horizontal, vertical, 1 - vertical);
      const handled = 1 - smoothstep(0, 0.16, toEdge);

      let rgb = mixRgb(stock, shade, clamp01((mottle[index] - 0.42) * 1.1) * 0.5);
      rgb = mixRgb(rgb, foxed, clamp01((damp[index] - 0.62) * 2.2) * 0.32);
      rgb = mixRgb(rgb, shade, handled * 0.42);
      const grain = mix(0.94, 1.06, fibre[index] * 0.65 + tooth[index] * 0.35);
      rgb = [rgb[0] * grain, rgb[1] * grain, rgb[2] * grain];

      writeColor(channels, index, rgb);
      // Tooth, not relief: paper is nearly flat, and a strong normal map on it
      // reads as fabric.
      channels.relief[index] = clamp01(0.5 + (tooth[index] - 0.5) * 0.35 + (fibre[index] - 0.5) * 0.2);
      channels.rough[index] = clamp01(0.93 - handled * 0.1 + tooth[index] * 0.05);
      channels.metal[index] = 0;
    }
  }
  return channels;
}

function paperOverlay(overlay: Overlay, width: number, height: number): void {
  const rng = mulberry32(0x4d10b);

  // Folded in three and carried in a pocket: two creases, dirty along the line.
  for (const at of [0.34, 0.68]) {
    const y = height * at;
    const path = wanderPath(rng, [0, y], 0, width, 9, 0.03);
    strokePath(overlay.color, path, 'rgba(120,104,74,0.34)', 2.6);
    strokePath(overlay.relief, path, 'rgba(255,255,255,0.5)', 2);
    strokePath(overlay.color, path.map(([px, py]) => [px, py + 2] as [number, number]), 'rgba(238,230,205,0.3)', 1.6);
  }

  // Thumbed corners and a ring off the bottom of a mug.
  for (let index = 0; index < 5; index += 1) {
    smudge(
      overlay.color,
      mulberry32(index * 733 + 19),
      rng() * width,
      rng() * height,
      width * (0.04 + rng() * 0.06),
      'rgba(122,96,58,0.13)',
      5
    );
  }
  const ringX = width * (0.24 + rng() * 0.5);
  const ringY = height * (0.55 + rng() * 0.3);
  overlay.color.save();
  overlay.color.strokeStyle = 'rgba(126,88,44,0.2)';
  overlay.color.lineWidth = width * 0.012;
  overlay.color.beginPath();
  overlay.color.arc(ringX, ringY, width * 0.13, 0, Math.PI * 2);
  overlay.color.stroke();
  overlay.color.restore();
}

/* ------------------------------------------------------------------- kit */

/** Exported so the noise passes can be inspected and tested without a canvas. */
export const SURFACE_RECIPES: Record<SurfaceKind, Recipe> = {
  brick: {
    width: 1024,
    height: 1024,
    // Eight 270mm bricks across, sixteen 85mm courses down.
    // Ten 270 mm bricks across, twenty 85 mm courses down.
    tileM: [2.7, 1.7],
    normalScale: 1,
    normalStrength: 3,
    build: brick,
    overlay: brickOverlay
  },
  concreteFloor: {
    width: 512,
    height: 512,
    tileM: [2.4, 2.4],
    normalScale: 0.8,
    normalStrength: 2.6,
    build: concreteFloor,
    overlay: concreteFloorOverlay
  },
  concreteCeiling: {
    width: 512,
    height: 512,
    tileM: [2, 2],
    normalScale: 0.85,
    normalStrength: 2.6,
    build: concreteCeiling,
    overlay: concreteCeilingOverlay
  },
  concreteWall: {
    width: 512,
    height: 512,
    tileM: [1.6, 1.6],
    normalScale: 0.7,
    normalStrength: 2.4,
    build: concreteWall,
    overlay: concreteWallOverlay
  },
  rustedSteel: {
    width: 512,
    height: 512,
    tileM: [0.7, 0.7],
    normalScale: 0.9,
    normalStrength: 3,
    build: rustedSteel,
    overlay: scratchOverlay(0x51ab7, 18, 0.25)
  },
  darkMetal: {
    width: 512,
    height: 512,
    tileM: [0.6, 0.6],
    normalScale: 0.75,
    normalStrength: 2.6,
    build: darkMetal,
    overlay: scratchOverlay(0x9cc12, 14, 0.2)
  },
  paintedSteel: {
    width: 512,
    height: 512,
    // Sized to a door leaf so the rust creeping up from the threshold lands
    // once, at the bottom, instead of repeating up the slab.
    tileM: [1, 2.2],
    normalScale: 0.85,
    normalStrength: 2.8,
    build: paintedSteel,
    overlay: scratchOverlay(0x2ff81, 20, 0.3)
  },
  paper: {
    width: 384,
    height: 512,
    // One tile per sheet: the printout supplies the albedo over the top, and
    // the two have to share a single set of UVs.
    tileM: [0.5, 0.72],
    normalScale: 0.35,
    normalStrength: 1.1,
    build: (width, height) => paper(width, height),
    overlay: paperOverlay
  }
};

type DecalRecipe = {
  size: number;
  tileM: number;
  /**
   * `band` fades from one edge and tiles sideways; `pool` is a single ragged
   * blot that fades to nothing at every edge and does not tile at all;
   * `streak` is filaments running along x, tiling both ways so it can be
   * scrolled to make water move.
   */
  shape: 'band' | 'pool' | 'streak';
  /** Band only: which edge is opaque, 1 = the bottom, 0 = the top. */
  anchor: 0 | 1;
  seed: number;
  strength: number;
  tint(palette: Palette): Rgb;
};

const DECAL_RECIPES: Record<DecalKind, DecalRecipe> = {
  // Falling water: threads of it, with the gaps between them. Scrolled along
  // its own length by whatever draws it.
  waterSheet: {
    size: 256,
    tileM: 0.4,
    shape: 'streak',
    anchor: 1,
    seed: 0x2c9f1,
    strength: 1,
    tint: () => [212, 231, 234]
  },
  // Standing water: dark, ragged at the rim, and thin enough to read the slab
  // through it.
  puddle: {
    size: 384,
    tileM: 1,
    shape: 'pool',
    anchor: 1,
    seed: 0x9ab31,
    strength: 0.8,
    tint: () => [21, 24, 24]
  },
  // Rising damp: dark, wet, and heaviest where the brick meets the slab.
  damp: {
    size: 512,
    tileM: 2.6,
    shape: 'band',
    anchor: 1,
    seed: 0x1ac4d,
    strength: 0.9,
    tint: (palette) => shift(hexToRgb(palette.wall), { saturationScale: 0.3, lightness: -0.34 })
  },
  // Decades of dust and fumes collecting against the soffit.
  soot: {
    size: 512,
    tileM: 3.2,
    shape: 'band',
    anchor: 0,
    seed: 0x77e10,
    strength: 0.38,
    tint: () => [30, 27, 25]
  }
};

function bakeDecal(recipe: DecalRecipe, palette: Palette, factory: CanvasFactory): Decal {
  const size = recipe.size;
  const rng = mulberry32(recipe.seed);
  const edge =
    recipe.shape === 'streak'
      ? fbm(size, size, 12, 30, 3, rng)
      : fbm(size, size, 7, 3, 4, rng);
  const body = fbm(size, size, 12, 12, 4, rng);
  const runs = fbm(size, size, 90, 4, 3, rng);
  const rim = fbm(size, size, 4, 4, 2, mulberry32((recipe.seed ^ 0x51f3) >>> 0));
  const tint = recipe.tint(palette);

  const canvas = factory(size, size);
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas context is required to bake decals');
  const image = context.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    const along = recipe.anchor === 1 ? y / (size - 1) : 1 - y / (size - 1);
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      let alpha: number;
      if (recipe.shape === 'streak') {
        // Filaments along x, broken up by blobs travelling with the flow.
        const thread = smoothstep(0.44, 0.72, edge[index]);
        alpha = thread * mix(0.45, 1, body[index]) * recipe.strength;
      } else if (recipe.shape === 'pool') {
        // Radial falloff with a slow wandering rim: water finds a smooth
        // outline, so the noise has to be low frequency or it reads as fur.
        const dx = x / (size - 1) - 0.5;
        const dy = y / (size - 1) - 0.5;
        const reach = 0.4 + (rim[index] - 0.5) * 0.13;
        alpha =
          (1 - smoothstep(reach * 0.82, reach, Math.hypot(dx, dy))) *
          recipe.strength *
          mix(0.93, 1, body[index]);
      } else {
        // A ragged tide line: the fade point wanders with the noise, and
        // streaks reach further up where water has run.
        const crest = 0.28 + edge[index] * 0.5 - runs[index] * 0.18;
        alpha =
          smoothstep(crest, Math.min(crest + 0.42, 1), along) *
          recipe.strength *
          mix(0.55, 1, body[index]);
      }
      const offset = index * 4;
      image.data[offset] = tint[0];
      image.data[offset + 1] = tint[1];
      image.data[offset + 2] = tint[2];
      image.data[offset + 3] = Math.round(clamp01(alpha) * 255);
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = recipe.shape === 'pool' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.wrapT = recipe.shape === 'streak' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return { map: texture, tileM: recipe.tileM };
}

const EMPTY_KIT: SurfaceKit = { get: () => undefined, decal: () => undefined, dispose: () => {} };

/**
 * Lazily bakes and caches the surface set for a palette. Returns a no-op kit
 * when there is no canvas (tests, SSR), so callers can stay unconditional.
 */
export function createSurfaceKit(palette: Palette, factory?: CanvasFactory): SurfaceKit {
  const createCanvas = factory ?? (canvasSupported() ? defaultCanvasFactory : undefined);
  if (!createCanvas) return EMPTY_KIT;

  const cache = new Map<SurfaceKind, Surface | null>();
  const decals = new Map<DecalKind, Decal | null>();
  return {
    decal(kind) {
      const cached = decals.get(kind);
      if (cached !== undefined) return cached ?? undefined;
      let decal: Decal | null = null;
      try {
        decal = bakeDecal(DECAL_RECIPES[kind], palette, createCanvas);
      } catch {
        decal = null;
      }
      decals.set(kind, decal);
      return decal ?? undefined;
    },
    get(kind) {
      const cached = cache.get(kind);
      if (cached !== undefined) return cached ?? undefined;
      const recipe = SURFACE_RECIPES[kind];
      let surface: Surface | null = null;
      try {
        const baked = bakeChannels(recipe.build(recipe.width, recipe.height, palette), createCanvas, {
          normalStrength: recipe.normalStrength,
          overlay: recipe.overlay && ((overlay) => recipe.overlay!(overlay, recipe.width, recipe.height))
        });
        surface = { ...baked, tileM: recipe.tileM, normalScale: recipe.normalScale };
      } catch {
        surface = null;
      }
      cache.set(kind, surface);
      return surface ?? undefined;
    },
    dispose() {
      for (const surface of cache.values()) {
        if (!surface) continue;
        surface.map.dispose();
        surface.normalMap.dispose();
        surface.ormMap.dispose();
      }
      for (const decal of decals.values()) decal?.map.dispose();
      cache.clear();
      decals.clear();
    }
  };
}
