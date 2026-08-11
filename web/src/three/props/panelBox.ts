import * as THREE from 'three';
import { raisedTextGeometry, raisedTextWidth } from '../text/raisedText.js';
import { tileBoxUv } from '../textures/uv.js';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam, stringParam, tileOf } from './common.js';

/** The lamp makes its own light, so it sits outside the surface palette. */
const LAMP_DARK = '#241f1c';
const LAMP_RELEASED = '#63e08c';

/**
 * A breaker enclosure: a deadfront back-box with steel sides and a louvred
 * door, under a bolted nameplate. A shut door is the lock — there is no
 * lettering and no signal light for it, only the released lamp coming up
 * green once control lets the door go.
 */
export const panelBox: PropFactory = (ctx) => {
  const width = numberParam(ctx, 'w', 0.6);
  const height = numberParam(ctx, 'h', 0.8);
  const depth = numberParam(ctx, 'd', 0.12);
  const hingeLeft = stringParam(ctx, 'hinge', 'left') !== 'right';
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const doorThickness = Math.max(depth * 0.18, 0.012);
  // Breakers are mounted proud of the deadfront, so the cabinet is deep enough
  // for the door to close in front of them rather than through them.
  const standoff = numberParam(ctx, 'doorStandoffM', depth * 1.15);
  const frontZ = depth / 2 + standoff;
  const sideDepth = standoff - doorThickness / 2;
  const sideZ = depth / 2 + sideDepth / 2;
  const frameFace = depth / 2 + sideDepth;

  const bodySize: [number, number, number] = [width, height, depth];
  const bodyGeometry = new THREE.BoxGeometry(...bodySize);
  tileBoxUv(bodyGeometry, bodySize, tileOf(ctx, 'body', 'metal'));
  const body = new THREE.Mesh(bodyGeometry, material(ctx, 'body', 'metal'));

  const interiorMaterial = material(ctx, 'interior', 'structure');
  const interior = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.86, height * 0.86),
    interiorMaterial
  );
  interior.position.z = depth / 2 + 0.001;

  // Deadfront plates flanking the breaker column, and the earth bar below it.
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.19, height * 0.78, 0.006),
      interiorMaterial
    );
    plate.position.set(side * width * 0.33, 0, depth / 2 + 0.005);
    root.add(plate);
  }
  const earthBar = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.5, height * 0.035, 0.012),
    material(ctx, 'hardware', 'metalDark')
  );
  earthBar.position.set(0, -height * 0.38, depth / 2 + 0.008);
  root.add(earthBar);

  // The rims are the cabinet's sides: they carry the box out to the door.
  const rimMaterial = material(ctx, 'rim', 'metalDark');
  const rimWidth = Math.max(width * 0.035, 0.018);
  const rimTile = tileOf(ctx, 'rim', 'metalDark');
  const rim = (size: [number, number, number], x: number, y: number): void => {
    const geometry = new THREE.BoxGeometry(...size);
    tileBoxUv(geometry, size, rimTile);
    const mesh = new THREE.Mesh(geometry, rimMaterial);
    mesh.position.set(x, y, sideZ);
    root.add(mesh);
  };
  rim([width, rimWidth, sideDepth], 0, height / 2 - rimWidth / 2);
  rim([width, rimWidth, sideDepth], 0, -height / 2 + rimWidth / 2);
  rim([rimWidth, height, sideDepth], -width / 2 + rimWidth / 2, 0);
  rim([rimWidth, height, sideDepth], width / 2 - rimWidth / 2, 0);

  const screwMaterial = material(ctx, 'hardware', 'metalDark');
  for (const x of [-width * 0.43, width * 0.43]) {
    for (const y of [-height * 0.43, height * 0.43]) {
      const screw = new THREE.Mesh(
        new THREE.CylinderGeometry(rimWidth * 0.18, rimWidth * 0.18, depth * 0.04, 12),
        screwMaterial
      );
      screw.rotation.x = Math.PI / 2;
      screw.position.set(x, y, frameFace - 0.003);
      root.add(screw);
    }
  }

  const hinge = new THREE.Group();
  hinge.name = `${ctx.spec.id}:door`;
  hinge.position.set((hingeLeft ? -1 : 1) * width / 2, 0, frontZ);
  const doorSize: [number, number, number] = [width, height, doorThickness];
  const doorGeometry = new THREE.BoxGeometry(...doorSize);
  tileBoxUv(doorGeometry, doorSize, tileOf(ctx, 'door', 'metalDark'));
  const doorMesh = new THREE.Mesh(doorGeometry, material(ctx, 'door', 'metalDark'));
  doorMesh.position.x = (hingeLeft ? 1 : -1) * width / 2;
  const doorFace = doorThickness / 2;

  // Louvred vent grid, the way a live enclosure is always ventilated.
  const grilleWidth = width * 0.58;
  const grilleHeight = height * 0.34;
  const grilleY = height * 0.15;
  const grilleBack = new THREE.Mesh(
    new THREE.PlaneGeometry(grilleWidth, grilleHeight),
    material(ctx, 'vent', 'ink')
  );
  grilleBack.position.set(0, grilleY, doorFace + 0.001);
  doorMesh.add(grilleBack);
  const bar = 0.004;
  for (let i = 1; i <= 7; i += 1) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(bar, grilleHeight, bar * 1.4), rimMaterial);
    rib.position.set(grilleWidth * (i / 8 - 0.5), grilleY, doorFace + 0.004);
    doorMesh.add(rib);
  }
  for (let i = 1; i <= 4; i += 1) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(grilleWidth, bar, bar * 1.4), rimMaterial);
    rib.position.set(0, grilleY + grilleHeight * (i / 5 - 0.5), doorFace + 0.005);
    doorMesh.add(rib);
  }
  for (const [size, offset] of [
    [[grilleWidth + bar * 4, bar * 2.5, bar * 2], [0, grilleHeight / 2]],
    [[grilleWidth + bar * 4, bar * 2.5, bar * 2], [0, -grilleHeight / 2]],
    [[bar * 2.5, grilleHeight, bar * 2], [-grilleWidth / 2, 0]],
    [[bar * 2.5, grilleHeight, bar * 2], [grilleWidth / 2, 0]]
  ] as [[number, number, number], [number, number]][]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(...size), rimMaterial);
    edge.position.set(offset[0], grilleY + offset[1], doorFace + 0.005);
    doorMesh.add(edge);
  }
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.05, height * 0.16, doorThickness * 1.6),
    material(ctx, 'hardware', 'metal')
  );
  handle.position.set((hingeLeft ? 1 : -1) * width * 0.4, -height * 0.22, doorFace + 0.01);
  doorMesh.add(handle);
  hinge.add(doorMesh);

  // Nameplate above the cabinet: how the room says what this box is. The
  // lettering is modelled rather than painted — raised bars standing off a
  // backing plate, so it catches the light and throws its own shadow.
  const label = stringParam(ctx, 'label', '').toUpperCase();
  if (label) {
    const capHeight = height * 0.088;
    const relief = capHeight * 0.42;
    // Chunky strokes and a deep extrusion: the letters should read as solid
    // printed stock, not as an outline.
    const type = { capHeight, depth: relief, strokeRatio: 0.24, tracking: 0.17 };
    const letters = raisedTextGeometry(label, type);
    const textWidth = raisedTextWidth(label, type);
    const margin = capHeight * 0.72;
    const plateWidth = Math.max(width * 0.72, textWidth + margin * 2);
    const plateHeight = capHeight + margin * 1.4;
    const plateThickness = capHeight * 0.3;
    const plateY = height / 2 + plateHeight * 0.78;
    const plateZ = -depth / 2 + plateThickness / 2;

    const plateSize: [number, number, number] = [plateWidth, plateHeight, plateThickness];
    const plateGeometry = new THREE.BoxGeometry(...plateSize);
    tileBoxUv(plateGeometry, plateSize, tileOf(ctx, 'plate', 'ink'));
    const plate = new THREE.Mesh(plateGeometry, material(ctx, 'plate', 'ink'));
    plate.position.set(0, plateY, plateZ);
    root.add(plate);

    // A raised border around the face, the way a printed placard is drawn.
    const borderMaterial = material(ctx, 'letters', 'accent');
    const border = capHeight * 0.12;
    const borderZ = plateZ + plateThickness / 2 + border / 2;
    for (const [size, offset] of [
      [[plateWidth - margin * 0.6, border, border], [0, (plateHeight - margin * 0.6) / 2]],
      [[plateWidth - margin * 0.6, border, border], [0, -(plateHeight - margin * 0.6) / 2]],
      [[border, plateHeight - margin * 0.6, border], [-(plateWidth - margin * 0.6) / 2, 0]],
      [[border, plateHeight - margin * 0.6, border], [(plateWidth - margin * 0.6) / 2, 0]]
    ] as [[number, number, number], [number, number]][]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(...size), borderMaterial);
      rail.position.set(offset[0], plateY + offset[1], borderZ);
      root.add(rail);
    }

    if (letters) {
      const lettering = new THREE.Mesh(letters, borderMaterial);
      lettering.name = `${ctx.spec.id}:label`;
      lettering.userData.value = label;
      lettering.position.set(0, plateY, plateZ + plateThickness / 2 + relief / 2);
      root.add(lettering);
    }
  }

  // Cabinet lamp: dark while the lock holds, green once control releases it.
  const lampMaterial = new THREE.MeshBasicMaterial({ color: LAMP_DARK, toneMapped: false });
  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(width * 0.026, width * 0.026, 0.01, 12),
    lampMaterial
  );
  lamp.name = `${ctx.spec.id}:lamp`;
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, height * 0.44, frameFace + 0.002);
  root.add(body, interior, lamp, hinge);

  const openAngle = numberParam(ctx, 'openRad', hingeLeft ? -1.9 : 1.9);
  let locked = true;
  const update = (view: Parameters<NonNullable<ReturnType<PropFactory>['update']>>[0]) => {
    locked = view.panelLocked;
    hinge.rotation.y = locked ? 0 : openAngle;
    hinge.userData.targetAngle = hinge.rotation.y;
    lampMaterial.color.set(locked ? LAMP_DARK : LAMP_RELEASED);
    lamp.userData.locked = locked;
  };

  const instance = createInstance(root, ctx.spec.interactive ? [body, doorMesh] : [], { update });
  return {
    ...instance,
    dispose() {
      lampMaterial.dispose();
      instance.dispose();
    }
  };
};
