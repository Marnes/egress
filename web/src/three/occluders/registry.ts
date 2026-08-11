import type * as THREE from 'three';
import type { Pass } from 'three/addons/postprocessing/Pass.js';
import type { OccluderSpec, RoomVisual, Theme } from '../types.js';
import { lightCone } from './lightCone.js';
import { whiteout } from './whiteout.js';
import { visor } from './visor.js';
import { turbidity } from './turbidity.js';

export type OccluderContext = {
  scene: THREE.Scene;
  theme: Theme;
  bounds: RoomVisual['bounds'];
};

export type OccluderInstance = {
  object?: THREE.Object3D;
  composerPass?: Pass;
  update(dtSeconds: number, camera: THREE.Camera): void;
  dispose(): void;
};

export type OccluderFactory<T extends OccluderSpec = OccluderSpec> = (
  spec: T,
  context: OccluderContext
) => OccluderInstance;

export const occluderRegistry: Readonly<Record<OccluderSpec['kind'], OccluderFactory>> = Object.freeze({
  lightCone: lightCone as OccluderFactory,
  whiteout: whiteout as OccluderFactory,
  visor: visor as OccluderFactory,
  turbidity: turbidity as OccluderFactory
});
