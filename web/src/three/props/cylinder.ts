import * as THREE from 'three';
import { tileCylinderUv } from '../textures/uv.js';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam, tileOf } from './common.js';

export const cylinder: PropFactory = (ctx) => {
  const radius = numberParam(ctx, 'radius', 0.25);
  const height = numberParam(ctx, 'height', 1);
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const bodyMaterial = material(ctx, 'body', 'metal');
  const bodyTile = tileOf(ctx, 'body', 'metal');
  // Each run of pipe samples a different patch of the rust map so no two
  // corrode identically.
  const variant = numberParam(ctx, 'variant', 0);
  const offset: [number, number] = [variant * 0.37, variant * 0.61];

  const geometry = new THREE.CylinderGeometry(
    numberParam(ctx, 'radiusTop', radius),
    numberParam(ctx, 'radiusBottom', radius),
    height,
    Math.max(16, Math.round(numberParam(ctx, 'segments', 20)))
  );
  tileCylinderUv(geometry, radius, height, bodyTile, offset);
  const mesh = new THREE.Mesh(geometry, bodyMaterial);
  mesh.name = `${ctx.spec.id}:pipe`;
  root.add(mesh);

  const clampCount = Math.max(0, Math.round(numberParam(ctx, 'clamps', 0)));
  const clampMaterial = material(ctx, 'clamp', 'metalDark');
  for (let index = 0; index < clampCount; index += 1) {
    const clamp = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.08, Math.max(radius * 0.16, 0.008), 8, 24),
      clampMaterial
    );
    clamp.rotation.x = Math.PI / 2;
    clamp.position.y = height * (index / Math.max(1, clampCount - 1) - 0.5) * 0.78;
    root.add(clamp);
  }

  // Bolted flange couplings break the run up the way real pipework does.
  // They are wider than the pipe, so a run carrying a gauge or a stencil needs
  // them shifted clear of it — a flange across a dial face reads as a fault.
  const flangeCount = Math.max(0, Math.round(numberParam(ctx, 'flanges', 0)));
  const flangeOffset = numberParam(ctx, 'flangeOffsetM', 0);
  const flangeMaterial = material(ctx, 'flange', 'metalDark');
  for (let index = 0; index < flangeCount; index += 1) {
    const y = height * ((index + 1) / (flangeCount + 1) - 0.5) + flangeOffset;
    for (const side of [-1, 1]) {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 1.55, radius * 1.55, radius * 0.24, 20),
        flangeMaterial
      );
      disc.position.y = y + side * radius * 0.16;
      root.add(disc);
    }
    const bolts = 6;
    const up = new THREE.Vector3(0, 1, 0);
    for (let bolt = 0; bolt < bolts; bolt += 1) {
      const angle = (bolt / bolts) * Math.PI * 2;
      const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const head = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, radius * 0.7, 6),
        flangeMaterial
      );
      head.quaternion.setFromUnitVectors(up, direction);
      head.position.copy(direction).multiplyScalar(radius * 1.3);
      head.position.y = y;
      root.add(head);
    }
  }

  return createInstance(root, ctx.spec.interactive ? [mesh] : []);
};
