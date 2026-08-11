import * as THREE from 'three';
import { tileCylinderUv } from '../textures/uv.js';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam, tileOf } from './common.js';

/**
 * A steel drum: rolling hoops, chimes top and bottom, and two bungs in the
 * lid. Lay one down by rotating it a quarter turn about z in the room spec.
 */
export const barrel: PropFactory = (ctx) => {
  const radius = numberParam(ctx, 'radius', 0.29);
  const height = numberParam(ctx, 'height', 0.88);
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const bodyMaterial = material(ctx, 'body', 'metal');
  const bodyTile = tileOf(ctx, 'body', 'metal');
  const variant = numberParam(ctx, 'variant', 0);
  const offset: [number, number] = [variant * 0.29, variant * 0.53];

  const shell = new THREE.CylinderGeometry(radius, radius, height, 24, 1);
  tileCylinderUv(shell, radius, height, bodyTile, offset);
  const body = new THREE.Mesh(shell, bodyMaterial);
  body.name = `${ctx.spec.id}:drum`;
  root.add(body);

  const hardware = material(ctx, 'hardware', 'metalDark');
  const hardwareTile = tileOf(ctx, 'hardware', 'metalDark');

  // Rolling hoops around the belly, and the chimes it stands on.
  const ring = (ringRadius: number, thickness: number, y: number): void => {
    const geometry = new THREE.CylinderGeometry(ringRadius, ringRadius, thickness, 24, 1);
    tileCylinderUv(geometry, ringRadius, thickness, hardwareTile, offset);
    const mesh = new THREE.Mesh(geometry, hardware);
    mesh.position.y = y;
    root.add(mesh);
  };
  const hoops = Math.max(0, Math.round(numberParam(ctx, 'hoops', 2)));
  for (let index = 0; index < hoops; index += 1) {
    ring(radius * 1.05, height * 0.055, height * ((index + 1) / (hoops + 1) - 0.5));
  }
  ring(radius * 1.04, height * 0.045, height * 0.472);
  ring(radius * 1.04, height * 0.045, -height * 0.472);

  // Lid, with a large and a small bung.
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.99, radius * 0.99, height * 0.012, 24),
    bodyMaterial
  );
  lid.position.y = height * 0.5;
  root.add(lid);
  for (const [bungRadius, angle] of [
    [radius * 0.16, 0],
    [radius * 0.1, Math.PI]
  ]) {
    const bung = new THREE.Mesh(
      new THREE.CylinderGeometry(bungRadius, bungRadius, height * 0.03, 12),
      hardware
    );
    bung.position.set(Math.cos(angle) * radius * 0.55, height * 0.51, Math.sin(angle) * radius * 0.55);
    root.add(bung);
  }

  return createInstance(root, ctx.spec.interactive ? [body] : []);
};
