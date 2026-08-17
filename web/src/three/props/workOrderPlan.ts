import * as THREE from 'three';
import type { PropFactory } from './registry.js';
import { createInstance, numberParam } from './common.js';

/** Ink sits clear of the sheet's lifted edges, which rise to ~3.5 mm. */
const INK_Z = 0.006;

function stroke(
  name: string,
  points: [number, number][],
  surface: THREE.Material,
  radius = 0.0026
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, INK_Z)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, radius, 5, false), surface);
  mesh.name = name;
  return mesh;
}

/** Line plus two barbs, pointing along the last segment. */
function arrow(
  name: string,
  points: [number, number][],
  surface: THREE.Material,
  radius = 0.0026
): THREE.Mesh[] {
  const [tipX, tipY] = points[points.length - 1];
  const [fromX, fromY] = points[points.length - 2];
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const barb = 0.022;
  return [
    stroke(name, points, surface, radius),
    stroke(
      `${name}-barb-a`,
      [[tipX, tipY], [tipX - Math.cos(angle - 0.45) * barb, tipY - Math.sin(angle - 0.45) * barb]],
      surface,
      radius
    ),
    stroke(
      `${name}-barb-b`,
      [[tipX, tipY], [tipX - Math.cos(angle + 0.45) * barb, tipY - Math.sin(angle + 0.45) * barb]],
      surface,
      radius
    )
  ];
}

/**
 * The 1994 work order that swapped the return and overflow lines, left on the
 * drum lids. It is a dot-matrix listing on continuous-form paper — the body is
 * printed into the sheet's own texture, sprocket holes and all, and the fitter
 * who did the job has marked the crossover on it in pen.
 */
const FORM: readonly string[] = [
  'KESTREL FACILITIES ENGINEERING',
  '==============================',
  '',
  'WORK ORDER . . . . . . WO-2291',
  'RAISED . . . . . . . . 11-94',
  'SITE . . . . . . . . . PUMP ROOM',
  'STATUS . . . . . . . . CLOSED',
  '',
  '  LINE SCHEDULE',
  '  -------------',
  '',
  '     |              |',
  '     |              |',
  '     |              |',
  '     |              |',
  '     |              |',
  '     |              |',
  '',
  '   RETURN       OVERFLOW',
  '',
  'REMARKS:',
  'LINES CROSSED AT THE MANIFOLD',
  'DURING RECOMMISSIONING.',
  '',
  'SIGNED . . . . . . . . . . . .'
];

/** Character cells the pen marks hang off, indexed into FORM above. */
const LEFT_RUN = 5;
const RIGHT_RUN = 20;
const RUN_TOP_LINE = 11;
const RUN_BOTTOM_LINE = 16;
const SIGN_LINE = 24;

export const workOrderPlan: PropFactory = (ctx) => {
  const width = numberParam(ctx, 'w', 0.5);
  const height = numberParam(ctx, 'h', 0.72);
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  // The listing carries the colour and the holes; the paper surface is kept
  // only for its tooth, and shares the sheet's UVs one to one.
  const printout = ctx.legible?.printout({
    widthPx: 768,
    heightPx: Math.round((768 * height) / width),
    lines: FORM,
    columns: 34,
    seed: Math.round(numberParam(ctx, 'seed', 0x51a7c))
  });
  const tooth = ctx.theme.surface('warning', 'paper');
  const paperMaterial = new THREE.MeshStandardMaterial({
    map: printout?.texture,
    normalMap: tooth?.normalMap,
    normalScale: new THREE.Vector2(tooth?.normalScale ?? 1, tooth?.normalScale ?? 1),
    roughnessMap: tooth?.ormMap,
    roughness: 1,
    metalness: 0,
    // Punched rather than blended: the sprocket and rot holes keep hard edges
    // and the sheet still writes depth.
    alphaTest: 0.5
  });
  // Ballpoint, added by hand long after the sheet came off the printer.
  const inkMaterial = new THREE.MeshStandardMaterial({
    color: '#1e2740',
    roughness: 0.86,
    metalness: 0
  });

  const paperGeometry = new THREE.PlaneGeometry(width, height, 10, 14);
  const positions = paperGeometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    // Folded in three and flattened out again: two ridges across the sheet,
    // plus corners that will not lie down.
    const folds = Math.cos((y / height) * Math.PI * 3) * 0.0016;
    const edgeLift = Math.abs(y / (height / 2)) ** 5 * 0.0022 + Math.abs(x / (width / 2)) ** 6 * 0.0018;
    positions.setZ(index, folds + edgeLift);
  }
  paperGeometry.computeVertexNormals();
  const paper = new THREE.Mesh(paperGeometry, paperMaterial);
  paper.name = `${ctx.spec.id}:paper`;
  root.add(paper);

  // Pen marks are placed on the print by character cell, so they stay on the
  // right rows whatever the form says.
  const at = (column: number, line: number): [number, number] => {
    const spot = printout?.anchor(column, line) ?? { u: 0.5, v: 0.5 };
    return [(spot.u - 0.5) * width, (0.5 - spot.v) * height];
  };
  const [leftX] = at(LEFT_RUN, 0);
  const [rightX] = at(RIGHT_RUN, 0);
  const [, topY] = at(0, RUN_TOP_LINE);
  const [, bottomY] = at(0, RUN_BOTTOM_LINE);

  // Crossing arrows over the two printed runs: a swap reads at a glance as an
  // X, where two facing curves read as an eye.
  const midY = (topY + bottomY) / 2;
  const reach = (topY - bottomY) * 0.34;
  root.add(
    ...arrow(
      `${ctx.spec.id}:swap-down`,
      [[leftX, midY + reach], [0, midY + reach * 0.12], [rightX, midY - reach]],
      inkMaterial
    ),
    ...arrow(
      `${ctx.spec.id}:swap-up`,
      [[rightX, midY + reach], [0, midY + reach * 0.12], [leftX, midY - reach]],
      inkMaterial
    )
  );

  // Signed along the printed dotted rule at the foot of the form.
  const [signX, signY] = at(9, SIGN_LINE);
  const run = width * 0.42;
  root.add(
    // A signature, not a sine wave: a tall initial, a slump through the middle,
    // and a tail that runs past the end of the rule.
    stroke(
      `${ctx.spec.id}:signature`,
      [
        [signX, signY - 0.004],
        [signX + run * 0.08, signY + 0.017],
        [signX + run * 0.18, signY - 0.003],
        [signX + run * 0.3, signY + 0.008],
        [signX + run * 0.45, signY - 0.005],
        [signX + run * 0.62, signY + 0.006],
        [signX + run * 0.82, signY - 0.002],
        [signX + run, signY - 0.007]
      ],
      inkMaterial,
      0.0017
    )
  );

  const instance = createInstance(root, []);
  return {
    ...instance,
    dispose() {
      paperMaterial.dispose();
      inkMaterial.dispose();
      printout?.dispose();
      instance.dispose();
    }
  };
};
