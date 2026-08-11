import * as THREE from 'three';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam } from './common.js';

/** The filament colour; emissive, so it sits outside the surface palette. */
const FILAMENT = '#ffd9a0';

/**
 * A caged inspection lamp on a drop cable, never quite still. The point is the
 * sway: it is the only moving light in the room, so every shadow it casts
 * drifts with it. Origin is the ceiling fixing.
 */
export const hangingLamp: PropFactory = (ctx) => {
  const drop = numberParam(ctx, 'dropM', 0.75);
  const radius = numberParam(ctx, 'radius', 0.11);
  const intensity = numberParam(ctx, 'intensity', 7);
  const reach = numberParam(ctx, 'reachM', 5);
  const swayRad = numberParam(ctx, 'swayRad', 0.045);
  const swaySeconds = Math.max(0.6, numberParam(ctx, 'swaySeconds', 5.2));
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const hardware = material(ctx, 'hardware', 'metalDark');

  // Everything hangs off this; swinging it swings the light too.
  const pivot = new THREE.Group();
  pivot.name = `${ctx.spec.id}:pivot`;
  root.add(pivot);

  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI),
    hardware
  );
  hook.rotation.y = Math.PI / 2;
  hook.userData.egressNoShadow = true;
  root.add(hook);

  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, drop, 6),
    hardware
  );
  cable.position.y = -drop / 2;
  cable.userData.egressNoShadow = true;
  pivot.add(cable);

  const capHeight = radius * 0.75;
  // An open cone is back-face culled from below, which is exactly where the
  // player stands — so this one keeps both sides.
  const shadeMaterial = material(ctx, 'shade', 'metal').clone();
  shadeMaterial.side = THREE.DoubleSide;
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(radius, capHeight, 18, 1, true),
    shadeMaterial
  );
  shade.position.y = -drop - capHeight * 0.1;
  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.3, radius * 0.34, capHeight * 0.55, 12),
    hardware
  );
  socket.position.y = -drop + capHeight * 0.35;
  // The shade and socket straddle the bulb; the cage below it may still cast,
  // because those barred shadows are the whole charm of the fitting.
  shade.userData.egressNoShadow = true;
  socket.userData.egressNoShadow = true;
  pivot.add(shade, socket);

  // Guard cage: ribs from the shade rim down to a ring under the bulb.
  const ribs = 6;
  const cageDepth = radius * 1.5;
  for (let index = 0; index < ribs; index += 1) {
    const angle = (index / ribs) * Math.PI * 2;
    const rib = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0035, cageDepth, 5),
      hardware
    );
    rib.position.set(
      Math.cos(angle) * radius * 0.78,
      -drop - capHeight * 0.5 - cageDepth * 0.34,
      Math.sin(angle) * radius * 0.78
    );
    rib.rotation.z = Math.cos(angle) * 0.22;
    rib.rotation.x = -Math.sin(angle) * 0.22;
    pivot.add(rib);
  }
  for (const [ringRadius, y] of [
    [radius * 0.74, -drop - capHeight * 0.9],
    [radius * 0.4, -drop - capHeight * 0.5 - cageDepth * 0.72]
  ]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.004, 5, 16), hardware);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    pivot.add(ring);
  }

  const bulbMaterial = new THREE.MeshBasicMaterial({ color: FILAMENT, toneMapped: false });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.34, 12, 10), bulbMaterial);
  bulb.name = `${ctx.spec.id}:bulb`;
  bulb.position.y = -drop - capHeight * 0.62;
  bulb.visible = false;
  pivot.add(bulb);

  // A cone rather than a point light: one shadow map instead of six.
  const light = new THREE.SpotLight(FILAMENT, 0, reach, THREE.MathUtils.degToRad(74), 0.55, 2);
  light.name = `${ctx.spec.id}:light`;
  light.position.y = -drop - capHeight * 0.95;
  light.target.position.set(0, -drop - 2, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.0015;
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = reach;
  light.userData.poweredLight = true;
  pivot.add(light, light.target);

  let lit = false;
  let elapsed = Math.PI * numberParam(ctx, 'phase', 0);

  const update = (view: Parameters<NonNullable<ReturnType<PropFactory>['update']>>[0]) => {
    lit = view.lightsOn;
    light.intensity = lit ? intensity : 0;
    bulb.visible = lit;
  };

  const tick = (dtSeconds: number): void => {
    elapsed += dtSeconds;
    // Two incommensurate periods, so the swing wanders instead of ticking like
    // a metronome.
    const primary = (elapsed / swaySeconds) * Math.PI * 2;
    pivot.rotation.z = Math.sin(primary) * swayRad;
    pivot.rotation.x = Math.sin(primary * 0.61 + 1.1) * swayRad * 0.72;
  };
  tick(0);

  const instance = createInstance(root, [], { update, tick });
  return {
    ...instance,
    dispose() {
      light.dispose();
      bulbMaterial.dispose();
      shadeMaterial.dispose();
      instance.dispose();
    }
  };
};
