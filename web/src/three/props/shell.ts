import * as THREE from 'three';
import { tileBoxUv, tileCylinderUv, tilePlaneUv } from '../textures/uv.js';
import type { PropFactory } from './registry.js';
import { createInstance, material, tileOf } from './common.js';

/**
 * The room envelope: brick walls on a poured slab, with the fittings that make
 * a basement read as one — corner piers, a skirting kerb, downstand joists, a
 * floor gully, a louvred vent, and a lintel over the doorway.
 */
export const shell: PropFactory = (ctx) => {
  const [width, height, depth] = ctx.bounds.size;
  const root = new THREE.Group();
  root.name = ctx.spec.id;
  const floorY = -height / 2;

  const wallMaterial = material(ctx, 'wall', 'wall');
  const wallTile = tileOf(ctx, 'wall', 'wall');
  const trimMaterial = material(ctx, 'trim', 'structure');
  const trimTile = tileOf(ctx, 'trim', 'structure');
  const detailMaterial = material(ctx, 'detail', 'metalDark');
  const detailTile = tileOf(ctx, 'detail', 'metalDark');

  const addBox = (
    size: [number, number, number],
    position: [number, number, number],
    surface: THREE.MeshStandardMaterial,
    tile: ReturnType<typeof tileOf>,
    offset: [number, number] = [0, 0]
  ): THREE.Mesh => {
    const geometry = new THREE.BoxGeometry(...size);
    tileBoxUv(geometry, size, tile, offset);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(...position);
    root.add(mesh);
    return mesh;
  };

  const plane = (
    name: string,
    size: [number, number],
    position: [number, number, number],
    rotation: [number, number, number],
    slot: string,
    fallback: 'floor' | 'wall' | 'ceiling',
    offset: [number, number]
  ) => {
    const geometry = new THREE.PlaneGeometry(...size);
    tilePlaneUv(geometry, size[0], size[1], tileOf(ctx, slot, fallback), offset);
    const mesh = new THREE.Mesh(geometry, material(ctx, slot, fallback));
    mesh.name = `${ctx.spec.id}:${name}`;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    root.add(mesh);
  };

  // Offsets stagger the tile on each surface so the repeat never lines up.
  plane('floor', [width, depth], [0, floorY, 0], [-Math.PI / 2, 0, 0], 'floor', 'floor', [0, 0]);
  plane('ceiling', [width, depth], [0, height / 2, 0], [Math.PI / 2, 0, 0], 'ceiling', 'ceiling', [0.31, 0.17]);
  plane('wall-n', [width, height], [0, 0, -depth / 2], [0, 0, 0], 'wall', 'wall', [0, 0]);
  plane('wall-s', [width, height], [0, 0, depth / 2], [0, Math.PI, 0], 'wall', 'wall', [0.37, 0.5]);
  plane('wall-w', [depth, height], [-width / 2, 0, 0], [0, Math.PI / 2, 0], 'wall', 'wall', [0.63, 0.25]);
  plane('wall-e', [depth, height], [width / 2, 0, 0], [0, -Math.PI / 2, 0], 'wall', 'wall', [0.19, 0.75]);

  // Rising damp off the slab and soot under the soffit. These are room-scale
  // gradients, so they ride over the brick as bands rather than tiling with it.
  const walls: { length: number; position: [number, number, number]; rotation: number }[] = [
    { length: width, position: [0, 0, -depth / 2], rotation: 0 },
    { length: width, position: [0, 0, depth / 2], rotation: Math.PI },
    { length: depth, position: [-width / 2, 0, 0], rotation: Math.PI / 2 },
    { length: depth, position: [width / 2, 0, 0], rotation: -Math.PI / 2 }
  ];
  const band = (kind: 'damp' | 'soot', bandHeight: number, centreY: number) => {
    const decal = ctx.theme.decal(kind);
    if (!decal) return;
    for (const [index, wall] of walls.entries()) {
      const geometry = new THREE.PlaneGeometry(wall.length, bandHeight);
      tilePlaneUv(geometry, wall.length, bandHeight, [decal.tileM, bandHeight], [index * 0.23, 0]);
      const mesh = new THREE.Mesh(geometry, decal.material);
      mesh.name = `${ctx.spec.id}:${kind}-${index}`;
      // Nudge along the wall's inward normal so the band floats just clear.
      const inset = 0.018;
      mesh.position.set(
        wall.position[0] + Math.sin(wall.rotation) * inset,
        centreY,
        wall.position[2] + Math.cos(wall.rotation) * inset
      );
      mesh.rotation.y = wall.rotation;
      root.add(mesh);
    }
  };
  band('damp', 1.25, floorY + 0.625);
  band('soot', 0.7, height / 2 - 0.35);

  // Brick piers thicken the corners and hide the plane joints.
  const pier = 0.17;
  for (const x of [-width / 2 + pier / 2, width / 2 - pier / 2]) {
    for (const z of [-depth / 2 + pier / 2, depth / 2 - pier / 2]) {
      addBox([pier, height, pier], [x, 0, z], wallMaterial, wallTile, [Math.abs(x) * 0.1, Math.abs(z) * 0.1]);
    }
  }

  // Screed kerb where the slab turns up to meet the brick.
  const kerbHeight = 0.16;
  const kerbDepth = 0.08;
  for (const z of [-depth / 2 + kerbDepth / 2, depth / 2 - kerbDepth / 2]) {
    addBox([width, kerbHeight, kerbDepth], [0, floorY + kerbHeight / 2, z], trimMaterial, trimTile);
  }
  for (const x of [-width / 2 + kerbDepth / 2, width / 2 - kerbDepth / 2]) {
    addBox([kerbDepth, kerbHeight, depth], [x, floorY + kerbHeight / 2, 0], trimMaterial, trimTile);
  }

  // Construction joints cast into the slab.
  for (let x = -width / 2 + 1.5; x < width / 2 - 0.1; x += 1.5) {
    addBox([0.014, 0.008, depth], [x, floorY + 0.004, 0], detailMaterial, detailTile);
  }
  for (let z = -depth / 2 + 2; z < depth / 2 - 0.1; z += 2) {
    addBox([width, 0.008, 0.014], [0, floorY + 0.004, z], detailMaterial, detailTile);
  }

  // Downstand joists under the slab soffit.
  for (let z = -depth / 2 + 0.75; z < depth / 2; z += 1.5) {
    addBox([width, 0.13, 0.11], [0, height / 2 - 0.07, z], trimMaterial, trimTile);
  }

  // Floor gully: a sunk sump behind a grating, offset out of the walking line.
  const drain = new THREE.Group();
  drain.position.set(width * 0.2, floorY, -depth * 0.25);
  const sumpGeometry = new THREE.CylinderGeometry(0.13, 0.115, 0.06, 20);
  tileCylinderUv(sumpGeometry, 0.13, 0.06, detailTile);
  const sump = new THREE.Mesh(sumpGeometry, detailMaterial);
  sump.position.y = -0.028;
  const rimGeometry = new THREE.TorusGeometry(0.15, 0.022, 8, 24);
  const rim = new THREE.Mesh(rimGeometry, trimMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.004;
  drain.add(sump, rim);
  for (let i = -2; i <= 2; i += 1) {
    const barGeometry = new THREE.BoxGeometry(0.022, 0.014, 0.26);
    tileBoxUv(barGeometry, [0.022, 0.014, 0.26], detailTile);
    const bar = new THREE.Mesh(barGeometry, detailMaterial);
    bar.position.set(i * 0.05, 0.012, 0);
    drain.add(bar);
  }
  root.add(drain);

  // Louvred vent punched through the brickwork near the soffit.
  const vent = new THREE.Group();
  vent.position.set(width * 0.32, height * 0.22, -depth / 2 + 0.02);
  const ventBack = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), detailMaterial);
  ventBack.position.z = 0.005;
  const frameGeometry = new THREE.BoxGeometry(0.5, 0.34, 0.05);
  tileBoxUv(frameGeometry, [0.5, 0.34, 0.05], trimTile);
  const ventFrame = new THREE.Mesh(frameGeometry, trimMaterial);
  ventFrame.position.z = 0.005;
  vent.add(ventFrame, ventBack);
  for (let i = 0; i < 4; i += 1) {
    const slatGeometry = new THREE.BoxGeometry(0.4, 0.035, 0.05);
    tileBoxUv(slatGeometry, [0.4, 0.035, 0.05], detailTile);
    const slat = new THREE.Mesh(slatGeometry, detailMaterial);
    slat.position.set(0, 0.09 - i * 0.06, 0.045);
    slat.rotation.x = -0.42;
    vent.add(slat);
  }
  root.add(vent);

  // Concrete lintel carrying the brickwork over the doorway.
  addBox(
    [0.14, 0.18, 1.35],
    [width / 2 - 0.09, floorY + 2.24, 0],
    trimMaterial,
    trimTile
  );

  return createInstance(root, []);
};
