import * as THREE from 'three';
import type { InspectPose, NavNode, ResolvedInspectPose, Vec3 } from './types.js';
import type { PropInstance } from './props/registry.js';

export type Pose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  fov: number;
  zoom: number;
};

export type RoomCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export type CameraState =
  | { mode: 'node'; nodeId: string }
  | { mode: 'transit'; from: Pose; to: Pose; t: number; then: CameraState }
  | { mode: 'inspect'; propId: string; returnNodeId: string; returnPose: Pose };

export type CameraRoom = {
  nodes: Map<string, NavNode>;
  props: Map<string, PropInstance>;
  readonly activeNodeId: string;
  setActiveNode(id: string): void;
};

export type CameraController = {
  readonly state: CameraState;
  goToNode(nodeId: string): boolean;
  inspect(propId: string): boolean;
  escape(): boolean;
  tick(dtSeconds: number): void;
  snapToNode(nodeId: string): void;
};

const DEFAULT_NODE_FOV = 55;
const TRANSIT_SECONDS = 0.55;

export function deriveInspectPose(
  object: THREE.Object3D,
  owningNodePosition: Vec3,
  override: InspectPose = {}
): ResolvedInspectPose {
  object.updateWorldMatrix(true, true);
  const sphere = new THREE.Sphere();
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    sphere.center.setFromMatrixPosition(object.matrixWorld);
    sphere.radius = 0.1;
  } else {
    box.getBoundingSphere(sphere);
  }

  const anchor = override.anchor ? new THREE.Vector3(...override.anchor) : sphere.center;
  const normal = override.normal
    ? new THREE.Vector3(...override.normal)
    : new THREE.Vector3(...owningNodePosition).sub(anchor);
  if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
  normal.normalize();
  const fovDeg = override.fovDeg ?? 30;
  const derivedDistance =
    (Math.max(sphere.radius, 0.025) / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)) * 1.15;

  return {
    anchor: anchor.toArray() as Vec3,
    normal: normal.toArray() as Vec3,
    distanceM: override.distanceM ?? THREE.MathUtils.clamp(derivedDistance, 0.28, 1.4),
    fovDeg
  };
}

export function createCameraController(
  camera: RoomCamera,
  room: CameraRoom,
  options: { nodeFov?: number; transitSeconds?: number } = {}
): CameraController {
  const nodeFov = options.nodeFov ?? DEFAULT_NODE_FOV;
  const duration = Math.max(options.transitSeconds ?? TRANSIT_SECONDS, 0.001);
  let state: CameraState = { mode: 'node', nodeId: room.activeNodeId };

  const currentPose = (): Pose => ({
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : nodeFov,
    zoom: camera.zoom
  });

  const nodePose = (nodeId: string): Pose => {
    const node = room.nodes.get(nodeId);
    if (!node) throw new Error(`Unknown navigation node "${nodeId}"`);
    const target = new THREE.Vector3(...(node.lookAt ?? [node.position[0], node.position[1], node.position[2] - 1]));
    return lookPose(new THREE.Vector3(...node.position), target, nodeFov, 1);
  };

  const inspectPose = (propId: string): Pose | undefined => {
    const resolved = room.props.get(propId)?.inspectPose;
    if (!resolved) return undefined;
    const anchor = new THREE.Vector3(...resolved.anchor);
    const position = anchor.clone().addScaledVector(new THREE.Vector3(...resolved.normal), resolved.distanceM);
    return lookPose(
      position,
      anchor,
      resolved.fovDeg,
      THREE.MathUtils.clamp(nodeFov / resolved.fovDeg, 1, 3.2)
    );
  };

  const transit = (to: Pose, then: CameraState) => {
    state = { mode: 'transit', from: currentPose(), to, t: 0, then };
  };

  const controller: CameraController = {
    get state() {
      return state;
    },
    goToNode(nodeId) {
      if (!room.nodes.has(nodeId)) return false;
      transit(nodePose(nodeId), { mode: 'node', nodeId });
      return true;
    },
    inspect(propId) {
      const pose = inspectPose(propId);
      if (!pose || state.mode === 'transit') return false;
      const returnNodeId = state.mode === 'node' ? state.nodeId : state.returnNodeId;
      const returnPose = state.mode === 'node' ? currentPose() : state.returnPose;
      transit(pose, { mode: 'inspect', propId, returnNodeId, returnPose });
      return true;
    },
    escape() {
      const inspection =
        state.mode === 'inspect'
          ? state
          : state.mode === 'transit' && state.then.mode === 'inspect'
            ? state.then
            : undefined;
      if (!inspection) return false;
      transit(inspection.returnPose, { mode: 'node', nodeId: inspection.returnNodeId });
      return true;
    },
    tick(dtSeconds) {
      if (state.mode !== 'transit') return;
      state.t = Math.min(1, state.t + Math.max(0, dtSeconds) / duration);
      const amount = smootherstep(state.t);
      camera.position.lerpVectors(state.from.position, state.to.position, amount);
      camera.quaternion.slerpQuaternions(state.from.quaternion, state.to.quaternion, amount);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(state.from.fov, state.to.fov, amount);
      }
      camera.zoom = THREE.MathUtils.lerp(state.from.zoom, state.to.zoom, amount);
      camera.updateProjectionMatrix();
      if (state.t >= 1) {
        const next = state.then;
        applyPose(camera, state.to);
        state = next;
        if (next.mode === 'node') room.setActiveNode(next.nodeId);
      }
    },
    snapToNode(nodeId) {
      const pose = nodePose(nodeId);
      room.setActiveNode(nodeId);
      applyPose(camera, pose);
      state = { mode: 'node', nodeId };
    }
  };

  controller.snapToNode(room.activeNodeId);
  return controller;
}

export function configureCameraForRoom(
  camera: RoomCamera,
  bounds: { size: Vec3 }
): void {
  const diagonal = new THREE.Vector3(...bounds.size).length();
  camera.near = Math.max(0.01, diagonal / 1000);
  camera.far = Math.max(10, diagonal * 4);
  camera.updateProjectionMatrix();
}

function lookPose(position: THREE.Vector3, target: THREE.Vector3, fov: number, zoom: number): Pose {
  const matrix = new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0));
  return { position, quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix), fov, zoom };
}

function applyPose(camera: RoomCamera, pose: Pose): void {
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  if (camera instanceof THREE.PerspectiveCamera) camera.fov = pose.fov;
  camera.zoom = pose.zoom;
  camera.updateProjectionMatrix();
}

function smootherstep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}
