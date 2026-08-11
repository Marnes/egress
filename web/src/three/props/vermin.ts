import * as THREE from 'three';
import { mulberry32 } from '../textures/procedural.js';
import type { PropFactory } from './registry.js';
import { createInstance, numberParam } from './common.js';

/**
 * Mice working the base of a wall. Each one dashes the length of its run,
 * freezes, then bolts back — the stop-start is what reads as alive, so the
 * pauses matter more than the speed. The prop's transform lays out the run
 * along local +x; give it the wall's rotation to send them the other way.
 */
export const vermin: PropFactory = (ctx) => {
  const count = Math.max(1, Math.round(numberParam(ctx, 'count', 2)));
  const run = numberParam(ctx, 'runM', 1.6);
  const scale = numberParam(ctx, 'scale', 1);
  const spread = numberParam(ctx, 'spreadM', 0.12);
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  // Fur is not one of the room's surfaces, so this sits outside the palette
  // rather than borrowing concrete or painted steel for a living thing.
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: '#4b433c',
    roughness: 0.93,
    metalness: 0
  });
  const rng = mulberry32(Math.round(numberParam(ctx, 'seed', 0x5eed)) >>> 0);

  const mice: {
    group: THREE.Group;
    tail: THREE.Mesh;
    lane: number;
    cycle: number;
    phase: number;
    lift: number;
  }[] = [];

  for (let index = 0; index < count; index += 1) {
    const size = 0.039 * scale * (0.85 + rng() * 0.3);
    const group = new THREE.Group();
    group.name = `${ctx.spec.id}:mouse-${index}`;

    const body = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), bodyMaterial);
    body.scale.set(1.9, 0.92, 1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(size * 0.62, 8, 6), bodyMaterial);
    head.position.set(size * 1.75, -size * 0.05, 0);
    group.add(body, head);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(size * 0.3, 6, 5), bodyMaterial);
      ear.scale.set(0.4, 1, 1);
      ear.position.set(size * 1.5, size * 0.5, side * size * 0.45);
      group.add(ear);
    }

    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.09, size * 0.03, size * 2.6, 5),
      bodyMaterial
    );
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-size * 2.1, size * 0.15, 0);
    group.add(tail);

    group.position.y = size * 0.85;
    root.add(group);
    mice.push({
      group,
      tail,
      lane: (rng() - 0.5) * spread,
      cycle: 2.4 + rng() * 2.6,
      phase: rng(),
      lift: size * 0.22
    });
  }

  let elapsed = 0;
  const tick = (dtSeconds: number): void => {
    elapsed += dtSeconds;
    for (const mouse of mice) {
      const t = ((elapsed / mouse.cycle + mouse.phase) % 1 + 1) % 1;
      // Dash, hold, dash back, hold — a mouse never strolls.
      let travel: number;
      let heading: number;
      if (t < 0.32) {
        travel = ease(t / 0.32);
        heading = 1;
      } else if (t < 0.5) {
        travel = 1;
        heading = 1;
      } else if (t < 0.82) {
        travel = 1 - ease((t - 0.5) / 0.32);
        heading = -1;
      } else {
        travel = 0;
        heading = -1;
      }
      const moving = t < 0.32 || (t >= 0.5 && t < 0.82);
      mouse.group.position.x = (travel - 0.5) * run;
      mouse.group.position.z = mouse.lane;
      mouse.group.rotation.y = heading > 0 ? 0 : Math.PI;
      // Scurrying bobs the body and flicks the tail; a stopped mouse only twitches.
      const scurry = moving ? Math.sin(elapsed * 26 + mouse.phase * 9) : 0;
      mouse.group.position.y = mouse.lift * 3.9 + (moving ? Math.abs(scurry) * mouse.lift : 0);
      mouse.tail.rotation.y = scurry * 0.5 + (moving ? 0 : Math.sin(elapsed * 3) * 0.12);
    }
  };
  tick(0);

  const instance = createInstance(root, [], { tick });
  return {
    ...instance,
    dispose() {
      bodyMaterial.dispose();
      instance.dispose();
    }
  };
};

function ease(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped * clamped * (3 - 2 * clamped);
}
