import * as THREE from 'three';
import type { PlayerView } from '@egress/core';
import { deriveInspectPose } from './camera.js';
import {
  occluderRegistry,
  type OccluderFactory,
  type OccluderInstance
} from './occluders/registry.js';
import {
  propRegistry,
  type PropFactory,
  type PropInstance,
  type PropMessage
} from './props/registry.js';
import { applyThemeToScene, createThemeRuntime, type ThemeRuntime } from './theme.js';
import type { LegibilityKit, GlyphPanel } from './textures/legibility.js';
import type { Issue, NavNode, OccluderSpec, RoomVisual, Theme } from './types.js';
import { validateRoomVisual, type ValidationContext } from './validate.js';

export type BuildDeps = {
  scene?: THREE.Scene;
  legibility?: LegibilityKit;
  propRegistry?: Readonly<Record<string, PropFactory>>;
  occluderRegistry?: Readonly<Record<OccluderSpec['kind'], OccluderFactory>>;
  createThemeRuntime?: (theme: Theme) => ThemeRuntime;
  validate?: false | ((visual: RoomVisual, context: ValidationContext) => Issue[]);
  objectIds?: readonly string[];
  navDiscs?: boolean;
  wallTargets?: boolean;
  allPropHitboxes?: boolean;
};

export type RoomHandle = {
  scene: THREE.Scene;
  nodes: Map<string, NavNode>;
  props: Map<string, PropInstance>;
  readonly activeNodeId: string;
  activeHitboxes(): THREE.Object3D[];
  collides(position: THREE.Vector3, radiusM?: number): boolean;
  moveWithCollisions(position: THREE.Vector3, movement: THREE.Vector3, radiusM?: number): THREE.Vector3;
  setActiveNode(id: string): void;
  applyView(view: PlayerView): void;
  applyMessages(messages: readonly PropMessage[]): void;
  /** Whether the remote operator is on the line; drives terminal status. */
  applyLink(connected: boolean): void;
  tick(dtSeconds: number, camera: THREE.Camera): void;
  occluder: OccluderInstance;
  dispose(): void;
};

export function buildRoom(visual: RoomVisual, theme: Theme, deps: BuildDeps = {}): RoomHandle {
  const registry = deps.propRegistry ?? propRegistry;
  const validation = deps.validate === false ? [] : (deps.validate ?? validateRoomVisual)(visual, {
    objectIds: deps.objectIds,
    propTypes: Object.keys(registry),
    themes: [theme]
  });
  const errors = validation.filter((issue) => issue.level === 'error');
  if (errors.length > 0) {
    throw new Error(`Invalid room visual:\n${errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n')}`);
  }

  const scene = deps.scene ?? new THREE.Scene();
  const previousBackground = scene.background;
  const previousFog = scene.fog;
  const runtime = (deps.createThemeRuntime ?? createThemeRuntime)(theme);
  const lights = applyThemeToScene(scene, theme, visual.bounds);
  const occluders = deps.occluderRegistry ?? occluderRegistry;
  const occluderFactory = occluders[theme.occluder.kind];
  if (!occluderFactory) throw new Error(`Unknown occluder kind "${theme.occluder.kind}"`);
  const occluder = occluderFactory(theme.occluder, { scene, theme, bounds: visual.bounds });
  if (occluder.object) scene.add(occluder.object);
  const props = new Map<string, PropInstance>();
  const builtRoots: THREE.Object3D[] = [];
  const ordered = topologicalProps(visual);

  for (const spec of ordered) {
    const factory = registry[spec.type];
    if (!factory) throw new Error(`Unknown prop type "${spec.type}"`);
    const built = factory({ spec, theme: runtime, legible: deps.legibility, bounds: visual.bounds });
    const transformRoot = new THREE.Group();
    transformRoot.name = spec.id;
    transformRoot.userData.egressPropRoot = spec.id;
    transformRoot.add(built.object);
    const instance: PropInstance = {
      ...built,
      object: transformRoot,
      dispose() {
        transformRoot.remove(built.object);
        built.dispose();
      }
    };
    instance.spec = spec;
    applyTransform(instance.object, spec.transform);
    const parent = spec.parent ? props.get(spec.parent) : undefined;
    if (spec.parent && !parent) throw new Error(`Prop "${spec.id}" has unavailable parent "${spec.parent}"`);
    (parent?.object ?? scene).add(instance.object);
    if (!parent) builtRoots.push(instance.object);
    for (const hitbox of instance.hitboxes) {
      const localTarget = hitbox.userData.egressTarget as { kind?: string; digit?: string } | undefined;
      hitbox.userData.egressTarget =
        localTarget?.kind === 'keypad-key' && typeof localTarget.digit === 'string'
          ? {
              kind: 'keypad-key',
              propId: spec.id,
              objectId: spec.objectId,
              digit: localTarget.digit
            }
          : {
              kind: 'prop',
              propId: spec.id,
              objectId: spec.objectId,
              opens: spec.opens
            };
    }
    props.set(spec.id, instance);
  }

  scene.updateMatrixWorld(true);
  const collisionBoxes = ordered.flatMap((spec) => {
    if (!spec.collidable) return [];
    const instance = props.get(spec.id);
    if (!instance) return [];
    const box = new THREE.Box3().setFromObject(instance.object);
    return box.isEmpty() ? [] : [box];
  });
  const nodes = resolveNodes(visual, props);
  for (const spec of ordered) {
    if (!spec.interactive) continue;
    const owningNode = nodes.get(spec.nodes?.[0] ?? visual.startNodeId);
    const instance = props.get(spec.id);
    if (owningNode && instance) {
      instance.inspectPose = deriveInspectPose(instance.object, owningNode.position, spec.inspect);
    }
  }

  const navObjects: THREE.Object3D[] = [];
  const navHitboxes: THREE.Object3D[] = [];
  const wallHitboxes: THREE.Mesh[] = [];
  const navPanels: GlyphPanel[] = [];
  for (const node of deps.navDiscs === false ? [] : nodes.values()) {
    const root = new THREE.Group();
    root.name = `nav:${node.id}`;
    root.position.set(node.position[0], 0, node.position[2]);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.035, 24),
      runtime.material('accent')
    );
    disc.position.y = 0.018;
    disc.userData.egressTarget = { kind: 'nav', nodeId: node.id };
    root.add(disc);
    navHitboxes.push(disc);

    const panel = deps.legibility?.glyphPanel({ widthPx: 384, heightPx: 96, aspectM: [0.5, 0.125] });
    if (panel) {
      panel.draw(node.label, 'display');
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), panel.material);
      label.rotation.x = -Math.PI / 2;
      label.position.y = 0.039;
      root.add(label);
      navPanels.push(panel);
    }
    scene.add(root);
    navObjects.push(root);
  }
  if (deps.wallTargets) {
    for (const node of nodes.values()) wallHitboxes.push(createWallTarget(node, visual.bounds.size));
  }

  let activeNodeId = visual.startNodeId;
  let disposed = false;

  const handle: RoomHandle = {
    scene,
    nodes,
    props,
    get activeNodeId() {
      return activeNodeId;
    },
    activeHitboxes() {
      const hitboxes = [...navHitboxes, ...wallHitboxes];
      for (const spec of visual.props) {
        if (spec.interactive === false) continue;
        if (deps.allPropHitboxes || spec.nodes?.includes(activeNodeId)) {
          hitboxes.push(...(props.get(spec.id)?.hitboxes ?? []));
        }
      }
      return hitboxes;
    },
    collides(position, radiusM = 0.22) {
      return collisionBoxes.some((box) => {
        const nearestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
        const nearestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
        const dx = position.x - nearestX;
        const dz = position.z - nearestZ;
        return dx * dx + dz * dz < radiusM * radiusM;
      });
    },
    moveWithCollisions(position, movement, radiusM = 0.22) {
      const result = position.clone();
      const desired = position.clone().add(movement);
      if (!handle.collides(desired, radiusM)) return desired;

      const alongX = result.clone();
      alongX.x = desired.x;
      if (!handle.collides(alongX, radiusM)) result.x = desired.x;

      const alongZ = result.clone();
      alongZ.z = desired.z;
      if (!handle.collides(alongZ, radiusM)) result.z = desired.z;
      return result;
    },
    setActiveNode(id) {
      if (!nodes.has(id)) throw new Error(`Unknown navigation node "${id}"`);
      activeNodeId = id;
    },
    applyView(view) {
      for (const instance of props.values()) instance.update?.(view);
    },
    applyMessages(messages) {
      for (const instance of props.values()) instance.updateMessages?.(messages);
    },
    applyLink(connected) {
      for (const instance of props.values()) instance.updateLink?.(connected);
    },
    tick(dtSeconds, camera) {
      for (const instance of props.values()) instance.tick?.(dtSeconds);
      occluder.update(Math.min(dtSeconds, 0.1), camera);
    },
    occluder,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const instance of [...props.values()].reverse()) instance.dispose();
      for (const root of builtRoots) scene.remove(root);
      for (const root of navObjects) {
        scene.remove(root);
        root.traverse((child) => {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
      }
      for (const panel of navPanels) panel.dispose();
      for (const hitbox of wallHitboxes) {
        hitbox.geometry.dispose();
        (hitbox.material as THREE.Material).dispose();
      }
      if (occluder.object) scene.remove(occluder.object);
      occluder.dispose();
      scene.remove(...lights);
      scene.background = previousBackground;
      scene.fog = previousFog;
      runtime.dispose();
      props.clear();
      nodes.clear();
    }
  };

  handle.setActiveNode(activeNodeId);
  return handle;
}

function createWallTarget(node: NavNode, size: [number, number, number]): THREE.Mesh {
  const [width, height, depth] = size;
  const [x, , z] = node.lookAt ?? node.position;
  const candidates = [
    { distance: Math.abs(width / 2 - x), axis: 'x' as const, side: 1 },
    { distance: Math.abs(-width / 2 - x), axis: 'x' as const, side: -1 },
    { distance: Math.abs(depth / 2 - z), axis: 'z' as const, side: 1 },
    { distance: Math.abs(-depth / 2 - z), axis: 'z' as const, side: -1 }
  ];
  const wall = candidates.sort((a, b) => a.distance - b.distance)[0];
  const geometry =
    wall.axis === 'x' ? new THREE.PlaneGeometry(depth, height) : new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
    side: THREE.DoubleSide
  });
  const hitbox = new THREE.Mesh(geometry, material);
  if (wall.axis === 'x') {
    hitbox.position.set(wall.side * width / 2, height / 2, 0);
    hitbox.rotation.y = Math.PI / 2;
  } else {
    hitbox.position.set(0, height / 2, wall.side * depth / 2);
  }
  hitbox.userData.egressTarget = { kind: 'nav', nodeId: node.id };
  hitbox.updateMatrixWorld(true);
  return hitbox;
}

function topologicalProps(visual: RoomVisual): RoomVisual['props'] {
  const byId = new Map(visual.props.map((prop) => [prop.id, prop]));
  const ordered: RoomVisual['props'] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Parent cycle includes prop "${id}"`);
    const prop = byId.get(id);
    if (!prop) throw new Error(`Unknown prop "${id}"`);
    visiting.add(id);
    if (prop.parent) {
      if (!byId.has(prop.parent)) throw new Error(`Prop "${id}" has unknown parent "${prop.parent}"`);
      visit(prop.parent);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(prop);
  };
  for (const prop of visual.props) visit(prop.id);
  return ordered;
}

function applyTransform(object: THREE.Object3D, transform: RoomVisual['props'][number]['transform']): void {
  object.position.set(...transform.position);
  object.rotation.set(...(transform.rotation ?? [0, 0, 0]));
  const scale = transform.scale ?? 1;
  if (typeof scale === 'number') object.scale.setScalar(scale);
  else object.scale.set(...scale);
}

function resolveNodes(visual: RoomVisual, props: Map<string, PropInstance>): Map<string, NavNode> {
  const nodes = new Map<string, NavNode>();
  for (const authored of visual.nodes) {
    if (authored.lookAt) {
      nodes.set(authored.id, { ...authored, position: [...authored.position], lookAt: [...authored.lookAt] });
      continue;
    }
    const centres: THREE.Vector3[] = [];
    for (const spec of visual.props) {
      if (!spec.nodes?.includes(authored.id)) continue;
      const instance = props.get(spec.id);
      if (!instance) continue;
      const box = new THREE.Box3().setFromObject(instance.object);
      centres.push(box.isEmpty() ? instance.object.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3()));
    }
    const target = new THREE.Vector3();
    for (const centre of centres) target.add(centre);
    if (centres.length > 0) target.multiplyScalar(1 / centres.length);
    else target.set(0, visual.eyeHeightM, 0);
    if (target.distanceToSquared(new THREE.Vector3(...authored.position)) < 1e-8) target.z -= 1;
    nodes.set(authored.id, {
      ...authored,
      position: [...authored.position],
      lookAt: target.toArray() as [number, number, number]
    });
  }
  return nodes;
}
