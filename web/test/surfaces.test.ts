import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { themes } from '@egress/core';
import { createThemeRuntime } from '../src/three/theme.js';
import { createSurfaceKit, SURFACE_RECIPES, type SurfaceKind } from '../src/three/textures/surfaces.js';
import { hslToRgb, rgbToHsl } from '../src/three/textures/procedural.js';
import { tileBoxUv, tileCylinderUv, tilePlaneUv } from '../src/three/textures/uv.js';

const palette = themes.industrial.palette;

function uvBounds(geometry: THREE.BufferGeometry, from: number, count: number) {
  const uv = geometry.getAttribute('uv');
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = from; i < from + count; i += 1) {
    minU = Math.min(minU, uv.getX(i));
    maxU = Math.max(maxU, uv.getX(i));
    minV = Math.min(minV, uv.getY(i));
    maxV = Math.max(maxV, uv.getY(i));
  }
  return { u: maxU - minU, v: maxV - minV };
}

describe('surface UV tiling', () => {
  it('maps every box face by the two dimensions it actually spans', () => {
    const geometry = new THREE.BoxGeometry(2, 1, 4);
    tileBoxUv(geometry, [2, 1, 4], [1, 1]);

    // +x and -x span depth x height; +y and -y span width x depth; +z/-z width x height.
    expect(uvBounds(geometry, 0, 4)).toEqual({ u: 4, v: 1 });
    expect(uvBounds(geometry, 8, 4)).toEqual({ u: 2, v: 4 });
    expect(uvBounds(geometry, 16, 4)).toEqual({ u: 2, v: 1 });
  });

  it('scales planes and cylinders into the same world-space tile', () => {
    const plane = new THREE.PlaneGeometry(6, 3);
    tilePlaneUv(plane, 6, 3, [2, 1.5]);
    expect(uvBounds(plane, 0, 4)).toEqual({ u: 3, v: 2 });

    const pipe = new THREE.CylinderGeometry(0.5, 0.5, 4, 8);
    tileCylinderUv(pipe, 0.5, 4, [Math.PI, 2]);
    const uv = pipe.getAttribute('uv');
    let maxU = -Infinity;
    for (let i = 0; i < uv.count; i += 1) maxU = Math.max(maxU, uv.getX(i));
    expect(maxU).toBeCloseTo(1, 5);
  });

  it('leaves UVs untouched when no surface was baked', () => {
    const geometry = new THREE.PlaneGeometry(6, 3);
    const before = Array.from(geometry.getAttribute('uv').array);
    tilePlaneUv(geometry, 6, 3, undefined);
    tileBoxUv(geometry, [6, 3, 1], undefined);
    tileCylinderUv(geometry, 1, 3, undefined);
    expect(Array.from(geometry.getAttribute('uv').array)).toEqual(before);
  });

  it('offsets a shared tile so repeated walls do not line up', () => {
    const a = new THREE.PlaneGeometry(4, 2);
    const b = new THREE.PlaneGeometry(4, 2);
    tilePlaneUv(a, 4, 2, [2, 2], [0, 0]);
    tilePlaneUv(b, 4, 2, [2, 2], [0.37, 0.5]);
    expect(b.getAttribute('uv').getX(0) - a.getAttribute('uv').getX(0)).toBeCloseTo(0.37, 5);
  });
});

describe('surface generators', () => {
  it('keeps every channel inside its legal range and repeats exactly', () => {
    for (const kind of Object.keys(SURFACE_RECIPES) as SurfaceKind[]) {
      const recipe = SURFACE_RECIPES[kind];
      const first = recipe.build(64, 64, palette);
      const second = recipe.build(64, 64, palette);

      expect(Array.from(second.relief)).toEqual(Array.from(first.relief));
      expect(Array.from(second.color)).toEqual(Array.from(first.color));
      for (let i = 0; i < first.relief.length; i += 1) {
        expect(first.relief[i]).toBeGreaterThanOrEqual(0);
        expect(first.relief[i]).toBeLessThanOrEqual(1);
        expect(first.rough[i]).toBeGreaterThanOrEqual(0);
        expect(first.rough[i]).toBeLessThanOrEqual(1);
        expect(first.metal[i]).toBeGreaterThanOrEqual(0);
        expect(first.metal[i]).toBeLessThanOrEqual(1);
      }
      expect(recipe.tileM[0]).toBeGreaterThan(0);
      expect(recipe.tileM[1]).toBeGreaterThan(0);
    }
  });

  it('cuts brickwork into raised faces and recessed joints', () => {
    const channels = SURFACE_RECIPES.brick.build(256, 256, palette);
    let faces = 0;
    let joints = 0;
    for (const value of channels.relief) {
      if (value > 0.7) faces += 1;
      else if (value < 0.4) joints += 1;
    }
    // Joints are a minority of the wall, but a substantial one.
    expect(joints / channels.relief.length).toBeGreaterThan(0.08);
    expect(faces / channels.relief.length).toBeGreaterThan(0.5);
  });

  it('leaves rust non-metallic where bare steel is not', () => {
    const channels = SURFACE_RECIPES.rustedSteel.build(128, 128, palette);
    let corroded = 0;
    let bare = 0;
    for (let i = 0; i < channels.metal.length; i += 1) {
      if (channels.metal[i] < 0.2) corroded += 1;
      if (channels.metal[i] > 0.5) bare += 1;
    }
    expect(corroded).toBeGreaterThan(0);
    expect(bare).toBeGreaterThan(0);
    for (let i = 0; i < channels.metal.length; i += 1) {
      // Rust is rough; polished bare steel is not. They must not swap.
      if (channels.metal[i] < 0.15) expect(channels.rough[i]).toBeGreaterThan(0.6);
    }
  });
});

describe('theme runtime without a canvas', () => {
  it('falls back to flat palette materials', () => {
    const runtime = createThemeRuntime(themes.industrial, createSurfaceKit(palette, undefined));
    const wall = runtime.material('wall');
    expect(wall.map).toBeNull();
    expect(wall.color.getHexString()).toBe(palette.wall.slice(1));
    expect(runtime.surface('wall')).toBeUndefined();
    expect(runtime.decal('damp')).toBeUndefined();
    // Roles still share one material instance per lookup.
    expect(runtime.material('wall')).toBe(wall);
    runtime.dispose();
  });
});

describe('colour helpers', () => {
  it('round-trips through HSL', () => {
    for (const hex of [palette.wall, palette.metal, palette.floor]) {
      const rgb: [number, number, number] = [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16)
      ];
      const [h, s, l] = rgbToHsl(rgb);
      expect(hslToRgb(h, s, l)).toEqual(rgb);
    }
  });
});
