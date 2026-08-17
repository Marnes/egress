/**
 * Continuous-form listing paper off a dot-matrix printer: green bar, sprocket
 * margins, and type built from dots rather than outlines. The stock is drawn
 * faded and water-damaged, and the sheet carries real holes — the alpha
 * channel is punched, so you see the drum lid through the sprockets.
 */
import * as THREE from 'three';
import { clamp01, fbm, mix, mulberry32, smoothstep, smudge } from './procedural.js';

export type PrintoutOptions = {
  widthPx: number;
  heightPx: number;
  /** Printed body, one string per line, monospaced. */
  lines: readonly string[];
  /** Characters per line the form is set to. */
  columns?: number;
  seed?: number;
};

export type Printout = {
  texture: THREE.CanvasTexture;
  /**
   * Where a character cell sits on the sheet, as fractions from the top-left.
   * Anything added over the printout — a pen mark, a stamp — can line itself
   * up on the print rather than duplicating this layout.
   */
  anchor(column: number, line: number): { u: number; v: number };
  dispose(): void;
};

const STOCK = [212, 203, 172] as const;
const STOCK_SHADE = [150, 140, 108] as const;
const GREEN_BAR = 'rgba(150,170,132,0.2)';
const INK = '18,20,22';

type DotGrid = { coverage: number[]; wide: number; tall: number };
type DotFont = { font: string; baseline: number };

const SAMPLE_SCALE = 6;

/**
 * One type size for the whole sheet, fitted so a capital fills the dot grid.
 *
 * Sizing each glyph to fill the grid on its own would stretch a hyphen into a
 * seven-row bar; sizing by em box instead left capitals occupying five of the
 * seven rows, which turned `S` into `$` once sampled.
 */
function fitDotFont(
  createCanvas: (w: number, h: number) => HTMLCanvasElement,
  wide: number,
  tall: number
): DotFont {
  const canvas = createCanvas(wide * SAMPLE_SCALE, tall * SAMPLE_SCALE);
  canvas.width = wide * SAMPLE_SCALE;
  canvas.height = tall * SAMPLE_SCALE;
  const context = canvas.getContext('2d');
  const family = 'ui-monospace, "SF Mono", monospace';
  const gridHeight = tall * SAMPLE_SCALE;
  if (!context) return { font: `700 ${gridHeight}px ${family}`, baseline: gridHeight };

  let size = gridHeight;
  context.font = `700 ${size}px ${family}`;
  const cap = context.measureText('H').actualBoundingBoxAscent || size * 0.7;
  size *= (gridHeight * 0.88) / cap;
  context.font = `700 ${size}px ${family}`;
  const widest = context.measureText('M').width;
  if (widest > wide * SAMPLE_SCALE) size *= (wide * SAMPLE_SCALE) / widest;
  return { font: `700 ${size}px ${family}`, baseline: gridHeight * 0.94 };
}

/**
 * Sampling a normally-rendered glyph into a coarse grid gives authentic
 * dot-matrix type from any string, with no second font to maintain.
 */
function glyphGrid(
  createCanvas: (w: number, h: number) => HTMLCanvasElement,
  character: string,
  wide: number,
  tall: number,
  dotFont: DotFont
): DotGrid {
  const scale = SAMPLE_SCALE;
  const canvas = createCanvas(wide * scale, tall * scale);
  canvas.width = wide * scale;
  canvas.height = tall * scale;
  const context = canvas.getContext('2d');
  const coverage = new Array<number>(wide * tall).fill(0);
  if (!context) return { coverage, wide, tall };

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.font = dotFont.font;
  context.fillText(character, canvas.width / 2, dotFont.baseline);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let row = 0; row < tall; row += 1) {
    for (let column = 0; column < wide; column += 1) {
      // A cell lights up when the glyph covers enough of it.
      let covered = 0;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const px = (row * scale + y) * canvas.width + (column * scale + x);
          if (pixels[px * 4 + 3] > 110) covered += 1;
        }
      }
      // Kept as coverage rather than a yes/no. A binary cut either loses the
      // diagonal in `N` — printing it as `H` — or, dropped low enough to keep
      // it, blobs every other glyph. Weighting the dot by how much of the cell
      // the stroke crosses is also how a real head renders a diagonal.
      coverage[row * wide + column] = covered / (scale * scale);
    }
  }
  return { coverage, wide, tall };
}

export function createPrintout(
  createCanvas: (width: number, height: number) => HTMLCanvasElement,
  options: PrintoutOptions
): Printout {
  const { widthPx: width, heightPx: height, lines } = options;
  const columns = options.columns ?? 46;
  const canvas = createCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas context is required for the printout');
  const rng = mulberry32(options.seed ?? 0x51a7c);

  // Paper stock, mottled and foxed.
  const mottle = fbm(width, height, 7, 9, 4, rng);
  const fibre = fbm(width, height, 160, 26, 3, rng);
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const vertical = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const horizontal = x / (width - 1);
      const toEdge = Math.min(horizontal, 1 - horizontal, vertical, 1 - vertical);
      const handled = 1 - smoothstep(0, 0.13, toEdge);
      const blend = clamp01((mottle[index] - 0.44) * 1.05) * 0.45 + handled * 0.4;
      const grain = mix(0.95, 1.05, fibre[index]);
      const offset = index * 4;
      image.data[offset] = mix(STOCK[0], STOCK_SHADE[0], blend) * grain;
      image.data[offset + 1] = mix(STOCK[1], STOCK_SHADE[1], blend) * grain;
      image.data[offset + 2] = mix(STOCK[2], STOCK_SHADE[2], blend) * grain;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  // Sprocket margins and the perforation the form tears along.
  const margin = width * 0.11;
  const cell = (width - margin * 2) / columns;
  const lineHeight = cell * 1.62;
  const bodyTop = height * 0.055;

  context.save();
  context.strokeStyle = 'rgba(120,110,84,0.5)';
  context.setLineDash([cell * 0.22, cell * 0.3]);
  context.lineWidth = Math.max(1, width * 0.0016);
  for (const x of [margin * 0.82, width - margin * 0.82]) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  context.restore();

  // Green bar: bands of three lines, inboard of the perforations.
  context.fillStyle = GREEN_BAR;
  const bands = Math.ceil((height - bodyTop) / (lineHeight * 3));
  for (let band = 0; band < bands; band += 1) {
    if (band % 2 === 1) continue;
    context.fillRect(
      margin * 0.9,
      bodyTop + band * lineHeight * 3 - lineHeight * 0.2,
      width - margin * 1.8,
      lineHeight * 3
    );
  }

  // The print itself.
  // Nine-pin, near-letter-quality: an outline font sampled into only five
  // columns loses the diagonal in `N` and prints it as `H`, and dropping the
  // coverage threshold far enough to keep it blobs every other glyph. More
  // columns is the fix; it is also what NLQ mode did.
  const dotWide = 7;
  const dotTall = 9;
  const grids = new Map<string, DotGrid>();
  const dotFont = fitDotFont(createCanvas, dotWide, dotTall);
  const dotRadius = Math.max(0.55, cell * 0.07);
  const dotStepX = cell * 0.78 / (dotWide - 1);
  const dotStepY = cell * 1.12 / (dotTall - 1);
  // The ribbon is worn thin down one side and tired near the bottom.
  const ribbonSeed = mulberry32((options.seed ?? 0x51a7c) ^ 0x2b1d);
  const ribbon = fbm(64, 64, 5, 5, 2, ribbonSeed);

  lines.forEach((line, lineIndex) => {
    const y = bodyTop + lineIndex * lineHeight;
    for (let column = 0; column < line.length && column < columns; column += 1) {
      const character = line[column];
      if (character === ' ') continue;
      let grid = grids.get(character);
      if (!grid) {
        grid = glyphGrid(createCanvas, character, dotWide, dotTall, dotFont);
        grids.set(character, grid);
      }
      const originX = margin + column * cell + cell * 0.11;
      for (let row = 0; row < dotTall; row += 1) {
        for (let dot = 0; dot < dotWide; dot += 1) {
          const covered = grid.coverage[row * dotWide + dot];
          if (covered < 0.12) continue;
          const weight = clamp01(0.45 + covered * 0.75);
          // Faded: a weak strike to begin with, unevenly inked, with dropouts.
          const wear = ribbon[
            Math.min(63, Math.floor((y / height) * 63)) * 64 +
              Math.min(63, Math.floor((originX / width) * 63))
          ];
          const alpha = (0.46 + wear * 0.38 - (y / height) * 0.1) * weight;
          if (rng() < 0.04) continue;
          context.fillStyle = `rgba(${INK},${clamp01(alpha).toFixed(3)})`;
          context.beginPath();
          context.arc(
            originX + dot * dotStepX,
            y + row * dotStepY,
            dotRadius * weight * (0.85 + rng() * 0.35),
            0,
            Math.PI * 2
          );
          context.fill();
        }
      }
    }
  });

  // Water damage: brown tide rings that bleach the paper inside and stain the
  // rim, laid over the print so it looks soaked rather than printed on dirt.
  for (let index = 0; index < 2; index += 1) {
    const cx = width * (0.18 + rng() * 0.64);
    const cy = height * (0.22 + rng() * 0.62);
    const radius = width * (0.09 + rng() * 0.1);
    smudge(context, mulberry32(index * 977 + 3), cx, cy, radius, 'rgba(196,178,132,0.16)', 5);
    context.save();
    context.strokeStyle = 'rgba(128,92,44,0.16)';
    context.lineWidth = radius * 0.09;
    context.beginPath();
    for (let step = 0; step <= 40; step += 1) {
      const angle = (step / 40) * Math.PI * 2;
      const wobble = radius * (0.9 + Math.sin(angle * 3 + index) * 0.07);
      const x = cx + Math.cos(angle) * wobble;
      const y = cy + Math.sin(angle) * wobble;
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    context.restore();
  }

  // Rot: the paper has gone through where it stayed wet. Stain the edge first,
  // then punch the hole out of it.
  // One hole where it stayed wet longest: stain the edge, then punch through.
  {
    const cx = width * (0.2 + rng() * 0.55);
    const cy = height * (0.34 + rng() * 0.45);
    const radius = width * 0.022;
    smudge(context, mulberry32(0x3f1), cx, cy, radius * 2.4, 'rgba(96,68,32,0.24)', 5);
    context.save();
    context.globalCompositeOperation = 'destination-out';
    smudge(context, mulberry32(0x3f1), cx, cy, radius, 'rgba(0,0,0,1)', 3);
    context.restore();
  }

  // Sprocket holes down both margins.
  context.save();
  context.globalCompositeOperation = 'destination-out';
  const pitch = width * 0.083;
  const holeRadius = width * 0.019;
  for (let y = pitch * 0.6; y < height; y += pitch) {
    for (const x of [margin * 0.42, width - margin * 0.42]) {
      context.beginPath();
      context.arc(x, y, holeRadius, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return {
    texture,
    anchor(column, line) {
      return {
        u: (margin + column * cell + cell * 0.5) / width,
        v: (bodyTop + line * lineHeight + cell * 0.56) / height
      };
    },
    dispose() {
      texture.dispose();
    }
  };
}
