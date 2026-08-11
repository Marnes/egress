import * as THREE from 'three';
import { tileBoxUv, tileCylinderUv } from '../textures/uv.js';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam, tileOf } from './common.js';

/**
 * The thing the room is named after: an end-suction centrifugal pump on a
 * bedplate — volute, coupling guard, finned motor, and a discharge elbow
 * turning up toward the riser manifold. Origin sits on the plinth top.
 */
export const pump: PropFactory = (ctx) => {
  const scale = numberParam(ctx, 'scale', 1);
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const caseMaterial = material(ctx, 'body', 'metal');
  const caseTile = tileOf(ctx, 'body', 'metal');
  const hardware = material(ctx, 'hardware', 'metalDark');
  const hardwareTile = tileOf(ctx, 'hardware', 'metalDark');
  const variant = numberParam(ctx, 'variant', 0);
  const uv: [number, number] = [variant * 0.31, variant * 0.47];

  const box = (
    size: [number, number, number],
    position: [number, number, number],
    surface: THREE.MeshStandardMaterial,
    tile: ReturnType<typeof tileOf>
  ): THREE.Mesh => {
    const scaled: [number, number, number] = [size[0] * scale, size[1] * scale, size[2] * scale];
    const geometry = new THREE.BoxGeometry(...scaled);
    tileBoxUv(geometry, scaled, tile, uv);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(position[0] * scale, position[1] * scale, position[2] * scale);
    root.add(mesh);
    return mesh;
  };

  const tube = (
    radius: number,
    length: number,
    surface: THREE.MeshStandardMaterial,
    tile: ReturnType<typeof tileOf>,
    segments = 20
  ): THREE.Mesh => {
    const geometry = new THREE.CylinderGeometry(radius * scale, radius * scale, length * scale, segments);
    tileCylinderUv(geometry, radius * scale, length * scale, tile, uv);
    return new THREE.Mesh(geometry, surface);
  };

  // Bedplate and its holding-down bolts.
  box([0.74, 0.05, 0.42], [0, 0.025, 0], hardware, hardwareTile);
  for (const x of [-0.31, 0.31]) {
    for (const z of [-0.15, 0.15]) {
      const bolt = tube(0.016, 0.05, hardware, hardwareTile, 8);
      bolt.position.set(x * scale, 0.06 * scale, z * scale);
      root.add(bolt);
    }
  }

  // Motor: a finned can with a fan cowl on the outboard end.
  const motor = tube(0.115, 0.34, caseMaterial, caseTile, 24);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(0.17 * scale, 0.2 * scale, 0);
  motor.name = `${ctx.spec.id}:motor`;
  root.add(motor);
  for (let index = 0; index < 7; index += 1) {
    const fin = tube(0.125, 0.012, caseMaterial, caseTile, 20);
    fin.rotation.z = Math.PI / 2;
    fin.position.set((0.04 + index * 0.045) * scale, 0.2 * scale, 0);
    root.add(fin);
  }
  const cowl = tube(0.1, 0.07, hardware, hardwareTile, 16);
  cowl.rotation.z = Math.PI / 2;
  cowl.position.set(0.37 * scale, 0.2 * scale, 0);
  root.add(cowl);
  const terminalBox = box([0.13, 0.09, 0.11], [0.17, 0.33, 0], hardware, hardwareTile);
  terminalBox.rotation.y = 0.12;

  // Coupling guard between motor and pump end.
  const guard = box([0.11, 0.17, 0.17], [-0.02, 0.2, 0], hardware, hardwareTile);
  guard.name = `${ctx.spec.id}:guard`;

  // Volute: the casing plus its tangential discharge throat.
  const volute = tube(0.155, 0.13, caseMaterial, caseTile, 26);
  volute.rotation.z = Math.PI / 2;
  volute.position.set(-0.15 * scale, 0.2 * scale, 0);
  volute.name = `${ctx.spec.id}:volute`;
  root.add(volute);
  const throat = box([0.13, 0.14, 0.13], [-0.15, 0.32, 0], caseMaterial, caseTile);

  // Suction eye out the front, with a bolted flange.
  const suction = tube(0.07, 0.12, caseMaterial, caseTile, 18);
  suction.rotation.z = Math.PI / 2;
  suction.position.set(-0.28 * scale, 0.2 * scale, 0);
  root.add(suction);
  const flange = tube(0.105, 0.022, hardware, hardwareTile, 18);
  flange.rotation.z = Math.PI / 2;
  flange.position.set(-0.34 * scale, 0.2 * scale, 0);
  root.add(flange);

  // Discharge: up out of the throat, then a bend back into the wall manifold.
  const riseHeight = numberParam(ctx, 'riseM', 0.85);
  const rise = tube(0.058, riseHeight, caseMaterial, caseTile, 18);
  rise.position.set(-0.15 * scale, (0.38 + riseHeight / 2) * scale, 0);
  root.add(rise);
  const elbow = new THREE.Mesh(
    new THREE.SphereGeometry(0.062 * scale, 14, 10),
    caseMaterial
  );
  elbow.position.set(-0.15 * scale, (0.38 + riseHeight) * scale, 0);
  root.add(elbow);
  const runOut = numberParam(ctx, 'runM', 0.5);
  const run = tube(0.058, runOut, caseMaterial, caseTile, 18);
  run.rotation.x = Math.PI / 2;
  run.position.set(-0.15 * scale, (0.38 + riseHeight) * scale, (runOut / 2) * scale);
  root.add(run);
  const collar = tube(0.075, 0.03, hardware, hardwareTile, 18);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(-0.15 * scale, (0.38 + riseHeight) * scale, (runOut * 0.62) * scale);
  root.add(collar);

  root.add(terminalBox, guard, throat);
  return createInstance(root, ctx.spec.interactive ? [motor, volute] : []);
};
