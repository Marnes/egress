import * as THREE from 'three';
import { createCrtPanel, type CrtPanel, type CrtPanelOptions } from './crt.js';
import { createPrintout, type Printout, type PrintoutOptions } from './printout.js';
import { mulberry32 } from './procedural.js';

/**
 * Aged instrument enamel and worn stencil paint. These are grimy, but never at
 * the cost of the reading: the puzzle turns on the player being able to call
 * out a digit, so the wear goes on the face and around the glyph, and the
 * glyph itself keeps its contrast.
 */
const ENAMEL = '#d5cdb6';
const ENAMEL_SHADE = '#9e957c';
const DIAL_INK = '#1d1b17';
const PAINT = '#f2ece0';
const PAINT_SHADOW = 'rgba(10,9,8,0.62)';
const FOXING = 'rgba(122,86,48,0.16)';
const FACE = '#e8e6e0';
const INK = '#101214';
const HALO = 'rgba(8,9,11,0.78)';

export type GlyphStyle = 'dial' | 'stencil' | 'display';

export type GlyphPanel = {
  texture: THREE.CanvasTexture;
  material: THREE.MeshStandardMaterial;
  draw(value: string | null, style: GlyphStyle): void;
  dispose(): void;
};

export type GlyphPanelOptions = {
  widthPx: number;
  heightPx: number;
  aspectM: [number, number];
  /**
   * Leave the face clear so the surface underneath shows through — for paint
   * sprayed straight onto metal rather than a plate screwed to it.
   */
  transparent?: boolean;
};

export type LegibilityKit = {
  glyphPanel(opts: GlyphPanelOptions): GlyphPanel;
  /** A lit phosphor display, as opposed to the printed labels above. */
  crtPanel(opts: CrtPanelOptions): CrtPanel;
  /** A dot-matrix listing on continuous-form paper, holes and all. */
  printout(opts: PrintoutOptions): Printout;
};

export type LegibilityCanvasFactory = (width: number, height: number) => HTMLCanvasElement;

function defaultCanvasFactory(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Aged enamel dial face: yellowed, foxed, dirty at the rim, with tick marks. */
function paintDialFace(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  rng: () => number
): void {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2;

  const enamel = context.createRadialGradient(cx * 0.86, cy * 0.82, radius * 0.1, cx, cy, radius);
  enamel.addColorStop(0, ENAMEL);
  enamel.addColorStop(0.72, ENAMEL);
  enamel.addColorStop(1, ENAMEL_SHADE);
  context.fillStyle = enamel;
  context.fillRect(0, 0, width, height);

  // Foxing: the brown spotting old paper and old dials both get.
  for (let index = 0; index < 14; index += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = Math.sqrt(rng()) * radius * 0.86;
    const blot = radius * (0.03 + rng() * 0.09);
    context.fillStyle = FOXING;
    context.beginPath();
    context.arc(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, blot, 0, Math.PI * 2);
    context.fill();
  }

  // Grime collecting under the bezel.
  const rim = context.createRadialGradient(cx, cy, radius * 0.62, cx, cy, radius);
  rim.addColorStop(0, 'rgba(38,32,24,0)');
  rim.addColorStop(1, 'rgba(38,32,24,0.5)');
  context.fillStyle = rim;
  context.fillRect(0, 0, width, height);

  // Minute ticks, longer every third.
  context.strokeStyle = 'rgba(34,32,28,0.62)';
  for (let index = 0; index < 24; index += 1) {
    const angle = (index / 24) * Math.PI * 2 - Math.PI / 2;
    const long = index % 3 === 0;
    const inner = radius * (long ? 0.76 : 0.82);
    const outer = radius * 0.88;
    context.lineWidth = long ? radius * 0.035 : radius * 0.018;
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    context.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    context.stroke();
  }
}

/** Chew flecks out of a glyph that has been on a wall for thirty years. */
function wearGlyph(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  rng: () => number,
  transparent: boolean
): void {
  context.save();
  context.globalCompositeOperation = transparent ? 'destination-out' : 'source-over';
  for (let index = 0; index < 90; index += 1) {
    const size = Math.min(width, height) * (0.006 + rng() * 0.022);
    context.fillStyle = transparent
      ? `rgba(0,0,0,${(0.35 + rng() * 0.65).toFixed(3)})`
      : `rgba(213,205,182,${(0.3 + rng() * 0.5).toFixed(3)})`;
    context.beginPath();
    context.arc(rng() * width, rng() * height, size, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export function createLegibilityKit(
  createCanvas: LegibilityCanvasFactory = defaultCanvasFactory
): LegibilityKit {
  // Per-kit, so every panel weathers differently but a rebuilt room does not.
  let panelSeed = 0x9e37;

  return {
    crtPanel(options) {
      return createCrtPanel(createCanvas, options);
    },
    printout(options) {
      return createPrintout(createCanvas, options);
    },
    glyphPanel({ widthPx, heightPx, transparent = false }) {
      const canvas = createCanvas(widthPx, heightPx);
      canvas.width = widthPx;
      canvas.height = heightPx;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('A 2D canvas context is required for legibility glyphs');
      panelSeed = (panelSeed + 0x6d2b) >>> 0;
      const seed = panelSeed;

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      // Lit, like the surface it is fixed to. Unlit panels render at full
      // albedo no matter how dark the room is, which is why they read as
      // stickers pasted on: a dial face measured ~176 against lit steel at
      // ~63 right beside it. Readings only matter once the room has power,
      // so nothing is lost by letting them take the light.
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.78,
        metalness: 0,
        transparent
      });
      let previousValue: string | null | undefined;
      let previousStyle: GlyphStyle | undefined;

      return {
        texture,
        material,
        draw(value, style) {
          if (value === previousValue && style === previousStyle) return;
          previousValue = value;
          previousStyle = style;

          // Reseeded per draw, so the wear is the same every time this panel
          // redraws instead of crawling when the reading changes.
          const rng = mulberry32(seed);
          context.clearRect(0, 0, widthPx, heightPx);
          // A dial keeps its enamel face whether or not it has a reading to
          // show: a gauge with its needle obscured still looks like a gauge,
          // where filling the panel with ink reads as a hole in the pipe.
          if (style === 'dial') {
            paintDialFace(context, widthPx, heightPx, rng);
          } else if (!transparent) {
            context.fillStyle = value === null ? INK : FACE;
            context.fillRect(0, 0, widthPx, heightPx);
          }
          if (value === null || value === '') {
            texture.needsUpdate = true;
            return;
          }

          const lines = value.split('\n');
          const multiline = lines.length > 1;
          let capHeight = multiline
            ? Math.min(heightPx * 0.14, (heightPx / (lines.length + 1)) * 0.72)
            : heightPx * (style === 'stencil' ? 0.78 : style === 'dial' ? 0.56 : 0.6);
          const family = style === 'stencil' ? 'Impact, sans-serif' : 'ui-monospace, monospace';
          context.font = `700 ${capHeight}px ${family}`;
          const measuredWidth = Math.max(...lines.map((line) => context.measureText(line).width));
          if (measuredWidth > widthPx * 0.84) {
            capHeight *= (widthPx * 0.84) / measuredWidth;
            context.font = `700 ${capHeight}px ${family}`;
          }
          context.textAlign = multiline ? 'left' : 'center';
          context.textBaseline = 'middle';
          context.lineJoin = 'round';
          context.lineWidth = capHeight * (style === 'stencil' ? 0.1 : 0.08);
          // Stencil paint is pale on dark steel; dial figures are dark on
          // enamel. Both keep an outline so they hold up at a distance.
          context.strokeStyle = style === 'stencil' ? PAINT_SHADOW : HALO;
          context.fillStyle = style === 'stencil' ? PAINT : style === 'dial' ? DIAL_INK : INK;
          const lineHeight = capHeight * 1.28;
          const startY = heightPx / 2 - ((lines.length - 1) * lineHeight) / 2;
          lines.forEach((line, index) => {
            const x = multiline ? widthPx * 0.06 : widthPx / 2;
            const y = startY + index * lineHeight + capHeight * 0.04;
            context.strokeText(line, x, y);
            context.fillText(line, x, y);
          });

          if (style === 'stencil' || style === 'dial') {
            wearGlyph(context, widthPx, heightPx, rng, transparent);
          }
          texture.needsUpdate = true;
        },
        dispose() {
          material.dispose();
          texture.dispose();
        }
      };
    }
  };
}
