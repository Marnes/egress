import * as THREE from 'three';
import { SUMP_START_MM } from '@egress/core';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam } from './common.js';

/**
 * Standing water on the slab, fed by a drip from above. The drop and the ring
 * it leaves are what make the pool read as wet rather than painted on — a
 * still puddle just looks like a dark patch of floor.
 */
export const puddle: PropFactory = (ctx) => {
  const width = numberParam(ctx, 'w', 0.9);
  const depth = numberParam(ctx, 'd', 0.7);
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const decal = ctx.theme.decal('puddle');
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    decal?.material ?? material(ctx, 'water', 'ink')
  );
  pool.name = `${ctx.spec.id}:pool`;
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.002;
  root.add(pool);

  // The pool tracks the sump: pumping it out visibly shrinks the water.
  const fullMm = Math.max(1, numberParam(ctx, 'fullMm', SUMP_START_MM));
  const tracksSump = numberParam(ctx, 'tracksSump', 1) > 0;
  const update = (view: Parameters<NonNullable<ReturnType<PropFactory>['update']>>[0]) => {
    if (!tracksSump) return;
    const wet = Math.max(0, Math.min(1, view.sumpMm / fullMm));
    // Never quite dry: a slab that has held water keeps a damp patch.
    const spread = 0.28 + wet * 0.72;
    pool.scale.set(spread, spread, 1);
    pool.visible = wet > 0.001 || !view.pumpRunning;
    pool.userData.wet = wet;
  };

  const fallFrom = numberParam(ctx, 'dripFromM', 0);
  const period = Math.max(0.4, numberParam(ctx, 'dripSeconds', 2.6));
  if (fallFrom <= 0) return createInstance(root, [], { update });

  const waterMaterial = new THREE.MeshStandardMaterial({
    color: '#9fb3b8',
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.75
  });
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), waterMaterial);
  drop.scale.set(0.7, 1.5, 0.7);
  drop.name = `${ctx.spec.id}:drop`;
  root.add(drop);

  // Its own material, so the ring can fade as it spreads without taking the
  // drop's opacity with it.
  const rippleMaterial = new THREE.MeshStandardMaterial({
    color: '#b3c4c8',
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    opacity: 0
  });
  const ripple = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 5, 20), rippleMaterial);
  ripple.name = `${ctx.spec.id}:ripple`;
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.004;
  root.add(ripple);

  let elapsed = numberParam(ctx, 'phase', 0) * period;
  const tick = (dtSeconds: number): void => {
    elapsed = (elapsed + dtSeconds) % period;
    // The fall takes the first 62% of the cycle; the rest is the ring
    // spreading out while the next drop gathers at the joint above.
    const fallFor = period * 0.62;
    const falling = elapsed < fallFor;
    drop.visible = falling;
    if (falling) {
      const t = elapsed / fallFor;
      // Accelerating, so it drops rather than drifting down like a bubble.
      drop.position.y = fallFrom * (1 - t * t);
      drop.scale.set(0.7, 1.5 + t * 0.8, 0.7);
      rippleMaterial.opacity = 0;
      ripple.visible = false;
      return;
    }
    const spread = (elapsed - fallFor) / (period - fallFor);
    const size = 0.3 + spread * 3.4;
    ripple.scale.set(size, size, 1);
    rippleMaterial.opacity = 0.5 * (1 - spread) ** 1.5;
    ripple.visible = spread < 0.95;
  };
  tick(0);

  const instance = createInstance(root, [], { update, tick });
  return {
    ...instance,
    dispose() {
      waterMaterial.dispose();
      rippleMaterial.dispose();
      instance.dispose();
    }
  };
};
