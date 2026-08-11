import * as THREE from 'three';
import type { LightConeSpec } from '../types.js';
import type { OccluderContext, OccluderInstance } from './registry.js';

export function lightCone(spec: LightConeSpec, context: OccluderContext): OccluderInstance {
  const baseLights: { light: THREE.Light; intensity: number }[] = [];
  context.scene.traverse((object) => {
    if (object instanceof THREE.Light) baseLights.push({ light: object, intensity: object.intensity });
  });
  const ambientFloor = THREE.MathUtils.clamp(spec.ambientFloor, 0, 1);
  for (const entry of baseLights) entry.light.intensity = entry.intensity * ambientFloor;

  const root = new THREE.Group();
  const cone = new THREE.SpotLight(
    spec.color,
    spec.intensity,
    spec.reachM,
    THREE.MathUtils.degToRad(spec.angleDeg),
    THREE.MathUtils.clamp(spec.penumbra, 0, 1),
    2
  );
  cone.target.position.set(0, 0, -1);
  root.add(cone, cone.target);

  return {
    object: root,
    update(_dtSeconds, camera) {
      root.position.copy(camera.position);
      root.quaternion.copy(camera.quaternion);
    },
    dispose() {
      for (const entry of baseLights) entry.light.intensity = entry.intensity;
      root.remove(cone, cone.target);
    }
  };
}
