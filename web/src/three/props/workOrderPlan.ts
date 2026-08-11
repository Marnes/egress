import * as THREE from 'three';
import { raisedTextGeometry } from '../text/raisedText.js';
import type { PropFactory } from './registry.js';
import { createInstance, numberParam } from './common.js';

function stroke(
  name: string,
  points: [number, number][],
  material: THREE.Material,
  radius = 0.0028
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0.003)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, radius, 5, false), material);
  mesh.name = name;
  return mesh;
}

function addText(
  root: THREE.Group,
  name: string,
  text: string,
  y: number,
  capHeight: number,
  material: THREE.Material
): void {
  const geometry = raisedTextGeometry(text, {
    capHeight,
    depth: 0.0008,
    strokeRatio: 0.12,
    tracking: 0.08
  });
  if (!geometry) return;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(0, y, 0.003);
  root.add(mesh);
}

/** A weathered service plan bridging the lids of the two upright drums. */
export const workOrderPlan: PropFactory = (ctx) => {
  const width = numberParam(ctx, 'w', 0.5);
  const height = numberParam(ctx, 'h', 0.72);
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const paperMaterial = new THREE.MeshStandardMaterial({
    color: '#d4c89f',
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const inkMaterial = new THREE.MeshStandardMaterial({
    color: ctx.theme.palette.ink,
    roughness: 0.9,
    metalness: 0
  });
  const stampMaterial = new THREE.MeshStandardMaterial({
    color: ctx.theme.palette.warning,
    roughness: 0.92,
    metalness: 0
  });

  const paperGeometry = new THREE.PlaneGeometry(width, height, 8, 10);
  const positions = paperGeometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const curl = Math.sin((x / width + 0.5) * Math.PI * 3) * 0.0012;
    const edgeLift = Math.pow(Math.abs(y) / (height / 2), 5) * 0.0024;
    positions.setZ(index, curl + edgeLift);
  }
  paperGeometry.computeVertexNormals();
  const paper = new THREE.Mesh(paperGeometry, paperMaterial);
  paper.name = `${ctx.spec.id}:paper`;
  root.add(paper);

  addText(root, `${ctx.spec.id}:title`, 'PIPE SERVICE PLAN', height * 0.39, 0.024, inkMaterial);
  addText(root, `${ctx.spec.id}:work-order`, '1994 / WO-2291', height * 0.3, 0.03, stampMaterial);
  root.add(stroke(`${ctx.spec.id}:rule`, [[-width * 0.4, height * 0.245], [width * 0.4, height * 0.245]], inkMaterial, 0.0016));

  // Two imperfect pipe runs, drawn as if with a maintenance pencil.
  root.add(
    stroke(
      `${ctx.spec.id}:pipe-left`,
      [[-0.13, 0.1], [-0.135, 0.02], [-0.126, -0.09], [-0.132, -0.23]],
      inkMaterial,
      0.004
    ),
    stroke(
      `${ctx.spec.id}:pipe-right`,
      [[0.13, 0.1], [0.126, 0.01], [0.136, -0.1], [0.13, -0.23]],
      inkMaterial,
      0.004
    )
  );

  // Opposing curved arrows make the return/overflow swap readable without prose.
  root.add(
    stroke(`${ctx.spec.id}:swap-arrow-top`, [[-0.1, 0.06], [0, 0.13], [0.1, 0.06]], stampMaterial),
    stroke(`${ctx.spec.id}:swap-arrow-top-a`, [[0.1, 0.06], [0.069, 0.083]], stampMaterial),
    stroke(`${ctx.spec.id}:swap-arrow-top-b`, [[0.1, 0.06], [0.074, 0.031]], stampMaterial),
    stroke(`${ctx.spec.id}:swap-arrow-bottom`, [[0.1, -0.1], [0, -0.17], [-0.1, -0.1]], stampMaterial),
    stroke(`${ctx.spec.id}:swap-arrow-bottom-a`, [[-0.1, -0.1], [-0.069, -0.077]], stampMaterial),
    stroke(`${ctx.spec.id}:swap-arrow-bottom-b`, [[-0.1, -0.1], [-0.074, -0.129]], stampMaterial)
  );
  addText(root, `${ctx.spec.id}:return-label`, 'RETURN', -height * 0.4, 0.018, inkMaterial);
  addText(root, `${ctx.spec.id}:overflow-label`, 'OVERFLOW', -height * 0.455, 0.015, inkMaterial);

  const instance = createInstance(root, []);
  return {
    ...instance,
    dispose() {
      paperMaterial.dispose();
      inkMaterial.dispose();
      stampMaterial.dispose();
      instance.dispose();
    }
  };
};
