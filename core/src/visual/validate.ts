import type { PaletteRole, PropSpec, RoomVisual, Theme, Transform, Vec3 } from './types.js';

export type Issue = { level: 'error' | 'warn'; path: string; message: string };

export const WCAG_CONTRAST_MIN = 3;

const PALETTE_ROLES: readonly PaletteRole[] = [
  'background',
  'floor',
  'wall',
  'ceiling',
  'structure',
  'metal',
  'metalDark',
  'accent',
  'warning',
  'ink'
];

const CSS_COLOR_NAMES = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet
  brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue
  darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange
  darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise
  darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia
  gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory
  khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow
  lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
  midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered
  orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue
  purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver
  skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato transparent
  turquoise violet wheat white whitesmoke yellow yellowgreen currentcolor`
    .split(/\s+/)
    .filter(Boolean)
);

type Mat3 = [number, number, number, number, number, number, number, number, number];
type WorldTransform = { position: Vec3; linear: Mat3 };

export function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const [r, g, blue] = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * blue;
  };

  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function isColorString(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith('#') ||
    /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/.test(normalized) ||
    CSS_COLOR_NAMES.has(normalized)
  );
}

function multiply(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[3] * b[1] + a[6] * b[2],
    a[1] * b[0] + a[4] * b[1] + a[7] * b[2],
    a[2] * b[0] + a[5] * b[1] + a[8] * b[2],
    a[0] * b[3] + a[3] * b[4] + a[6] * b[5],
    a[1] * b[3] + a[4] * b[4] + a[7] * b[5],
    a[2] * b[3] + a[5] * b[4] + a[8] * b[5],
    a[0] * b[6] + a[3] * b[7] + a[6] * b[8],
    a[1] * b[6] + a[4] * b[7] + a[7] * b[8],
    a[2] * b[6] + a[5] * b[7] + a[8] * b[8]
  ];
}

function applyMatrix(matrix: Mat3, vector: Vec3): Vec3 {
  return [
    matrix[0] * vector[0] + matrix[3] * vector[1] + matrix[6] * vector[2],
    matrix[1] * vector[0] + matrix[4] * vector[1] + matrix[7] * vector[2],
    matrix[2] * vector[0] + matrix[5] * vector[1] + matrix[8] * vector[2]
  ];
}

function localLinear(transform: Transform): Mat3 {
  const [x, y, z] = transform.rotation ?? [0, 0, 0];
  const scale = typeof transform.scale === 'number' ? [transform.scale, transform.scale, transform.scale] : transform.scale ?? [1, 1, 1];
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)];

  return [
    cy * cz * scale[0],
    (sx * sy * cz + cx * sz) * scale[0],
    (-cx * sy * cz + sx * sz) * scale[0],
    -cy * sz * scale[1],
    (-sx * sy * sz + cx * cz) * scale[1],
    (cx * sy * sz + sx * cz) * scale[1],
    sy * scale[2],
    -sx * cy * scale[2],
    cx * cy * scale[2]
  ];
}

function insideBounds(position: Vec3, size: Vec3): boolean {
  return (
    position[0] >= -size[0] / 2 &&
    position[0] <= size[0] / 2 &&
    position[1] >= 0 &&
    position[1] <= size[1] &&
    position[2] >= -size[2] / 2 &&
    position[2] <= size[2] / 2
  );
}

function validateThemeHex(theme: Theme, themePath: string, issues: Issue[]): void {
  const check = (value: string, path: string): void => {
    if (!isHex(value)) issues.push({ level: 'error', path, message: `Malformed hex color "${value}"; expected #rrggbb` });
  };

  for (const role of PALETTE_ROLES) check(theme.palette[role], `${themePath}.palette.${role}`);
  check(theme.fog.color, `${themePath}.fog.color`);
  check(theme.lightRig.ambient.color, `${themePath}.lightRig.ambient.color`);
  if (theme.lightRig.hemisphere) {
    check(theme.lightRig.hemisphere.sky, `${themePath}.lightRig.hemisphere.sky`);
    check(theme.lightRig.hemisphere.ground, `${themePath}.lightRig.hemisphere.ground`);
  }
  theme.lightRig.directional?.forEach((light, index) =>
    check(light.color, `${themePath}.lightRig.directional[${index}].color`)
  );
  theme.lightRig.points?.forEach((light, index) => check(light.color, `${themePath}.lightRig.points[${index}].color`));
  if ('color' in theme.occluder) check(theme.occluder.color, `${themePath}.occluder.color`);
}

function validateMalformedHex(value: unknown, path: string, issues: Issue[]): void {
  if (typeof value === 'string') {
    if (value.trim().startsWith('#') && !isHex(value.trim())) {
      issues.push({ level: 'error', path, message: `Malformed hex color "${value}"; expected #rrggbb` });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateMalformedHex(item, `${path}[${index}]`, issues));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) validateMalformedHex(item, path ? `${path}.${key}` : key, issues);
  }
}

export function validateRoomVisual(
  v: RoomVisual,
  ctx: { objectIds: readonly string[]; propTypes: readonly string[]; themes: readonly Theme[] }
): Issue[] {
  const issues: Issue[] = [];
  const nodeIds = new Set<string>();
  const propIds = new Set<string>();
  const objectIds = new Set(ctx.objectIds);
  const propTypes = new Set(ctx.propTypes);
  const theme = ctx.themes.find((candidate) => candidate.id === v.themeId);

  validateMalformedHex(v, '', issues);

  v.nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;
    if (nodeIds.has(node.id)) issues.push({ level: 'error', path: `${path}.id`, message: `Duplicate node id "${node.id}"` });
    nodeIds.add(node.id);
    if (node.position[1] !== v.eyeHeightM) {
      issues.push({ level: 'error', path: `${path}.position`, message: `Node y must equal eyeHeightM (${v.eyeHeightM})` });
    }
    if (!insideBounds(node.position, v.bounds.size)) {
      issues.push({ level: 'error', path: `${path}.position`, message: `Node "${node.id}" is outside room bounds` });
    }
  });

  v.props.forEach((prop, index) => {
    const path = `props[${index}]`;
    if (propIds.has(prop.id)) issues.push({ level: 'error', path: `${path}.id`, message: `Duplicate prop id "${prop.id}"` });
    propIds.add(prop.id);
    if (!propTypes.has(prop.type)) {
      issues.push({ level: 'error', path: `${path}.type`, message: `Unknown prop type "${prop.type}"` });
    }
    if (prop.objectId !== undefined && !objectIds.has(prop.objectId)) {
      issues.push({ level: 'error', path: `${path}.objectId`, message: `Unknown objectId "${prop.objectId}"` });
    }
    if (prop.interactive && !prop.objectId) {
      issues.push({ level: 'error', path: `${path}.objectId`, message: 'Interactive prop must have an objectId' });
    }
    if (prop.interactive && !prop.nodes?.length) {
      issues.push({ level: 'warn', path: `${path}.nodes`, message: `Interactive prop "${prop.id}" is unreachable from every node` });
    }
    if (prop.params) {
      Object.entries(prop.params).forEach(([key, value]) => {
        if (typeof value === 'string' && isColorString(value)) {
          issues.push({
            level: 'error',
            path: `${path}.params.${key}`,
            message: 'Prop params cannot contain colors; use a palette material role'
          });
        }
      });
    }
    if (prop.materials) {
      Object.entries(prop.materials).forEach(([slot, role]) => {
        if (!PALETTE_ROLES.includes(role)) {
          issues.push({
            level: 'error',
            path: `${path}.materials.${slot}`,
            message: `Unknown palette role "${String(role)}"`
          });
        }
      });
    }
  });

  if (!nodeIds.has(v.startNodeId)) {
    issues.push({ level: 'error', path: 'startNodeId', message: `Unknown startNodeId "${v.startNodeId}"` });
  }

  v.props.forEach((prop, index) => {
    if (prop.parent !== undefined && !propIds.has(prop.parent)) {
      issues.push({ level: 'error', path: `props[${index}].parent`, message: `Unknown parent "${prop.parent}"` });
    }
    prop.nodes?.forEach((nodeId, nodeIndex) => {
      if (!nodeIds.has(nodeId)) {
        issues.push({
          level: 'error',
          path: `props[${index}].nodes[${nodeIndex}]`,
          message: `Unknown node "${nodeId}"`
        });
      }
    });
  });

  const firstPropById = new Map<string, { prop: PropSpec; index: number }>();
  v.props.forEach((prop, index) => {
    if (!firstPropById.has(prop.id)) firstPropById.set(prop.id, { prop, index });
  });

  const visitState = new Map<string, 1 | 2>();
  const cycleIds = new Set<string>();
  const visit = (entry: { prop: PropSpec; index: number }): void => {
    if (visitState.get(entry.prop.id) === 2) return;
    if (visitState.get(entry.prop.id) === 1) {
      cycleIds.add(entry.prop.id);
      issues.push({
        level: 'error',
        path: `props[${entry.index}].parent`,
        message: `Parent cycle includes "${entry.prop.id}"`
      });
      return;
    }
    visitState.set(entry.prop.id, 1);
    if (entry.prop.parent) {
      const parent = firstPropById.get(entry.prop.parent);
      if (parent) visit(parent);
      if (parent && cycleIds.has(parent.prop.id)) cycleIds.add(entry.prop.id);
    }
    visitState.set(entry.prop.id, 2);
  };
  firstPropById.forEach(visit);

  const worldTransforms = new Map<string, WorldTransform>();
  const resolving = new Set<string>();
  const resolveWorld = (entry: { prop: PropSpec; index: number }): WorldTransform | undefined => {
    const cached = worldTransforms.get(entry.prop.id);
    if (cached) return cached;
    if (resolving.has(entry.prop.id) || cycleIds.has(entry.prop.id)) return undefined;
    resolving.add(entry.prop.id);
    const local = localLinear(entry.prop.transform);
    let world: WorldTransform = { position: entry.prop.transform.position, linear: local };
    if (entry.prop.parent) {
      const parent = firstPropById.get(entry.prop.parent);
      if (!parent) return undefined;
      const parentWorld = resolveWorld(parent);
      if (!parentWorld) return undefined;
      const offset = applyMatrix(parentWorld.linear, entry.prop.transform.position);
      world = {
        position: [
          parentWorld.position[0] + offset[0],
          parentWorld.position[1] + offset[1],
          parentWorld.position[2] + offset[2]
        ],
        linear: multiply(parentWorld.linear, local)
      };
    }
    resolving.delete(entry.prop.id);
    worldTransforms.set(entry.prop.id, world);
    return world;
  };

  firstPropById.forEach((entry) => {
    const world = resolveWorld(entry);
    if (world && !insideBounds(world.position, v.bounds.size)) {
      issues.push({
        level: 'error',
        path: `props[${entry.index}].transform.position`,
        message: `Prop "${entry.prop.id}" is outside room bounds at world position [${world.position.join(', ')}]`
      });
    }
  });

  v.nodes.forEach((node, index) => {
    const assigned = v.props.some((prop) => prop.nodes?.includes(node.id));
    if (!assigned) {
      issues.push({ level: 'warn', path: `nodes[${index}]`, message: `Node "${node.id}" has no props assigned` });
      if (!node.lookAt) {
        issues.push({
          level: 'warn',
          path: `nodes[${index}].lookAt`,
          message: `Node "${node.id}" has no lookAt and no props from which to derive one`
        });
      }
    }
  });

  for (let i = 0; i < v.nodes.length; i++) {
    for (let j = i + 1; j < v.nodes.length; j++) {
      const a = v.nodes[i].position;
      const b = v.nodes[j].position;
      if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.5) {
        issues.push({
          level: 'warn',
          path: `nodes[${j}].position`,
          message: `Nav nodes "${v.nodes[i].id}" and "${v.nodes[j].id}" are closer than 0.5m`
        });
      }
    }
  }

  if (!theme) {
    issues.push({ level: 'error', path: 'themeId', message: `Unknown themeId "${v.themeId}"` });
  } else {
    const themePath = `themes.${theme.id}`;
    validateThemeHex(theme, themePath, issues);
    if (isHex(theme.palette.ink)) {
      for (const role of PALETTE_ROLES) {
        if (role === 'ink' || !isHex(theme.palette[role])) continue;
        const ratio = contrastRatio(theme.palette.ink, theme.palette[role]);
        if (ratio < WCAG_CONTRAST_MIN) {
          issues.push({
            level: 'error',
            path: `${themePath}.palette.${role}`,
            message: `Ink contrast against ${role} is ${ratio.toFixed(2)}:1; minimum is ${WCAG_CONTRAST_MIN}:1`
          });
        }
      }
    }
  }

  return issues;
}
