import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam, stringParam } from './common.js';

export const speakerGrille: PropFactory = (ctx) => {
  const width = numberParam(ctx, 'w', 0.24);
  const height = numberParam(ctx, 'h', 0.3);
  const depth = numberParam(ctx, 'd', 0.08);
  const slatCount = Math.max(1, Math.round(numberParam(ctx, 'slats', 7)));
  const modelUrl = stringParam(ctx, 'model', '');
  const root = new THREE.Group();
  root.name = ctx.spec.id;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material(ctx, 'body', 'metalDark')
  );
  root.add(body);
  const fallback = new THREE.Group();
  const grilleMaterial = material(ctx, 'grille', 'structure');
  for (let index = 0; index < slatCount; index += 1) {
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.72, Math.max(height * 0.025, 0.004), depth * 0.12),
      grilleMaterial
    );
    slat.position.set(
      0,
      height * 0.58 * (index / Math.max(1, slatCount - 1) - 0.5),
      depth * 0.57
    );
    fallback.add(slat);
  }
  root.add(fallback);

  let disposed = false;
  if (modelUrl && typeof document !== 'undefined') {
    new GLTFLoader().load(modelUrl, (gltf) => {
      if (disposed) {
        disposeModel(gltf.scene);
        return;
      }
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        disposeMaterial(object.material);
        object.material = grilleMaterial;
      });
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = Math.min(
        (width * 0.86) / Math.max(size.x, 0.001),
        (height * 0.82) / Math.max(size.y, 0.001),
        (depth * 0.5) / Math.max(size.z, 0.001)
      );
      gltf.scene.scale.setScalar(scale);
      const scaledBounds = new THREE.Box3().setFromObject(gltf.scene);
      const centre = scaledBounds.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(centre);
      gltf.scene.position.z += depth * 0.58;
      root.add(gltf.scene);
      fallback.visible = false;
    });
  }

  const instance = createInstance(root, ctx.spec.interactive ? [body] : []);
  return {
    ...instance,
    dispose() {
      disposed = true;
      instance.dispose();
    }
  };
};

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    for (const value of Object.values(entry)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    entry.dispose();
  }
}

function disposeModel(model: THREE.Object3D): void {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    disposeMaterial(object.material);
  });
}
