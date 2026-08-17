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
  face.name = `${ctx.spec.id}:face`;
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

  // Water is nearly colourless — it takes the room's light and shows a
  // highlight. Drawn unlit and tinted, it reads as a plastic band.
  const streak = hasWaterJet ? ctx.theme.decal('waterSheet')?.map : undefined;
  const flowTexture = streak?.clone();
  if (flowTexture) {
    flowTexture.wrapS = THREE.RepeatWrapping;
    flowTexture.wrapT = THREE.RepeatWrapping;
    flowTexture.repeat.set(3, 2);
    flowTexture.needsUpdate = true;
  }
  const washTexture = streak?.clone();
  if (washTexture) {
    washTexture.wrapS = THREE.RepeatWrapping;
    washTexture.wrapT = THREE.RepeatWrapping;
    washTexture.center.set(0.5, 0.5);
    // Turned a quarter so the threads run down the glass rather than across.
    washTexture.rotation = Math.PI / 2;
    washTexture.repeat.set(2.2, 1);
    washTexture.needsUpdate = true;
  }

  const waterMaterial = hasWaterJet
    ? new THREE.MeshStandardMaterial({
        map: flowTexture ?? null,
        color: '#e2f0f2',
        roughness: 0.08,
        metalness: 0,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        side: THREE.DoubleSide,
        envMapIntensity: 2.6
      })
    : undefined;
  const washMaterial = waterMaterial?.clone();
  if (washMaterial) {
    washMaterial.map = washTexture ?? null;
    washMaterial.roughness = 0.34;
    washMaterial.opacity = 0.46;
    washMaterial.envMapIntensity = 1.4;
  }
  const splashMaterial = waterMaterial?.clone();
  if (splashMaterial) {
    splashMaterial.map = null;
    // Loose water is thinner than the column it came off.
    splashMaterial.opacity = 0.42;
  }

  // A column, not a trickle: sized in metres so the room can match it to the
  // bore of the pipe it is bursting out of.
  const stream = numberParam(ctx, 'waterRadiusM', radius * 0.55);
  const droplets: THREE.Mesh[] = [];
  const spray: THREE.Mesh[] = [];
  let waterCurve: THREE.CatmullRomCurve3 | undefined;
  let splash: THREE.Mesh | undefined;
  let wash: THREE.Mesh | undefined;
  if (waterMaterial && washMaterial && splashMaterial) {
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
      // The aperture cannot be narrower than what is coming through it.
      new THREE.CircleGeometry(Math.max(radius * 0.46, stream * 1.08), 24),
      material(ctx, 'hole', 'ink')
    );
    hole.name = `${ctx.spec.id}:water-hole`;
    hole.position.copy(source).add(new THREE.Vector3(0, 0, 0.003));
    hole.rotation.y = Math.PI;

    // The stream necks down as it accelerates, rather than falling as a rod.
    const tubular = 44;
    const radial = 10;
    const jetGeometry = new THREE.TubeGeometry(waterCurve, tubular, stream, radial, false);
    const positions = jetGeometry.attributes.position;
    const centre = new THREE.Vector3();
    const vertex = new THREE.Vector3();
    for (let ring = 0; ring <= tubular; ring += 1) {
      const along = ring / tubular;
      // A heavy column holds together further than a thin one, so it necks
      // less on the way down.
      const taper = 1 - 0.34 * along * along;
      waterCurve.getPoint(along, centre);
      for (let around = 0; around <= radial; around += 1) {
        const index = ring * (radial + 1) + around;
        vertex.fromBufferAttribute(positions, index);
        vertex.sub(centre).multiplyScalar(taper).add(centre);
        positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
      }
    }
    positions.needsUpdate = true;
    jetGeometry.computeVertexNormals();
    const jet = new THREE.Mesh(jetGeometry, waterMaterial);
    jet.name = `${ctx.spec.id}:water-jet`;

    // A sheet running down the glass, which is what makes the face unreadable.
    wash = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 1.72, radius * 1.72, 1, 6),
      washMaterial
    );
    wash.name = `${ctx.spec.id}:water-wash`;
    const washPositions = wash.geometry.attributes.position;
    for (let index = 0; index < washPositions.count; index += 1) {
      // Bowed well out over the bezel: the curve is what gives it varying
      // normals, and therefore any light at all.
      const x = washPositions.getX(index) / (radius * 0.86);
      washPositions.setZ(index, (1 - x * x) * radius * 0.42);
    }
    wash.geometry.computeVertexNormals();
    wash.position.set(0, 0, -depth / 2 - 0.008);
    wash.rotation.y = Math.PI;
    water.add(hole, wash, jet);

    // Spray thrown off the stream, and the burst where it lands.
    for (let index = 0; index < 10; index += 1) {
      const droplet = new THREE.Mesh(
        new THREE.SphereGeometry(stream * 0.12, 6, 5),
        splashMaterial
      );
      droplet.name = `${ctx.spec.id}:droplet-${index}`;
      water.add(droplet);
      droplets.push(droplet);
    }
    for (let index = 0; index < 9; index += 1) {
      const fleck = new THREE.Mesh(new THREE.SphereGeometry(stream * 0.095, 6, 4), splashMaterial);
      fleck.name = `${ctx.spec.id}:spray-${index}`;
      water.add(fleck);
      spray.push(fleck);
    }

    // Wet floor where it has been landing, rather than a hoop. Built whether
    // or not the decal baked, so the scene graph is the same shape with no
    // canvas as with one.
    const wet = ctx.theme.decal('puddle');
    splash = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(radius * 6, stream * 12), Math.max(radius * 6, stream * 12)),
      wet?.material ?? splashMaterial
    );
    splash.name = `${ctx.spec.id}:splash`;
    splash.rotation.x = -Math.PI / 2;
    splash.position.copy(landing).add(new THREE.Vector3(0, 0.002, 0));
    water.add(splash);
    root.add(water);
  }
  water.renderOrder = 2;
  water.visible = false;
  // Water takes no part in shadowing: it hangs millimetres off the pipe, which
  // no shadow map here can resolve.
  water.traverse((object) => {
    object.userData.egressNoShadow = true;
  });

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
      const step = Math.max(0, dtSeconds);
      flow += step * 1.55;
      // Scrolling the threads is what reads as movement; the geometry is still.
      if (flowTexture) flowTexture.offset.x = -flow * 1.4;
      if (washTexture) washTexture.offset.x = -flow * 0.9;
      if (waterCurve) {
        const point = new THREE.Vector3();
        for (let index = 0; index < droplets.length; index += 1) {
          // Shed off the stream partway down, drifting wider as they fall.
          const along = (flow * 0.9 + index / droplets.length) % 1;
          waterCurve.getPoint(along, point);
          const wander = Math.sin((index + 1) * 2.4 + flow * 3) * stream * 1.3 * along;
          droplets[index].position.set(point.x + wander, point.y, point.z + wander * 0.4);
          droplets[index].visible = along > 0.35;
        }
        const landing = waterCurve.getPoint(1, point).clone();
        for (let index = 0; index < spray.length; index += 1) {
          // Flecks kicked up off the landing and falling back.
          const hop = (flow * 1.7 + index / spray.length) % 1;
          const angle = index * 2.399 + flow * 0.6;
          const lift = Math.sin(hop * Math.PI) * Math.max(radius * 1.5, stream * 2.2);
          const out = hop * Math.max(radius * 2.4, stream * 3.6);
          spray[index].position.set(
            landing.x + Math.cos(angle) * out,
            landing.y + lift,
            landing.z + Math.sin(angle) * out
          );
          spray[index].scale.setScalar(1 - hop * 0.5);
        }
      }
      if (waterMaterial) waterMaterial.opacity = 0.58 + Math.sin(flow * 19) * 0.06;
      if (washMaterial) washMaterial.opacity = 0.66 + Math.sin(flow * 23 + 1.1) * 0.07;
    },
    panels: panel ? [panel] : []
  });
  return {
    ...instance,
    dispose() {
      glassMaterial.dispose();
      waterMaterial?.dispose();
      washMaterial?.dispose();
      splashMaterial?.dispose();
      flowTexture?.dispose();
      washTexture?.dispose();
      instance.dispose();
    }
  };
};
