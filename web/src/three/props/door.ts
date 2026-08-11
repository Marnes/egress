import * as THREE from 'three';
import { tileBoxUv } from '../textures/uv.js';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam, stringParam, tileOf } from './common.js';

/**
 * A pressed-steel fire door in a welded frame: recessed stiffener panels, a
 * wired vision port, a scuffed kick plate, riveted jambs, and an overhead
 * closer.
 */
export const door: PropFactory = (ctx) => {
  const width = numberParam(ctx, 'w', 1);
  const height = numberParam(ctx, 'h', 2.1);
  const depth = numberParam(ctx, 'd', 0.08);
  const hingeLeft = stringParam(ctx, 'hinge', 'left') !== 'right';
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const frameMaterial = material(ctx, 'frame', 'metalDark');
  const frameTile = tileOf(ctx, 'frame', 'metalDark');
  const slabMaterial = material(ctx, 'slab', 'metal', 'paintedSteel');
  const slabTile = tileOf(ctx, 'slab', 'metal', 'paintedSteel');
  const hardwareMaterial = material(ctx, 'hardware', 'metalDark');

  const boxMesh = (
    size: [number, number, number],
    surface: THREE.MeshStandardMaterial,
    tile: ReturnType<typeof tileOf>,
    offset: [number, number] = [0, 0]
  ): THREE.Mesh => {
    const geometry = new THREE.BoxGeometry(...size);
    tileBoxUv(geometry, size, tile, offset);
    return new THREE.Mesh(geometry, surface);
  };

  const jambWidth = Math.max(width * 0.08, 0.04);
  const left = boxMesh([jambWidth, height, depth * 1.5], frameMaterial, frameTile);
  const right = boxMesh([jambWidth, height, depth * 1.5], frameMaterial, frameTile, [0.5, 0.25]);
  left.position.x = -width / 2;
  right.position.x = width / 2;
  const top = boxMesh([width + jambWidth, jambWidth, depth * 1.5], frameMaterial, frameTile);
  top.position.y = height / 2;

  const hinge = new THREE.Group();
  hinge.position.x = (hingeLeft ? -1 : 1) * (width / 2 - jambWidth / 2);
  const slabSize: [number, number, number] = [width - jambWidth, height - jambWidth, depth];
  const slab = boxMesh(slabSize, slabMaterial, slabTile);
  slab.position.x = (hingeLeft ? 1 : -1) * (width - jambWidth) / 2;

  // Pressed stiffener panels, slightly proud of the leaf.
  for (const y of [-height * 0.26, height * 0.06]) {
    const inset = boxMesh([width * 0.6, height * 0.26, depth * 0.1], slabMaterial, slabTile, [0.2, 0.4]);
    inset.position.set(0, y, depth * 0.54);
    slab.add(inset);
    const back = inset.clone();
    back.position.z = -depth * 0.54;
    slab.add(back);
  }

  // Wired vision port at head height.
  const portWidth = width * 0.34;
  const portHeight = height * 0.16;
  const portFrame = boxMesh(
    [portWidth + 0.03, portHeight + 0.03, depth * 0.2],
    frameMaterial,
    frameTile
  );
  portFrame.position.set(0, height * 0.29, depth * 0.5);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(portWidth, portHeight),
    material(ctx, 'glass', 'ink')
  );
  glass.name = `${ctx.spec.id}:port`;
  glass.position.set(0, height * 0.29, depth * 0.61);
  slab.add(portFrame, glass);
  for (let i = 1; i <= 3; i += 1) {
    const wire = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, portHeight, 0.006),
      hardwareMaterial
    );
    wire.position.set(portWidth * (i / 4 - 0.5), height * 0.29, depth * 0.63);
    slab.add(wire);
  }
  for (let i = 1; i <= 2; i += 1) {
    const wire = new THREE.Mesh(new THREE.BoxGeometry(portWidth, 0.006, 0.006), hardwareMaterial);
    wire.position.set(0, height * 0.29 + portHeight * (i / 3 - 0.5), depth * 0.63);
    slab.add(wire);
  }

  // Kick plate: the most-abused strip of any service door.
  const kick = boxMesh([width * 0.86, height * 0.14, depth * 0.12], frameMaterial, frameTile, [0.7, 0.1]);
  kick.position.set(0, -height * 0.4, depth * 0.55);
  slab.add(kick);

  const handleX = (hingeLeft ? 1 : -1) * width * 0.3;
  const handlePlate = boxMesh([width * 0.08, height * 0.17, depth * 0.12], frameMaterial, frameTile);
  handlePlate.position.set(handleX, 0, depth * 0.58);
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.018, height * 0.014, width * 0.2, 12),
    hardwareMaterial
  );
  handle.rotation.z = Math.PI / 2;
  handle.position.set(handleX - (hingeLeft ? 1 : -1) * width * 0.07, -height * 0.01, depth * 0.74);
  const spindle = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.014, height * 0.014, depth * 0.3, 12),
    hardwareMaterial
  );
  spindle.rotation.x = Math.PI / 2;
  spindle.position.set(handleX, 0, depth * 0.66);
  const lock = new THREE.Mesh(
    new THREE.CylinderGeometry(width * 0.022, width * 0.022, depth * 0.24, 12),
    hardwareMaterial
  );
  lock.rotation.x = Math.PI / 2;
  lock.position.set(handleX, -height * 0.1, depth * 0.6);
  slab.add(handlePlate, handle, spindle, lock);

  // Overhead closer, mounted leaf-side with its arm on the frame.
  const closerBody = boxMesh([width * 0.3, height * 0.05, depth * 0.35], hardwareMaterial, frameTile);
  closerBody.position.set(-handleX * 0.6, height * 0.42, depth * 0.66);
  const closerArm = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.34, height * 0.014, depth * 0.14),
    hardwareMaterial
  );
  closerArm.position.set(-handleX * 0.2, height * 0.45, depth * 0.78);
  closerArm.rotation.z = -0.18;
  slab.add(closerBody, closerArm);
  hinge.add(slab);

  for (const y of [-height * 0.34, 0, height * 0.34]) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(jambWidth * 0.3, jambWidth * 0.3, height * 0.11, 12),
      hardwareMaterial
    );
    barrel.position.set((hingeLeft ? -1 : 1) * width / 2, y, depth * 0.82);
    root.add(barrel);
  }

  // Rivets along both jambs.
  for (const x of [-width / 2, width / 2]) {
    for (let i = 0; i < 5; i += 1) {
      const rivet = new THREE.Mesh(
        new THREE.CylinderGeometry(jambWidth * 0.12, jambWidth * 0.12, depth * 0.12, 8),
        hardwareMaterial
      );
      rivet.rotation.x = Math.PI / 2;
      rivet.position.set(x, height * (i / 4 - 0.5) * 0.86, depth * 0.78);
      root.add(rivet);
    }
  }

  const threshold = boxMesh([width + jambWidth, jambWidth * 0.5, depth * 1.8], frameMaterial, frameTile);
  threshold.position.y = -height / 2;
  root.add(left, right, top, threshold, hinge);

  const swing = numberParam(ctx, 'swingRad', hingeLeft ? -1.55 : 1.55);
  const update = (view: Parameters<NonNullable<ReturnType<PropFactory>['update']>>[0]) => {
    hinge.rotation.y = view.doorOpen ? swing : 0;
    hinge.userData.targetAngle = hinge.rotation.y;
  };

  return createInstance(root, ctx.spec.interactive ? [slab] : [], { update });
};
