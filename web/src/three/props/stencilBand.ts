import * as THREE from 'three';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam, panelMaterial, viewObject } from './common.js';

export const stencilBand: PropFactory = (ctx) => {
  const width = numberParam(ctx, 'w', 0.16);
  const height = numberParam(ctx, 'h', 0.14);
  const panel = ctx.legible?.glyphPanel({
    widthPx: 192,
    heightPx: 192,
    aspectM: [width, height],
    transparent: true
  });
  const root = new THREE.Group();
  root.name = ctx.spec.id;
  const band = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.12, height * 1.12),
    material(ctx, 'band', 'metalDark')
  );
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), panelMaterial(ctx, panel));
  band.rotation.y = Math.PI;
  face.rotation.y = Math.PI;
  face.position.z = -0.001;
  root.add(band, face);

  const update = (view: Parameters<NonNullable<ReturnType<PropFactory>['update']>>[0]) => {
    const value = viewObject(view, ctx.spec.objectId)?.stencil ?? null;
    face.userData.value = value;
    panel?.draw(value, 'stencil');
  };

  return createInstance(root, ctx.spec.interactive ? [band, face] : [], {
    update,
    panels: panel ? [panel] : []
  });
};
