import type { Theme } from './types.js';

// A brick-walled basement plant room: fired clay walls, a poured slab, and
// steelwork that has been down here long enough to rust. Palette entries are
// the base tint each procedural surface is generated around.
const industrial: Theme = {
  id: 'industrial',
  palette: {
    background: '#6c6a66',
    floor: '#6f6f6c',
    wall: '#a06c58',
    ceiling: '#8f8d87',
    structure: '#7a766f',
    metal: '#a2a8a5',
    metalDark: '#7d817f',
    accent: '#d49a52',
    warning: '#dfbd4f',
    ink: '#111719'
  },
  fog: { color: '#2f2b28', visibilityM: 22, mode: 'linear' },
  lightRig: {
    ambient: { color: '#d8c9b4', intensity: 0.012 }
  },
  occluder: {
    kind: 'lightCone',
    angleDeg: 88,
    penumbra: 0.5,
    intensity: 0,
    reachM: 12,
    color: '#fff0c8',
    ambientFloor: 1
  },
  outline: { thicknessPx: 0.35, depthSensitivity: 0.32, normalSensitivity: 0.2 },
  surface: { shading: 'smooth', roughness: 0.82, metalness: 0.12 },
  grade: { vignette: 0.2, grain: 0, exposure: 1, saturation: 1.02, contrast: 1.06 }
};

const snow: Theme = {
  id: 'snow',
  palette: {
    background: '#eef4f5',
    floor: '#d8e3e5',
    wall: '#e5edef',
    ceiling: '#f5f8f8',
    structure: '#bacdd1',
    metal: '#d1dde0',
    metalDark: '#a7bcc1',
    accent: '#d9985f',
    warning: '#dfb95d',
    ink: '#172b3a'
  },
  fog: { color: '#f4f8f8', visibilityM: 4, mode: 'exp2' },
  lightRig: {
    ambient: { color: '#f8ffff', intensity: 0.72 },
    hemisphere: { sky: '#ffffff', ground: '#9cb3ba', intensity: 0.75 },
    directional: [{ color: '#f9fdff', intensity: 0.8, direction: [-0.3, -0.8, 0.5] }]
  },
  occluder: { kind: 'whiteout', driftMps: 0.7, particleCount: 900, color: '#f7fbfc', gustHz: 0.18 },
  outline: { thicknessPx: 2.5, depthSensitivity: 0.75, normalSensitivity: 0.8 },
  surface: { shading: 'flat', roughness: 0.9, metalness: 0.06 },
  grade: { vignette: 0.18, grain: 0, exposure: 1.05, saturation: 1, contrast: 1 }
};

export const themes: Record<string, Theme> = { industrial, snow };
