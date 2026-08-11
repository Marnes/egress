import * as THREE from 'three';
import { tileBoxUv } from '../textures/uv.js';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam, tileOf } from './common.js';

export const box: PropFactory = (ctx) => {
  const size: [number, number, number] = [
    numberParam(ctx, 'w', 1),
    numberParam(ctx, 'h', 1),
    numberParam(ctx, 'd', 1)
  ];
  const geometry = new THREE.BoxGeometry(...size);
  tileBoxUv(geometry, size, tileOf(ctx, 'body', 'structure'), [
    numberParam(ctx, 'variant', 0) * 0.41,
    numberParam(ctx, 'variant', 0) * 0.29
  ]);
  const mesh = new THREE.Mesh(geometry, material(ctx, 'body', 'structure'));
  mesh.name = ctx.spec.id;
  return createInstance(mesh, ctx.spec.interactive ? [mesh] : []);
};
