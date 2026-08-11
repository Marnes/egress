import * as THREE from 'three';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam, panelMaterial, viewObject } from './common.js';

export const gaugeDial: PropFactory = (ctx) => {
  const radius = numberParam(ctx, 'radius', 0.1);
  const depth = numberParam(ctx, 'depth', 0.025);
  const hasWaterJet = ctx.spec.params?.waterJet === true;
  const showValue = ctx.spec.params?.showValue !== false;
  const panel = ctx.legible?.glyphPanel({ widthPx: 256, heightPx: 256, aspectM: [radius * 2, radius * 2] });
  const root = new THREE.Group();
  root.name = ctx.spec.id;
  const bezel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, depth, 48),
    material(ctx, 'bezel', 'metalDark')
  );
  bezel.name = `${ctx.spec.id}:bezel`;
  bezel.rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.82, 32), panelMaterial(ctx, panel));
  face.position.z = -depth / 2 - 0.001;
  face.rotation.y = Math.PI;
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: ctx.theme.palette.ceiling,
    roughness: 0.08,
    metalness: 0,
    transmission: 0.45,
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });
  const glass = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.8, 48), glassMaterial);
  glass.position.z = -depth / 2 - 0.003;
  glass.rotation.y = Math.PI;
  root.add(bezel, face, glass);

  const water = new THREE.Group();
  water.name = `${ctx.spec.id}:water`;
  const waterMaterial = hasWaterJet
    ? new THREE.MeshBasicMaterial({
        color: '#68aebb',
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    : undefined;
  const splashMaterial = waterMaterial?.clone();
  const droplets: THREE.Mesh[] = [];
  let waterCurve: THREE.CatmullRomCurve3 | undefined;
  let splash: THREE.Mesh | undefined;
  if (waterMaterial) {
    const drop = numberParam(ctx, 'waterDropM', 1.4);
    const reach = numberParam(ctx, 'waterReachM', 0.8);
    const source = new THREE.Vector3(0, 0, -depth / 2 - 0.014);
    const landing = new THREE.Vector3(0, -drop, -reach);
    waterCurve = new THREE.CatmullRomCurve3([
      source,
      new THREE.Vector3(0, -drop * 0.015, -reach * 0.28),
      new THREE.Vector3(0, -drop * 0.15, -reach * 0.58),
      new THREE.Vector3(0, -drop * 0.52, -reach * 0.83),
      landing
    ]);

    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.46, 24),
      material(ctx, 'hole', 'ink')
    );
    hole.name = `${ctx.spec.id}:water-hole`;
    hole.position.copy(source).add(new THREE.Vector3(0, 0, 0.003));
    hole.rotation.y = Math.PI;
    const jet = new THREE.Mesh(
      new THREE.TubeGeometry(waterCurve, 36, radius * 0.115, 8, false),
      waterMaterial
    );
    jet.name = `${ctx.spec.id}:water-jet`;
    water.add(hole, jet);

    for (let index = 0; index < 8; index += 1) {
      const droplet = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.075, 7, 5), waterMaterial);
      droplet.name = `${ctx.spec.id}:droplet-${index}`;
      water.add(droplet);
      droplets.push(droplet);
    }

    splash = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.35, radius * 0.075, 6, 28),
      splashMaterial
    );
    splash.name = `${ctx.spec.id}:splash`;
    splash.position.copy(landing);
    splash.rotation.x = Math.PI / 2;
    water.add(splash);
    root.add(water);
  }
  water.renderOrder = 2;
  water.visible = false;

  let flow = 0;

  const update = (view: Parameters<NonNullable<ReturnType<PropFactory>['update']>>[0]) => {
    const object = viewObject(view, ctx.spec.objectId);
    const gauge = object?.gauge ?? null;
    const value = showValue && gauge !== null ? String(gauge) : null;
    face.userData.value = value;
    panel?.draw(value, 'dial');
    water.visible = hasWaterJet && object?.gaugeObscured === true;
    water.userData.obscured = water.visible;
  };

  const instance = createInstance(root, ctx.spec.interactive ? [bezel, face] : [], {
    update,
    tick(dtSeconds) {
      if (!water.visible) return;
      flow += Math.max(0, dtSeconds) * 1.55;
      if (waterCurve) {
        for (let index = 0; index < droplets.length; index += 1) {
          droplets[index].position.copy(waterCurve.getPoint((flow + index / droplets.length) % 1));
        }
      }
      if (waterMaterial) waterMaterial.opacity = 0.62 + Math.sin(flow * 24) * 0.08;
      if (splash && splashMaterial) {
        const pulse = 0.88 + (Math.sin(flow * 11) + 1) * 0.16;
        splash.scale.setScalar(pulse);
        splashMaterial.opacity = 0.45 + Math.sin(flow * 17) * 0.12;
      }
    },
    panels: panel ? [panel] : []
  });
  return {
    ...instance,
    dispose() {
      glassMaterial.dispose();
      waterMaterial?.dispose();
      splashMaterial?.dispose();
      instance.dispose();
    }
  };
};
