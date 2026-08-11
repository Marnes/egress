/**
 * A phosphor CRT face drawn to canvas: dim glass, glowing text with bloom,
 * scanlines, an aperture grille, a vignette, and a blinking block cursor.
 *
 * Distinct from {@link ./legibility.js}'s glyph panels, which are printed
 * labels — ink on a light face. This one emits light.
 */
import * as THREE from 'three';

const GLASS = '#0a0a08';
const PHOSPHOR = '#ffb14a';

export type CrtPanelOptions = {
  widthPx: number;
  heightPx: number;
  /** Fixed header text; the body is whatever `draw` is given. */
  title: string;
  phosphor?: string;
};

/** Right-hand header readout: a label plus the lamp beside it. */
export type CrtStatus = { label: string; live: boolean };

export type CrtPanel = {
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  /** Characters that fit one body line at the chosen type size. */
  readonly columns: number;
  /** Body lines that fit under the header. */
  readonly rows: number;
  draw(body: string, status?: CrtStatus): void;
  tick(dtSeconds: number): void;
  dispose(): void;
};

const CURSOR_PERIOD_SECONDS = 0.54;

export function createCrtPanel(
  createCanvas: (width: number, height: number) => HTMLCanvasElement,
  options: CrtPanelOptions
): CrtPanel {
  const { widthPx: width, heightPx: height } = options;
  const canvas = createCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas context is required for the CRT face');

  const phosphor = options.phosphor ?? PHOSPHOR;
  const headerHeight = Math.round(height * 0.14);
  const padding = Math.round(width * 0.028);
  const bodyFont = Math.round(height * 0.082);
  const lineHeight = Math.round(bodyFont * 1.34);
  const bodyTop = headerHeight + Math.round(lineHeight * 0.85);
  const rows = Math.max(1, Math.floor((height - bodyTop - padding) / lineHeight));

  context.font = `${bodyFont}px ui-monospace, "SF Mono", monospace`;
  const advance = context.measureText('M').width || bodyFont * 0.6;
  const columns = Math.max(8, Math.floor((width - padding * 2) / advance));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // Mipmaps matter here: unfiltered scanlines shimmer badly at a distance.
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    fog: false,
    // Left out of tone mapping so the phosphor keeps its glow in a dark room.
    toneMapped: false
  });

  let body = '';
  let status: CrtStatus = { label: 'ONLINE', live: true };
  let cursorVisible = true;
  let elapsed = 0;

  const paint = (): void => {
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = GLASS;
    context.fillRect(0, 0, width, height);

    // Phosphor haze pooling behind the text.
    const haze = context.createRadialGradient(
      width * 0.5,
      height * 0.46,
      0,
      width * 0.5,
      height * 0.46,
      width * 0.62
    );
    haze.addColorStop(0, withAlpha(phosphor, 0.11));
    haze.addColorStop(1, withAlpha(phosphor, 0));
    context.fillStyle = haze;
    context.fillRect(0, 0, width, height);

    // Header rule and status.
    context.fillStyle = withAlpha(phosphor, 0.08);
    context.fillRect(0, 0, width, headerHeight);
    context.fillStyle = withAlpha(phosphor, 0.45);
    context.fillRect(padding, headerHeight - 3, width - padding * 2, 2);

    const headerFont = Math.round(bodyFont * 0.76);
    context.font = `${headerFont}px ui-monospace, "SF Mono", monospace`;
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.fillStyle = withAlpha(phosphor, 0.72);
    context.fillText(options.title.toUpperCase(), padding, headerHeight * 0.5);
    // A dead link reads dim and unlit, so the state is legible across the room.
    context.textAlign = 'right';
    context.fillStyle = withAlpha(phosphor, status.live ? 0.72 : 0.34);
    context.fillText(status.label, width - padding - headerFont * 1.1, headerHeight * 0.5);
    context.fillStyle = status.live ? phosphor : withAlpha(phosphor, 0.22);
    context.fillRect(
      width - padding - headerFont * 0.7,
      headerHeight * 0.5 - headerFont * 0.28,
      headerFont * 0.56,
      headerFont * 0.56
    );

    // Body, glowing.
    context.textAlign = 'left';
    context.font = `${bodyFont}px ui-monospace, "SF Mono", monospace`;
    context.shadowColor = phosphor;
    context.shadowBlur = bodyFont * 0.6;
    context.fillStyle = phosphor;
    const lines = body.split('\n').slice(-rows);
    lines.forEach((line, index) => {
      const y = bodyTop + index * lineHeight;
      // Two passes: the second burns the glyph core through its own bloom.
      context.fillText(line, padding, y);
      context.fillText(line, padding, y);
    });

    if (cursorVisible) {
      const last = lines.at(-1) ?? '';
      const y = bodyTop + Math.max(0, lines.length - 1) * lineHeight;
      context.fillRect(
        padding + context.measureText(`${last} `).width,
        y - bodyFont * 0.42,
        advance * 0.82,
        bodyFont * 0.9
      );
    }
    context.shadowBlur = 0;

    // Scanlines and aperture grille.
    context.fillStyle = 'rgba(0,0,0,0.34)';
    for (let y = 0; y < height; y += 4) context.fillRect(0, y, width, 2);
    context.fillStyle = 'rgba(0,0,0,0.10)';
    for (let x = 0; x < width; x += 3) context.fillRect(x, 0, 1, height);

    // Curved glass: a sheen off the top-left and darkness in the corners.
    const sheen = context.createLinearGradient(0, 0, width * 0.75, height);
    sheen.addColorStop(0, 'rgba(226,240,255,0.10)');
    sheen.addColorStop(0.32, 'rgba(226,240,255,0.02)');
    sheen.addColorStop(0.6, 'rgba(226,240,255,0)');
    context.fillStyle = sheen;
    context.fillRect(0, 0, width, height);

    const vignette = context.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.28,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.68
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.62)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);

    context.restore();
    texture.needsUpdate = true;
  };

  paint();

  return {
    texture,
    material,
    columns,
    rows,
    draw(value, next = status) {
      if (value === body && next.label === status.label && next.live === status.live) return;
      body = value;
      status = next;
      paint();
    },
    tick(dtSeconds) {
      elapsed += dtSeconds;
      if (elapsed < CURSOR_PERIOD_SECONDS) return;
      elapsed %= CURSOR_PERIOD_SECONDS;
      cursorVisible = !cursorVisible;
      paint();
    },
    dispose() {
      material.dispose();
      texture.dispose();
    }
  };
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
