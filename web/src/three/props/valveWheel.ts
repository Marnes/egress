import * as THREE from 'three';
import { tileCylinderUv } from '../textures/uv.js';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam, tileOf, viewObject } from './common.js';

/**
 * The discharge valve on the pump riser: body, bonnet, stem and handwheel.
 * The wheel winds through several turns between shut and open and eases into
 * position, so the player can see which way it has been left.
 */
export const valveWheel: PropFactory = (ctx) => {
  const radius = numberParam(ctx, 'radius', 0.1);
  const bore = numberParam(ctx, 'bore', 0.058);
  const turns = numberParam(ctx, 'turns', 2.5);
  // Gate valves on a vertical line are usually hung with the stem out
  // sideways so the wheel is reachable — which also makes it readable.
  const tilt = numberParam(ctx, 'stemTiltRad', -Math.PI / 2);
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const bodyMaterial = material(ctx, 'body', 'metal');
  const bodyTile = tileOf(ctx, 'body', 'metal');
  const hardware = material(ctx, 'hardware', 'metalDark');

  const body = new THREE.CylinderGeometry(bore * 1.5, bore * 1.5, bore * 2.4, 18);
  tileCylinderUv(body, bore * 1.5, bore * 2.4, bodyTile);
  const valveBody = new THREE.Mesh(body, bodyMaterial);
  valveBody.name = `${ctx.spec.id}:body`;
  root.add(valveBody);

  // Everything above the body leans out along the stem axis.
  const column = new THREE.Group();
  column.rotation.x = tilt;
  root.add(column);

  const bonnet = new THREE.Mesh(
    new THREE.CylinderGeometry(bore * 1.15, bore * 1.35, bore * 0.7, 16),
    hardware
  );
  bonnet.position.y = bore * 1.5;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(bore * 0.16, bore * 0.16, bore * 1.6, 10),
    hardware
  );
  stem.position.y = bore * 2.4;
  column.add(bonnet, stem);

  // The wheel turns on the stem; everything behind it stays put.
  const wheel = new THREE.Group();
  wheel.name = `${ctx.spec.id}:wheel`;
  wheel.position.y = bore * 3.15;
  column.add(wheel);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.11, 8, 24), bodyMaterial);
  rim.rotation.x = Math.PI / 2;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, radius * 0.22, 12),
    bodyMaterial
  );
  wheel.add(rim, hub);
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.95, radius * 0.07, radius * 0.09),
      bodyMaterial
    );
    spoke.position.set(Math.cos(angle) * radius * 0.5, 0, Math.sin(angle) * radius * 0.5);
    spoke.rotation.y = -angle;
    wheel.add(spoke);
  }

  const lockPin = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.07, radius * 0.07, radius * 0.8, 10),
    hardware
  );
  lockPin.name = `${ctx.spec.id}:lock-pin`;
  lockPin.rotation.z = Math.PI / 2;
  lockPin.position.set(radius * 0.62, wheel.position.y, 0);
  column.add(lockPin);

  const openAngle = turns * Math.PI * 2;
  let target = 0;
  const update = (view: Parameters<NonNullable<ReturnType<PropFactory>['update']>>[0]) => {
    const crankAvailable =
      viewObject(view, ctx.spec.objectId)?.actions.some(
        (action) => action.id === 'turn_crank' && action.enabled
      ) === true;
    target = view.valveOpen ? openAngle : 0;
    wheel.userData.open = view.valveOpen;
    wheel.userData.available = crankAvailable;
    lockPin.visible = !view.valveOpen && !crankAvailable;
  };
  const tick = (dtSeconds: number): void => {
    const delta = target - wheel.rotation.y;
    if (Math.abs(delta) < 1e-4) {
      wheel.rotation.y = target;
      return;
    }
    // Winds at a believable speed rather than snapping between states.
    const step = Math.sign(delta) * Math.min(Math.abs(delta), dtSeconds * openAngle * 0.9);
    wheel.rotation.y += step;
  };

  return createInstance(root, ctx.spec.interactive ? [valveBody, rim, hub] : [], { update, tick });
};
