/**
 * Surface textures are authored per square metre, so every geometry has to
 * rewrite its UVs to match its real size. Doing it on the geometry (rather
 * than with per-material repeats) keeps one shared material — and one GPU
 * texture — for every mesh that uses a given palette role.
 */
import type * as THREE from 'three';

export type Tile = readonly [number, number] | undefined;

function scaleUv(
  geometry: THREE.BufferGeometry,
  spans: readonly (readonly [number, number])[],
  offset: readonly [number, number],
  vertsPerFace: number
): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) return;
  for (let index = 0; index < uv.count; index += 1) {
    const face = Math.min(Math.floor(index / vertsPerFace), spans.length - 1);
    const [spanU, spanV] = spans[face];
    uv.setXY(index, uv.getX(index) * spanU + offset[0], uv.getY(index) * spanV + offset[1]);
  }
  uv.needsUpdate = true;
}

/** A flat quad of `width` x `height` metres. */
export function tilePlaneUv(
  geometry: THREE.BufferGeometry,
  width: number,
  height: number,
  tile: Tile,
  offset: readonly [number, number] = [0, 0]
): void {
  if (!tile) return;
  scaleUv(geometry, [[width / tile[0], height / tile[1]]], offset, Number.MAX_SAFE_INTEGER);
}

/**
 * A box, mapping each face by the two dimensions it actually spans so a long
 * thin beam does not smear the texture along its length.
 */
export function tileBoxUv(
  geometry: THREE.BufferGeometry,
  size: readonly [number, number, number],
  tile: Tile,
  offset: readonly [number, number] = [0, 0]
): void {
  if (!tile) return;
  const [width, height, depth] = size;
  const [tileU, tileV] = tile;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  // BoxGeometry lays out +x, -x, +y, -y, +z, -z with four vertices each.
  if (!uv || uv.count !== 24) {
    tilePlaneUv(geometry, width, height, tile, offset);
    return;
  }
  scaleUv(
    geometry,
    [
      [depth / tileU, height / tileV],
      [depth / tileU, height / tileV],
      [width / tileU, depth / tileV],
      [width / tileU, depth / tileV],
      [width / tileU, height / tileV],
      [width / tileU, height / tileV]
    ],
    offset,
    4
  );
}

/** A cylinder, wrapping the texture around the circumference. */
export function tileCylinderUv(
  geometry: THREE.BufferGeometry,
  radius: number,
  height: number,
  tile: Tile,
  offset: readonly [number, number] = [0, 0]
): void {
  if (!tile) return;
  scaleUv(
    geometry,
    [[(Math.PI * 2 * radius) / tile[0], height / tile[1]]],
    offset,
    Number.MAX_SAFE_INTEGER
  );
}
