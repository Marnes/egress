import * as THREE from 'three';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam } from './common.js';

/**
 * Scripted strike of a cold fluorescent tube: it flashes, stutters a few
 * times, and settles. Values are held between steps rather than interpolated,
 * because a tube snaps between states rather than fading.
 */
const STRIKE: readonly (readonly [number, number])[] = [
  [0, 0.9],
  [0.07, 0.06],
  [0.16, 0],
  [0.24, 1],
  [0.31, 0.08],
  [0.44, 0],
  [0.52, 0.8],
  [0.6, 0.12],
  [0.72, 1],
  [0.8, 0.4],
  [0.92, 1],
  [1.02, 0.7],
  [1.18, 1]
];
const STRIKE_SECONDS = 1.35;

function strikeLevel(elapsed: number): number {
  if (elapsed < 0) return 0;
  if (elapsed >= STRIKE_SECONDS) return 1;
  let level = STRIKE[0][1];
  for (const [at, value] of STRIKE) {
    if (elapsed < at) break;
    level = value;
  }
  return level;
}

export const poweredCeilingLight: PropFactory = (ctx) => {
  const width = numberParam(ctx, 'w', 1.6);
  const depth = numberParam(ctx, 'd', 0.28);
  const thickness = numberParam(ctx, 'h', 0.08);
  const intensity = numberParam(ctx, 'intensity', 18);
  const reach = numberParam(ctx, 'reachM', 7);
  // Staggering the fixtures keeps the room from snapping on all at once.
  const strikeDelay = Math.max(0, numberParam(ctx, 'strikeDelaySec', 0));
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(width, thickness, depth),
    material(ctx, 'housing', 'structure')
  );
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: ctx.theme.palette.ceiling,
    emissive: ctx.theme.spec.lightRig.ambient.color,
    emissiveIntensity: 0,
    roughness: 0.35,
    metalness: 0
  });
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.88, thickness * 0.14, depth * 0.7),
    panelMaterial
  );
  panel.name = `${ctx.spec.id}:panel`;
  panel.position.y = -thickness * 0.56;

  const light = new THREE.SpotLight(
    ctx.theme.spec.lightRig.ambient.color,
    0,
    reach,
    THREE.MathUtils.degToRad(72),
    0.72,
    2
  );
  light.name = `${ctx.spec.id}:light`;
  light.position.y = -thickness;
  light.target.position.set(0, -2, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.001;
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = reach;
  light.userData.poweredLight = true;
  root.add(housing, panel, light, light.target);

  let powered = false;
  let elapsed = Number.POSITIVE_INFINITY;

  const applyLevel = (): void => {
    const level = powered ? strikeLevel(elapsed - strikeDelay) : 0;
    light.intensity = intensity * level;
    panelMaterial.emissiveIntensity = 2.8 * level;
    panel.userData.powered = powered;
    panel.userData.level = level;
  };

  const update = (view: Parameters<NonNullable<ReturnType<PropFactory>['update']>>[0]) => {
    if (view.lightsOn && !powered) elapsed = 0;
    if (!view.lightsOn) elapsed = Number.POSITIVE_INFINITY;
    powered = view.lightsOn;
    applyLevel();
  };

  const tick = (dtSeconds: number): void => {
    if (!powered || elapsed >= STRIKE_SECONDS + strikeDelay) return;
    elapsed += dtSeconds;
    applyLevel();
  };

  const instance = createInstance(root, [], { update, tick });
  return {
    ...instance,
    dispose() {
      light.dispose();
      panelMaterial.dispose();
      instance.dispose();
    }
  };
};
