import * as THREE from 'three';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam } from './common.js';

export const breakerSwitch: PropFactory = (ctx) => {
  const width = numberParam(ctx, 'w', 0.32);
  const height = numberParam(ctx, 'h', 0.1);
  const depth = Math.max(height * 0.42, 0.04);
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const bodyMaterial = material(ctx, 'body', 'metalDark');
  const trackMaterial = material(ctx, 'track', 'ink');
  const leverMaterial = material(ctx, 'lever', 'accent');
  const hardwareMaterial = material(ctx, 'hardware', 'metal');
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMaterial);

  const trackWidth = width * 0.27;
  const track = new THREE.Mesh(
    new THREE.BoxGeometry(trackWidth, height * 0.78, depth * 0.2),
    trackMaterial
  );
  track.position.z = depth * 0.58;

  const leverGroup = new THREE.Group();
  leverGroup.name = `${ctx.spec.id}:lever`;
  leverGroup.position.z = depth * 0.66;
  const pivot = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.2, height * 0.2, trackWidth * 0.78, 12),
    leverMaterial
  );
  pivot.name = `${ctx.spec.id}:pivot`;
  pivot.rotation.z = Math.PI / 2;
  const handleGroup = new THREE.Group();
  handleGroup.name = `${ctx.spec.id}:handle`;
  const stem = new THREE.Mesh(
    new THREE.BoxGeometry(trackWidth * 0.48, height * 0.58, depth * 0.72),
    leverMaterial
  );
  stem.position.y = height * 0.18;
  stem.position.z = depth * 0.22;
  const paddle = new THREE.Mesh(
    new THREE.BoxGeometry(trackWidth * 0.82, height * 0.3, depth * 0.9),
    leverMaterial
  );
  paddle.name = `${ctx.spec.id}:paddle`;
  paddle.position.y = height * 0.46;
  paddle.position.z = depth * 0.34;
  handleGroup.add(stem, paddle);
  leverGroup.add(pivot, handleGroup);

  const screwGeometry = new THREE.CylinderGeometry(height * 0.09, height * 0.09, depth * 0.08, 10);
  for (const x of [-width * 0.41, width * 0.41]) {
    const screw = new THREE.Mesh(screwGeometry, hardwareMaterial);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, 0, depth * 0.55);
    root.add(screw);
  }

  const onIndicator = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.08, height * 0.18, depth * 0.08),
    leverMaterial
  );
  onIndicator.position.set(-width * 0.34, height * 0.27, depth * 0.55);
  const offIndicator = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.08, height * 0.18, depth * 0.08),
    hardwareMaterial
  );
  offIndicator.position.set(-width * 0.34, -height * 0.27, depth * 0.55);
  root.add(body, track, leverGroup, onIndicator, offIndicator);

  const index = Math.max(0, Math.round(numberParam(ctx, 'index', 0)));
  const offAngle = numberParam(ctx, 'offRad', 0.5);
  const onAngle = numberParam(ctx, 'onRad', -0.5);
  const update = (view: Parameters<NonNullable<ReturnType<PropFactory>['update']>>[0]) => {
    const enabled = view.switches[index] === true;
    leverGroup.rotation.x = enabled ? onAngle : offAngle;
    handleGroup.rotation.z = enabled ? 0 : Math.PI;
    leverGroup.userData.targetAngle = leverGroup.rotation.x;
    onIndicator.visible = enabled;
    offIndicator.visible = !enabled;
  };

  return createInstance(root, ctx.spec.interactive ? [body, paddle] : [], {
    update
  });
};
