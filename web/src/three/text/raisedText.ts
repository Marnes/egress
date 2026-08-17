/**
 * Extruded lettering built from a stroke font, for signage that is modelled
 * rather than painted on — raised type that catches light and casts its own
 * shadow, the way a printed or cast nameplate does.
 *
 * three ships no typeface with the package, so glyphs are defined here as
 * strokes on a unit grid (x and y in cap heights, baseline at y = 0) and each
 * stroke is extruded as a rounded-cap bar.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Stroke = readonly [number, number, number, number];

const GLYPHS: Record<string, readonly Stroke[]> = {
  A: [[0.03, 0, 0.5, 1], [0.5, 1, 0.97, 0], [0.19, 0.32, 0.81, 0.32]],
  B: [
    [0, 0, 0, 1], [0, 1, 0.7, 1], [0.7, 1, 0.86, 0.86], [0.86, 0.86, 0.86, 0.68],
    [0.86, 0.68, 0.7, 0.54], [0.7, 0.54, 0, 0.54], [0.7, 0.54, 0.9, 0.38],
    [0.9, 0.38, 0.9, 0.16], [0.9, 0.16, 0.74, 0], [0.74, 0, 0, 0]
  ],
  C: [
    [0.95, 0.8, 0.72, 1], [0.72, 1, 0.28, 1], [0.28, 1, 0.05, 0.78],
    [0.05, 0.78, 0.05, 0.22], [0.05, 0.22, 0.28, 0], [0.28, 0, 0.72, 0], [0.72, 0, 0.95, 0.2]
  ],
  D: [[0, 0, 0, 1], [0, 1, 0.6, 1], [0.6, 1, 0.92, 0.72], [0.92, 0.72, 0.92, 0.28], [0.92, 0.28, 0.6, 0], [0.6, 0, 0, 0]],
  E: [[0, 0, 0, 1], [0, 1, 0.88, 1], [0, 0.52, 0.68, 0.52], [0, 0, 0.88, 0]],
  F: [[0, 0, 0, 1], [0, 1, 0.88, 1], [0, 0.52, 0.68, 0.52]],
  G: [
    [0.95, 0.8, 0.72, 1], [0.72, 1, 0.28, 1], [0.28, 1, 0.05, 0.78], [0.05, 0.78, 0.05, 0.22],
    [0.05, 0.22, 0.28, 0], [0.28, 0, 0.72, 0], [0.72, 0, 0.95, 0.22], [0.95, 0.22, 0.95, 0.46],
    [0.95, 0.46, 0.55, 0.46]
  ],
  H: [[0, 0, 0, 1], [0.92, 0, 0.92, 1], [0, 0.52, 0.92, 0.52]],
  I: [[0.5, 0, 0.5, 1]],
  J: [[0.85, 1, 0.85, 0.24], [0.85, 0.24, 0.62, 0], [0.62, 0, 0.3, 0], [0.3, 0, 0.08, 0.22]],
  K: [[0, 0, 0, 1], [0, 0.42, 0.88, 1], [0, 0.42, 0.9, 0]],
  L: [[0, 1, 0, 0], [0, 0, 0.86, 0]],
  M: [[0, 0, 0, 1], [0, 1, 0.5, 0.42], [0.5, 0.42, 1, 1], [1, 1, 1, 0]],
  N: [[0, 0, 0, 1], [0, 1, 0.92, 0], [0.92, 0, 0.92, 1]],
  O: [
    [0.28, 1, 0.72, 1], [0.72, 1, 0.95, 0.78], [0.95, 0.78, 0.95, 0.22], [0.95, 0.22, 0.72, 0],
    [0.72, 0, 0.28, 0], [0.28, 0, 0.05, 0.22], [0.05, 0.22, 0.05, 0.78], [0.05, 0.78, 0.28, 1]
  ],
  P: [[0, 0, 0, 1], [0, 1, 0.72, 1], [0.72, 1, 0.9, 0.82], [0.9, 0.82, 0.9, 0.66], [0.9, 0.66, 0.72, 0.48], [0.72, 0.48, 0, 0.48]],
  Q: [
    [0.28, 1, 0.72, 1], [0.72, 1, 0.95, 0.78], [0.95, 0.78, 0.95, 0.22], [0.95, 0.22, 0.72, 0],
    [0.72, 0, 0.28, 0], [0.28, 0, 0.05, 0.22], [0.05, 0.22, 0.05, 0.78], [0.05, 0.78, 0.28, 1],
    [0.62, 0.3, 1, -0.02]
  ],
  R: [
    [0, 0, 0, 1], [0, 1, 0.72, 1], [0.72, 1, 0.9, 0.82], [0.9, 0.82, 0.9, 0.66],
    [0.9, 0.66, 0.72, 0.48], [0.72, 0.48, 0, 0.48], [0.42, 0.48, 0.92, 0]
  ],
  S: [
    [0.93, 0.82, 0.7, 1], [0.7, 1, 0.3, 1], [0.3, 1, 0.07, 0.8], [0.07, 0.8, 0.07, 0.68],
    [0.07, 0.68, 0.3, 0.52], [0.3, 0.52, 0.68, 0.52], [0.68, 0.52, 0.92, 0.34],
    [0.92, 0.34, 0.92, 0.2], [0.92, 0.2, 0.68, 0], [0.68, 0, 0.28, 0], [0.28, 0, 0.05, 0.18]
  ],
  T: [[0, 1, 1, 1], [0.5, 1, 0.5, 0]],
  U: [[0.05, 1, 0.05, 0.24], [0.05, 0.24, 0.28, 0], [0.28, 0, 0.68, 0], [0.68, 0, 0.92, 0.24], [0.92, 0.24, 0.92, 1]],
  V: [[0.03, 1, 0.5, 0], [0.5, 0, 0.97, 1]],
  W: [[0, 1, 0.24, 0], [0.24, 0, 0.5, 0.6], [0.5, 0.6, 0.76, 0], [0.76, 0, 1, 1]],
  X: [[0.03, 0, 0.95, 1], [0.03, 1, 0.95, 0]],
  Y: [[0.03, 1, 0.5, 0.5], [0.95, 1, 0.5, 0.5], [0.5, 0.5, 0.5, 0]],
  Z: [[0.03, 1, 0.95, 1], [0.95, 1, 0.03, 0], [0.03, 0, 0.95, 0]],
  '0': [
    [0.28, 1, 0.72, 1], [0.72, 1, 0.95, 0.78], [0.95, 0.78, 0.95, 0.22], [0.95, 0.22, 0.72, 0],
    [0.72, 0, 0.28, 0], [0.28, 0, 0.05, 0.22], [0.05, 0.22, 0.05, 0.78], [0.05, 0.78, 0.28, 1],
    [0.22, 0.24, 0.78, 0.76]
  ],
  '1': [[0.2, 0.78, 0.52, 1], [0.52, 1, 0.52, 0], [0.16, 0, 0.88, 0]],
  '2': [[0.05, 0.8, 0.3, 1], [0.3, 1, 0.7, 1], [0.7, 1, 0.93, 0.78], [0.93, 0.78, 0.05, 0], [0.05, 0, 0.95, 0]],
  '3': [[0.05, 0.86, 0.3, 1], [0.3, 1, 0.72, 1], [0.72, 1, 0.9, 0.76], [0.9, 0.76, 0.42, 0.54], [0.9, 0.76, 0.92, 0.24], [0.92, 0.24, 0.7, 0], [0.7, 0, 0.28, 0], [0.28, 0, 0.05, 0.16]],
  '4': [[0.72, 0, 0.72, 1], [0.72, 1, 0.05, 0.32], [0.05, 0.32, 0.98, 0.32]],
  '5': [[0.9, 1, 0.1, 1], [0.1, 1, 0.08, 0.56], [0.08, 0.56, 0.66, 0.58], [0.66, 0.58, 0.92, 0.36], [0.92, 0.36, 0.92, 0.2], [0.92, 0.2, 0.68, 0], [0.68, 0, 0.28, 0], [0.28, 0, 0.05, 0.16]],
  '6': [[0.9, 0.84, 0.66, 1], [0.66, 1, 0.3, 1], [0.3, 1, 0.06, 0.72], [0.06, 0.72, 0.06, 0.2], [0.06, 0.2, 0.3, 0], [0.3, 0, 0.68, 0], [0.68, 0, 0.92, 0.22], [0.92, 0.22, 0.68, 0.5], [0.68, 0.5, 0.1, 0.48]],
  '7': [[0.04, 1, 0.96, 1], [0.96, 1, 0.4, 0]],
  '8': [
    [0.3, 0.54, 0.7, 0.54], [0.7, 0.54, 0.9, 0.76], [0.9, 0.76, 0.7, 1], [0.7, 1, 0.3, 1],
    [0.3, 1, 0.1, 0.76], [0.1, 0.76, 0.3, 0.54], [0.3, 0.54, 0.08, 0.28], [0.08, 0.28, 0.3, 0],
    [0.3, 0, 0.7, 0], [0.7, 0, 0.92, 0.28], [0.92, 0.28, 0.7, 0.54]
  ],
  '9': [[0.1, 0.16, 0.34, 0], [0.34, 0, 0.7, 0], [0.7, 0, 0.94, 0.28], [0.94, 0.28, 0.94, 0.8], [0.94, 0.8, 0.7, 1], [0.7, 1, 0.32, 1], [0.32, 1, 0.08, 0.78], [0.08, 0.78, 0.32, 0.5], [0.32, 0.5, 0.9, 0.52]],
  '-': [[0.12, 0.5, 0.88, 0.5]],
  '.': [[0.42, 0.02, 0.5, 0.02]],
  '/': [[0.05, 0, 0.9, 1]],
  ':': [[0.46, 0.7, 0.54, 0.7], [0.46, 0.22, 0.54, 0.22]]
};

const SPACE_ADVANCE = 0.42;

export type RaisedTextOptions = {
  /** Cap height in metres; every other measure is relative to it. */
  capHeight: number;
  /** How far the letters stand off the plate, in metres. */
  depth: number;
  /** Stroke thickness as a fraction of cap height. */
  strokeRatio?: number;
  /** Extra space between glyphs as a fraction of cap height. */
  tracking?: number;
};

type GlyphMetrics = {
  /** Where the glyph's ink starts on the unit grid, before it is shifted. */
  left: number;
  /** Ink width plus one stroke, so bars meeting end to end just touch. */
  advance: number;
};

/**
 * Glyphs are drawn wherever the stroke table put them on the unit grid, which
 * is not necessarily hard against its left edge — `I` is a single bar at
 * x = 0.5. Measuring only the right extent left half a cap height of dead
 * space in front of it, so `PIPE` set as `P IPE`. Fit each glyph to its own
 * ink and let tracking do the spacing.
 */
function glyphMetrics(character: string, strokeRatio: number): GlyphMetrics {
  const strokes = GLYPHS[character];
  if (!strokes) return { left: 0, advance: SPACE_ADVANCE };
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const [x1, , x2] of strokes) {
    left = Math.min(left, x1, x2);
    right = Math.max(right, x1, x2);
  }
  return { left, advance: right - left + strokeRatio };
}

/**
 * Width of `text` in metres, guaranteed to contain the ink: bars are drawn
 * overlength to round their joins, and a diagonal one bulges past its
 * endpoints once rotated, so a stroke of slack is included.
 */
export function raisedTextWidth(text: string, options: RaisedTextOptions): number {
  const strokeRatio = options.strokeRatio ?? 0.17;
  const tracking = options.tracking ?? 0.12;
  const characters = [...text];
  let width = 0;
  characters.forEach((character, index) => {
    width += glyphMetrics(character, strokeRatio).advance * options.capHeight;
    if (index < characters.length - 1) width += tracking * options.capHeight;
  });
  return width + strokeRatio * options.capHeight;
}

/**
 * One merged geometry for the whole string, centred on the origin, extruded
 * along +z from -depth/2 to +depth/2. Returns undefined when nothing would be
 * drawn, so callers can skip the mesh entirely.
 */
export function raisedTextGeometry(
  text: string,
  options: RaisedTextOptions
): THREE.BufferGeometry | undefined {
  const { capHeight, depth } = options;
  const strokeRatio = options.strokeRatio ?? 0.17;
  const tracking = options.tracking ?? 0.12;
  const stroke = strokeRatio * capHeight;
  const parts: THREE.BufferGeometry[] = [];

  let pen = 0;
  const characters = [...text];
  characters.forEach((character, index) => {
    const metrics = glyphMetrics(character, strokeRatio);
    // Sit the glyph's ink hard against the pen, half a stroke in so the bar's
    // rounded cap lands on the pen rather than overhanging it.
    const bearing = (strokeRatio / 2 - metrics.left) * capHeight;
    for (const [x1, y1, x2, y2] of GLYPHS[character] ?? []) {
      const ax = pen + bearing + x1 * capHeight;
      const ay = y1 * capHeight;
      const bx = pen + bearing + x2 * capHeight;
      const by = y2 * capHeight;
      const run = Math.hypot(bx - ax, by - ay);
      // Overlength by one stroke so corners join without a notch.
      const bar = new THREE.BoxGeometry(run + stroke, stroke, depth);
      bar.rotateZ(Math.atan2(by - ay, bx - ax));
      bar.translate((ax + bx) / 2, (ay + by) / 2, 0);
      parts.push(bar);
    }
    pen += metrics.advance * capHeight;
    if (index < characters.length - 1) pen += tracking * capHeight;
  });

  if (parts.length === 0) return undefined;
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) return undefined;
  merged.translate(-pen / 2, -capHeight / 2, 0);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
