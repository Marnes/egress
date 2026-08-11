import { describe, expect, it } from 'vitest';
import {
  AGENT_NAME,
  applyAction,
  playerView,
  pumpRoom,
  pumpRoomVisual,
  SUMP_START_MM,
  themes,
  type PlayerView
} from '@egress/core';
import * as THREE from 'three';
import { buildRoom } from '../src/three/buildRoom.js';
import { createCameraController } from '../src/three/camera.js';
import { InteractionRaycaster } from '../src/three/interaction.js';
import type { RoomVisual, Theme } from '../src/three/types.js';

const theme: Theme = {
  id: 'test',
  palette: {
    background: '#ffffff',
    floor: '#eeeeee',
    wall: '#dddddd',
    ceiling: '#ffffff',
    structure: '#cccccc',
    metal: '#bbbbbb',
    metalDark: '#999999',
    accent: '#eeeeee',
    warning: '#dddddd',
    ink: '#000000'
  },
  fog: { color: '#ffffff', visibilityM: 20, mode: 'linear' },
  lightRig: { ambient: { color: '#ffffff', intensity: 1 } },
  occluder: {
    kind: 'lightCone',
    angleDeg: 35,
    penumbra: 0.4,
    intensity: 1,
    reachM: 8,
    color: '#ffffff',
    ambientFloor: 0.1
  },
  outline: { thicknessPx: 1, depthSensitivity: 1, normalSensitivity: 1 },
  surface: { shading: 'flat', roughness: 0.8, metalness: 0.1 },
  grade: { vignette: 0.2, grain: 0.01, exposure: 1 }
};

const visual: RoomVisual = {
  version: 1,
  bounds: { size: [10, 4, 10] },
  eyeHeightM: 1.6,
  themeId: 'test',
  startNodeId: 'a',
  nodes: [
    { id: 'a', label: 'A', position: [0, 1.6, 2] },
    { id: 'b', label: 'B', position: [2, 1.6, 0], lookAt: [0, 1, 0] }
  ],
  props: [
    {
      id: 'switch',
      type: 'breakerSwitch',
      parent: 'panel',
      transform: { position: [0, 0, 0.1] },
      nodes: ['a'],
      objectId: 'switch',
      interactive: true,
      params: { index: 0 }
    },
    { id: 'shell', type: 'shell', transform: { position: [0, 2, 0] } },
    { id: 'box', type: 'box', transform: { position: [-3, 0.5, 0] } },
    { id: 'cylinder', type: 'cylinder', transform: { position: [-2, 0.5, 0] } },
    {
      id: 'panel',
      type: 'panelBox',
      transform: { position: [-1, 1, 0] },
      nodes: ['a'],
      objectId: 'panel',
      interactive: true
    },
    { id: 'gauge', type: 'gaugeDial', transform: { position: [0, 1, 0] }, nodes: ['a'], objectId: 'pipe' },
    { id: 'stencil', type: 'stencilBand', transform: { position: [1, 1, 0] }, nodes: ['a'], objectId: 'pipe' },
    {
      id: 'keypad',
      type: 'keypad',
      transform: { position: [2, 1, 0] },
      nodes: ['b'],
      objectId: 'keypad',
      interactive: true
    },
    {
      id: 'door',
      type: 'door',
      transform: { position: [3, 1, 0] },
      nodes: ['b'],
      objectId: 'door',
      interactive: true
    },
    {
      id: 'speaker',
      type: 'speakerGrille',
      transform: { position: [0, 1, -2] },
      nodes: ['a', 'b'],
      objectId: 'speaker',
      interactive: true
    }
  ]
};

const viewA: PlayerView = {
  roomId: 'test',
  roomName: 'Test',
  objects: [
    { id: 'switch', label: 'Switch', gauge: null, actions: [{ id: 'flip', label: 'Flip', enabled: true }] },
    { id: 'panel', label: 'Panel', gauge: null, actions: [{ id: 'open', label: 'Open', enabled: true }] },
    { id: 'pipe', label: 'Pipe', stencil: 'C', gauge: null, actions: [] },
    { id: 'keypad', label: 'Keypad', gauge: null, actions: [{ id: 'code', label: 'Code', enabled: true, input: 'digits4' }] },
    { id: 'door', label: 'Door', gauge: null, actions: [{ id: 'inspect', label: 'Inspect', enabled: true }] },
    { id: 'speaker', label: 'Speaker', gauge: null, actions: [{ id: 'inspect', label: 'Inspect', enabled: true }] }
  ],
  switches: [false],
  lightsOn: false,
  powerOn: false,
  panelLocked: true,
  doorOpen: false,
  valveOpen: false,
  pumpRunning: false,
  sumpMm: 240,
  complete: false
};

const viewB: PlayerView = {
  ...viewA,
  objects: viewA.objects.map((object) => (object.id === 'pipe' ? { ...object, gauge: 9 } : object)),
  switches: [true],
  lightsOn: true,
  powerOn: true,
  panelLocked: false,
  doorOpen: true,
  valveOpen: true,
  pumpRunning: true,
  sumpMm: 0
};

describe('Three room engine', () => {
  it('builds headlessly and applies view state deterministically', () => {
    const first = buildRoom(visual, theme, { objectIds: viewA.objects.map((object) => object.id) });
    expect([...first.props.keys()]).toEqual([
      'panel',
      'switch',
      'shell',
      'box',
      'cylinder',
      'gauge',
      'stencil',
      'keypad',
      'door',
      'speaker'
    ]);
    expect(first.props.get('panel')?.inspectPose).toBeDefined();
    expect(first.activeHitboxes()).toHaveLength(7);
    expect(first.props.get('keypad')?.object.visible).toBe(true);

    first.applyView(viewA);
    const breakerPaddle = first.props.get('switch')?.object.getObjectByName('switch:paddle');
    const breakerPivot = first.props.get('switch')?.object.getObjectByName('switch:pivot');
    first.props.get('switch')?.object.updateWorldMatrix(true, true);
    const offPaddleY = breakerPaddle?.getWorldPosition(new THREE.Vector3()).y;
    const pivotY = breakerPivot?.getWorldPosition(new THREE.Vector3()).y;
    expect(offPaddleY).toBeLessThan(pivotY!);
    expect(first.props.get('panel')?.object.getObjectByName('panel:door')?.rotation.y).toBe(0);
    first.applyView(viewB);
    first.props.get('switch')?.object.updateWorldMatrix(true, true);
    const onPaddleY = breakerPaddle?.getWorldPosition(new THREE.Vector3()).y;
    expect(onPaddleY).toBeGreaterThan(pivotY!);
    expect(first.props.get('panel')?.object.getObjectByName('panel:door')?.rotation.y).not.toBe(0);
    const afterTransition = snapshot(first);
    first.applyView(viewB);
    expect(snapshot(first)).toEqual(afterTransition);
    first.tick(2.4, new THREE.PerspectiveCamera());
    expect(displayValue(first.props.get('keypad')!.object)).toBe('----');
    const keyNames: string[] = [];
    first.props.get('keypad')!.object.traverse((object) => {
      if (object.name.includes(':key:')) keyNames.push(object.name.split(':').at(-1)!);
    });
    expect(keyNames).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']);

    const fresh = buildRoom(visual, theme, { objectIds: viewA.objects.map((object) => object.id) });
    fresh.applyView(viewB);
    expect(snapshot(fresh)).toEqual(afterTransition);
    fresh.setActiveNode('b');
    expect(fresh.props.get('panel')?.object.visible).toBe(true);
    expect(fresh.props.get('speaker')?.object.visible).toBe(true);
    expect(fresh.activeHitboxes()).toHaveLength(15);

    first.dispose();
    first.dispose();
    fresh.dispose();
    expect(first.props.size).toBe(0);
  });

  it('uses ten numeric keypad subtargets and auto-submits after four presses', () => {
    const room = buildRoom(visual, theme, { objectIds: viewA.objects.map((object) => object.id) });
    const keypad = room.props.get('keypad')!;
    const targets = keypad.hitboxes
      .map((hitbox) => hitbox.userData.egressTarget)
      .filter((target) => target.kind === 'keypad-key');
    expect(targets.map((target) => target.digit).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

    room.applyView(viewB);
    expect(keypad.keypad?.press('7')).toBeUndefined();
    expect(displayValue(keypad.object)).toBe('7---');
    expect(keypad.keypad?.press('3')).toBeUndefined();
    expect(displayValue(keypad.object)).toBe('73--');
    expect(keypad.keypad?.press('1')).toBeUndefined();
    expect(displayValue(keypad.object)).toBe('731-');
    const attempt = keypad.keypad?.press('9');
    expect(attempt?.digits).toBe('7319');
    expect(displayValue(keypad.object)).toBe('7319');
    expect(keypad.keypad?.press('0')).toBeUndefined();

    keypad.keypad?.resolve(attempt!.id, 'wrong');
    expect(displayFeedback(keypad.object)).toBe('wrong');
    room.tick(0.8, new THREE.PerspectiveCamera());
    expect(displayFeedback(keypad.object)).toBeNull();
    expect(displayValue(keypad.object)).toBe('----');

    for (const digit of ['7', '3', '1']) expect(keypad.keypad?.press(digit)).toBeUndefined();
    const correct = keypad.keypad?.press('9');
    keypad.keypad?.resolve(correct!.id, 'correct');
    expect(displayFeedback(keypad.object)).toBe('correct');
    room.dispose();
  });

  it('keeps every wall rendered while hitboxes remain scoped to the active node', () => {
    const nested: RoomVisual = structuredClone(visual);
    const keypad = nested.props.find((prop) => prop.id === 'keypad')!;
    keypad.parent = 'panel';
    keypad.transform.position = [2, 0, 0];
    const room = buildRoom(nested, theme, { objectIds: viewA.objects.map((object) => object.id) });

    expect(room.props.get('panel')?.object.visible).toBe(true);
    expect(room.props.get('keypad')?.object.visible).toBe(true);
    expect(room.activeHitboxes()).toHaveLength(7);
    room.setActiveNode('b');
    expect(room.props.get('panel')?.object.visible).toBe(true);
    expect(room.props.get('keypad')?.object.visible).toBe(true);
    expect(room.activeHitboxes()).toHaveLength(15);
    room.dispose();
  });

  it('creates one clickable target per authored wall without adding it to the scene', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id),
      navDiscs: false,
      wallTargets: true
    });
    const wallTargets = room
      .activeHitboxes()
      .filter((object) => object.userData.egressTarget?.kind === 'nav');
    expect(wallTargets).toHaveLength(pumpRoomVisual.nodes.length);
    expect(wallTargets.every((target) => target.parent === null)).toBe(true);
    room.dispose();
  });

  it('keeps derived inspection cameras inside the room on the player-facing side', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    for (const id of ['switch_0', 'facility_terminal']) {
      const pose = room.props.get(id)?.inspectPose;
      expect(pose).toBeDefined();
      const cameraPosition = new THREE.Vector3(...pose!.anchor).addScaledVector(
        new THREE.Vector3(...pose!.normal),
        pose!.distanceM
      );
      expect(Math.abs(cameraPosition.x)).toBeLessThanOrEqual(3);
      expect(cameraPosition.y).toBeGreaterThanOrEqual(0);
      expect(cameraPosition.y).toBeLessThanOrEqual(3);
      expect(Math.abs(cameraPosition.z)).toBeLessThanOrEqual(2);
    }
    room.dispose();
  });

  it('renders recent player and agent messages on the facility terminal', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    room.applyMessages([
      { from: 'player', text: 'Can you unlock the panel?' },
      { from: 'agent', text: 'Releasing it now.' }
    ]);
    const screen = room.props
      .get('facility_terminal')
      ?.object.getObjectByName('facility_terminal:screen');
    expect(screen?.userData.value).toContain('YOU> Can you unlock the panel?');
    expect(screen?.userData.value).toContain(`${AGENT_NAME.toUpperCase()}> Releasing it now.`);
    room.dispose();
  });

  it('starts with terminal light only and powers ceiling fixtures from server state', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    const terminalLight = room.props
      .get('facility_terminal')
      ?.object.getObjectByName('facility_terminal:light') as THREE.PointLight;
    const ceilingLightA = room.props
      .get('ceiling_light_a')
      ?.object.getObjectByName('ceiling_light_a:light') as THREE.SpotLight;
    const ceilingPanelA = room.props
      .get('ceiling_light_a')
      ?.object.getObjectByName('ceiling_light_a:panel');

    room.applyView(viewA);
    expect(terminalLight.intensity).toBeGreaterThan(0);
    expect(ceilingLightA.intensity).toBe(0);
    expect(ceilingPanelA?.userData.powered).toBe(false);
    room.applyView(viewB);
    expect(ceilingLightA.intensity).toBeGreaterThan(0);
    expect(ceilingPanelA?.userData.powered).toBe(true);
    room.dispose();
  });

  it('builds architectural and prop detail beyond primitive silhouettes', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    let shellMeshes = 0;
    let pipeClamps = 0;
    let doorMeshes = 0;
    room.props.get('shell')?.object.traverse((object) => {
      if (object instanceof THREE.Mesh) shellMeshes += 1;
    });
    room.props.get('pipe_a')?.object.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry.type === 'TorusGeometry') pipeClamps += 1;
    });
    room.props.get('exit_door')?.object.traverse((object) => {
      if (object instanceof THREE.Mesh) doorMeshes += 1;
    });
    expect(shellMeshes).toBeGreaterThan(20);
    expect(pipeClamps).toBe(3);
    expect(doorMeshes).toBeGreaterThan(8);
    room.dispose();
  });

  it('exposes the pipe glyph faces to rays from the owning node', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    const origin = new THREE.Vector3(...room.nodes.get('pipes')!.position);
    for (const id of ['stencil_c', 'gauge_c']) {
      const instance = room.props.get(id)!;
      instance.object.updateWorldMatrix(true, true);
      let face: THREE.Mesh | undefined;
      instance.object.traverse((object) => {
        if (object instanceof THREE.Mesh && (object.geometry.type === 'PlaneGeometry' || object.geometry.type === 'CircleGeometry')) {
          face = object;
        }
      });
      expect(face).toBeDefined();
      const target = face!.getWorldPosition(new THREE.Vector3());
      const ray = new THREE.Raycaster(origin, target.clone().sub(origin).normalize(), 0, origin.distanceTo(target) + 0.1);
      expect(ray.intersectObject(face!, false)).not.toHaveLength(0);
    }
    room.dispose();
  });

  it('transits between nodes, inspects, and returns on escape', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    const camera = new THREE.PerspectiveCamera();
    const controller = createCameraController(camera, room);
    expect(controller.goToNode('pipes')).toBe(true);
    controller.tick(0.55);
    expect(room.activeNodeId).toBe('pipes');
    expect(controller.inspect('pipe_c')).toBe(true);
    controller.tick(0.55);
    expect(controller.state.mode).toBe('inspect');
    expect(controller.escape()).toBe(true);
    controller.tick(0.55);
    expect(controller.state).toEqual({ mode: 'node', nodeId: 'pipes' });
    room.dispose();
  });

  it('keeps the whole keypad inside the inspection viewport', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 50);
    const controller = createCameraController(camera, room);

    expect(controller.inspect('keypad_unit')).toBe(true);
    controller.tick(0.55);
    camera.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(room.props.get('keypad_unit')!.object);
    const corners = [box.min.y, box.max.y].flatMap((y) =>
      [box.min.x, box.max.x].flatMap((x) =>
        [box.min.z, box.max.z].map((z) => new THREE.Vector3(x, y, z).project(camera))
      )
    );
    expect(Math.max(...corners.map((point) => Math.abs(point.x)))).toBeLessThan(0.9);
    expect(Math.max(...corners.map((point) => Math.abs(point.y)))).toBeLessThan(0.9);
    room.dispose();
  });

  it('returns from inspection to the exact free-movement camera pose', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    const camera = new THREE.PerspectiveCamera();
    const controller = createCameraController(camera, room);
    controller.snapToNode('pipes');
    camera.position.add(new THREE.Vector3(0.35, 0, -0.4));
    camera.rotateY(0.3);
    const returnPosition = camera.position.clone();
    const returnQuaternion = camera.quaternion.clone();

    expect(controller.inspect('pipe_c')).toBe(true);
    controller.tick(0.55);
    expect(controller.escape()).toBe(true);
    controller.tick(0.55);
    expect(camera.position.distanceTo(returnPosition)).toBeLessThan(1e-6);
    expect(camera.quaternion.angleTo(returnQuaternion)).toBeLessThan(1e-6);
    room.dispose();
  });

  it('raycasts only enabled targets and prioritises input actions', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.userData.egressTarget = { kind: 'prop', propId: 'keypad', objectId: 'keypad' };
    const raycaster = new InteractionRaycaster({ activeHitboxes: () => [mesh] });
    raycaster.setView(viewB);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 10);
    camera.position.z = 3;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    expect(raycaster.pick(camera, new THREE.Vector2())).toEqual({
      kind: 'prop',
      propId: 'keypad',
      objectId: 'keypad',
      actionId: 'code',
      input: 'digits4'
    });

    const proximityRaycaster = new InteractionRaycaster(
      { activeHitboxes: () => [mesh] },
      { maxPropDistanceM: 1 }
    );
    proximityRaycaster.setView(viewB);
    expect(proximityRaycaster.pick(camera, new THREE.Vector2())).toBeNull();
    camera.position.z = 1.4;
    camera.updateMatrixWorld(true);
    expect(proximityRaycaster.pick(camera, new THREE.Vector2())).toMatchObject({
      kind: 'prop',
      objectId: 'keypad'
    });
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });

  it('returns a non-actionable hint for a disabled override control', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.userData.egressTarget = { kind: 'prop', propId: 'valve', objectId: 'valve' };
    const raycaster = new InteractionRaycaster({ activeHitboxes: () => [mesh] });
    raycaster.setView({
      ...viewA,
      objects: [
        {
          id: 'valve',
          label: 'Bypass crank',
          gauge: null,
          actions: [
            {
              id: 'turn_crank',
              label: 'Turn crank',
              enabled: false,
              disabledLabel: 'Needs override'
            }
          ]
        }
      ]
    });
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 10);
    camera.position.z = 3;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    expect(raycaster.pick(camera, new THREE.Vector2())).toEqual({
      kind: 'blocked-prop',
      propId: 'valve',
      objectId: 'valve',
      detail: 'Needs override'
    });
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });

  it('omits explicitly non-interactive props from hover targets', () => {
    const room = buildRoom(pumpRoomVisual, themes[pumpRoomVisual.themeId], {
      objectIds: pumpRoom.objects.map((object) => object.id),
      allPropHitboxes: true
    });
    const propIds = room.activeHitboxes().map(
      (hitbox) => (hitbox.userData.egressTarget as { propId?: string } | undefined)?.propId
    );

    expect(propIds).toContain('discharge_valve');
    expect(propIds).not.toContain('discharge_gauge');
    room.dispose();
  });
});

function displayValue(object: THREE.Object3D): unknown {
  let value: unknown;
  object.traverse((child) => {
    if (child.userData.value !== undefined) value = child.userData.value;
  });
  return value;
}

function displayFeedback(object: THREE.Object3D): unknown {
  let feedback: unknown;
  object.traverse((child) => {
    if (child.userData.feedback !== undefined) feedback = child.userData.feedback;
  });
  return feedback;
}

function snapshot(room: ReturnType<typeof buildRoom>) {
  return [...room.props].map(([id, instance]) => {
    const objects: unknown[] = [];
    instance.object.traverse((object) => {
      objects.push({
        name: object.name,
        position: object.position.toArray(),
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
        visible: object.visible,
        value: object.userData.value ?? null,
        targetAngle: object.userData.targetAngle ?? null
      });
    });
    return [id, objects];
  });
}

describe('facility terminal', () => {
  const terminalView: PlayerView = {
    ...viewA,
    objects: pumpRoom.objects.map((object) => ({
      id: object.id,
      label: object.label,
      gauge: null,
      actions: [{ id: 'inspect', label: 'Inspect', enabled: true }]
    }))
  };

  it('reports the link as offline until the operator connects', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    const screen = room.props.get('facility_terminal')?.object.getObjectByName('facility_terminal:screen');

    expect(screen?.userData.value).toContain('OFFLINE');
    expect(screen?.userData.linkConnected).toBe(false);

    room.applyLink(true);
    expect(screen?.userData.linkConnected).toBe(true);
    expect(screen?.userData.value).not.toContain('OFFLINE');

    // A live transcript survives the operator dropping off the line.
    room.applyMessages([{ from: 'agent', text: 'Standing by.' }]);
    room.applyLink(false);
    expect(screen?.userData.value).toContain(`${AGENT_NAME.toUpperCase()}> Standing by.`);
    expect(screen?.userData.linkConnected).toBe(false);
    room.dispose();
  });

  it('is clickable from its own node, and asks to open the terminal', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id),
      allPropHitboxes: true
    });
    const node = room.nodes.get('intercom')!;
    const camera = new THREE.PerspectiveCamera(52, 1.6, 0.01, 50);
    camera.position.set(...node.position);
    camera.lookAt(new THREE.Vector3(...node.lookAt!));
    camera.updateMatrixWorld(true);

    // The same distance gate the scene applies to pointer picks.
    const raycaster = new InteractionRaycaster(room, { maxPropDistanceM: 1.45 });
    raycaster.setView(terminalView);
    const target = raycaster.pick(camera, new THREE.Vector2(0, 0));

    expect(target).toMatchObject({
      kind: 'prop',
      propId: 'facility_terminal',
      objectId: 'intercom',
      opens: 'terminal'
    });
    room.dispose();
  });
});

describe('opening state', () => {
  it('starts the player facing the terminal', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    const node = room.nodes.get(room.activeNodeId)!;
    const camera = new THREE.PerspectiveCamera(55, 1.6, 0.01, 50);
    camera.position.set(...node.position);
    camera.lookAt(new THREE.Vector3(...node.lookAt!));
    camera.updateMatrixWorld(true);

    const screen = room.props
      .get('facility_terminal')!
      .object.getObjectByName('facility_terminal:screen')!;
    const toScreen = screen
      .getWorldPosition(new THREE.Vector3())
      .sub(camera.position)
      .normalize();
    const forward = camera.getWorldDirection(new THREE.Vector3());

    expect(forward.dot(toScreen)).toBeGreaterThan(0.95);
    room.dispose();
  });

  it('strikes the ceiling tubes with a flicker before they settle', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    const camera = new THREE.PerspectiveCamera();
    const tube = room.props
      .get('ceiling_light_a')!
      .object.getObjectByName('ceiling_light_a:light') as THREE.SpotLight;

    room.applyView(viewA);
    expect(tube.intensity).toBe(0);

    room.applyView(viewB);
    expect(tube.intensity).toBeGreaterThan(0);

    let dropouts = 0;
    let peak = 0;
    for (let step = 0; step < 90; step += 1) {
      room.tick(1 / 60, camera);
      if (tube.intensity === 0) dropouts += 1;
      peak = Math.max(peak, tube.intensity);
    }
    // It stutters out at least once on the way up, then holds at full.
    expect(dropouts).toBeGreaterThan(0);
    room.tick(1, camera);
    expect(tube.intensity).toBeCloseTo(peak, 5);
    expect(tube.intensity).toBeGreaterThan(0);
    room.dispose();
  });
});

describe('room clutter', () => {
  it('keeps vermin scurrying inside their run, identically every build', () => {
    const build = () =>
      buildRoom(pumpRoomVisual, themes.industrial, {
        objectIds: pumpRoom.objects.map((object) => object.id)
      });
    const camera = new THREE.PerspectiveCamera();
    const walk = (room: ReturnType<typeof buildRoom>) => {
      const mouse = room.props.get('mice_north')!.object.getObjectByName('mice_north:mouse-0')!;
      const track: number[] = [];
      for (let step = 0; step < 24; step += 1) {
        room.tick(0.25, camera);
        track.push(Number(mouse.position.x.toFixed(5)));
      }
      return track;
    };

    const first = build();
    const track = walk(first);
    // It actually moves, and never leaves the run the room laid out for it.
    expect(new Set(track).size).toBeGreaterThan(3);
    for (const x of track) expect(Math.abs(x)).toBeLessThanOrEqual(1.9 / 2 + 1e-6);
    expect(Math.max(...track) - Math.min(...track)).toBeGreaterThan(0.5);

    const second = build();
    expect(walk(second)).toEqual(track);
    first.dispose();
    second.dispose();
  });

  it('builds barrels with their hoops and lid hardware', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    let meshes = 0;
    room.props.get('barrel_a')?.object.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes += 1;
    });
    expect(meshes).toBeGreaterThanOrEqual(8);
    expect(room.props.get('barrel_a')?.object.getObjectByName('barrel_a:drum')).toBeDefined();
    // The tipped drum is laid over, not standing.
    expect(room.props.get('barrel_tipped')?.object.rotation.z).toBeCloseTo(1.5708, 4);
    const plan = room.props.get('pipe_service_plan')!.object;
    expect(plan.getObjectByName('pipe_service_plan:paper')).toBeDefined();
    expect(plan.getObjectByName('pipe_service_plan:work-order')).toBeDefined();
    expect(plan.getObjectByName('pipe_service_plan:pipe-left')).toBeDefined();
    expect(plan.getObjectByName('pipe_service_plan:pipe-right')).toBeDefined();
    expect(plan.getObjectByName('pipe_service_plan:swap-arrow-top')).toBeDefined();
    expect(plan.getObjectByName('pipe_service_plan:swap-arrow-bottom')).toBeDefined();
    const planBounds = new THREE.Box3().setFromObject(plan);
    expect(planBounds.min.y).toBeGreaterThan(0.9);
    expect(planBounds.min.z).toBeLessThan(-1.5);
    expect(planBounds.max.z).toBeGreaterThan(-0.9);
    room.dispose();
  });
});

describe('fittings and water', () => {
  const build = () =>
    buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });

  it('lights the work lamp with the room and keeps it swaying', () => {
    const room = build();
    const camera = new THREE.PerspectiveCamera();
    const lamp = room.props.get('work_lamp')!.object;
    const light = lamp.getObjectByName('work_lamp:light') as THREE.SpotLight;
    const pivot = lamp.getObjectByName('work_lamp:pivot')!;

    room.applyView(viewA);
    expect(light.intensity).toBe(0);
    room.applyView(viewB);
    expect(light.intensity).toBeGreaterThan(0);

    const start = pivot.rotation.z;
    let swung = 0;
    for (let step = 0; step < 120; step += 1) {
      room.tick(1 / 60, camera);
      swung = Math.max(swung, Math.abs(pivot.rotation.z - start));
    }
    expect(swung).toBeGreaterThan(0.01);
    room.dispose();
  });

  it('keeps the lamp fitting from shadowing its own bulb', () => {
    const room = build();
    const lamp = room.props.get('work_lamp')!.object;
    let shades = 0;
    lamp.traverse((object) => {
      if (object.userData.egressNoShadow === true) shades += 1;
    });
    // Shade, socket, cable and hook all sit within millimetres of the bulb.
    expect(shades).toBeGreaterThanOrEqual(4);
    room.dispose();
  });

  it('drops water into the puddle and leaves a ring behind', () => {
    const room = build();
    const camera = new THREE.PerspectiveCamera();
    const pool = room.props.get('floor_pool')!.object;
    const drop = pool.getObjectByName('floor_pool:drop')!;
    const ripple = pool.getObjectByName('floor_pool:ripple')!;

    const heights: number[] = [];
    let sawRipple = false;
    let sawFall = false;
    for (let step = 0; step < 240; step += 1) {
      room.tick(1 / 60, camera);
      if (drop.visible) {
        sawFall = true;
        heights.push(drop.position.y);
      }
      if (ripple.visible) sawRipple = true;
      // The drop and its ring are never on screen at the same time.
      expect(drop.visible && ripple.visible).toBe(false);
    }
    expect(sawFall).toBe(true);
    expect(sawRipple).toBe(true);
    // It falls, rather than hovering or rising.
    expect(heights.at(-1)!).toBeLessThan(heights[0]);
    room.dispose();
  });

  it('stands a pump on the plinth with its motor and volute', () => {
    const room = build();
    const unit = room.props.get('pump_unit')!.object;
    expect(unit.getObjectByName('pump_unit:motor')).toBeDefined();
    expect(unit.getObjectByName('pump_unit:volute')).toBeDefined();
    const box = new THREE.Box3().setFromObject(unit);
    // It sits on the plinth top, not sunk through it or hovering.
    expect(box.min.y).toBeGreaterThanOrEqual(0.28);
    expect(box.min.y).toBeLessThan(0.34);
    room.dispose();
  });
});

describe('sump puzzle in the room', () => {
  const build = () =>
    buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id),
      allPropHitboxes: true
    });

  it('winds the handwheel round when the valve opens', () => {
    const room = build();
    const camera = new THREE.PerspectiveCamera();
    const wheel = room.props.get('discharge_valve')!.object.getObjectByName('discharge_valve:wheel')!;

    room.applyView({ ...viewA, valveOpen: false });
    for (let step = 0; step < 180; step += 1) room.tick(1 / 60, camera);
    expect(wheel.rotation.y).toBeCloseTo(0, 4);

    room.applyView({ ...viewA, valveOpen: true });
    const partway = (() => {
      for (let step = 0; step < 20; step += 1) room.tick(1 / 60, camera);
      return wheel.rotation.y;
    })();
    // It winds rather than snapping, and lands on several full turns.
    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(2.5 * Math.PI * 2);
    for (let step = 0; step < 300; step += 1) room.tick(1 / 60, camera);
    expect(wheel.rotation.y).toBeCloseTo(2.5 * Math.PI * 2, 3);
    room.dispose();
  });

  it('runs water over Gauge C until the crank catches during the pump window', () => {
    const room = build();
    const initial = playerView(pumpRoom, pumpRoom.initialState, 1_000_000);
    const water = room.props.get('gauge_c')!.object.getObjectByName('gauge_c:water')!;
    const lockPin = room.props
      .get('discharge_valve')!
      .object.getObjectByName('discharge_valve:lock-pin')!;

    room.applyView(initial);
    expect(water.visible).toBe(false);
    expect(lockPin.visible).toBe(true);
    expect(water.userData.obscured).toBe(false);
    expect(displayValue(room.props.get('gauge_c')!.object)).toBeNull();

    const powered = {
      ...pumpRoom.initialState,
      switches: [true, true, true, true, true, true],
      powerOn: true,
      gaugeWashStarted: true
    };
    room.applyView(playerView(pumpRoom, powered, 1_000_000));
    expect(water.visible).toBe(true);
    expect(water.userData.obscured).toBe(true);
    expect(water.getObjectByName('gauge_c:water-hole')).toBeDefined();
    expect(water.getObjectByName('gauge_c:water-jet')).toBeDefined();
    expect(water.getObjectByName('gauge_c:splash')).toBeDefined();
    room.scene.updateMatrixWorld(true);
    const waterBounds = new THREE.Box3().setFromObject(water);
    expect(waterBounds.max.y).toBeGreaterThan(1.35);
    expect(waterBounds.min.y).toBeGreaterThanOrEqual(-0.02);
    expect(waterBounds.min.y).toBeLessThan(0.12);
    const droplet = water.getObjectByName('gauge_c:droplet-0')!;
    const beforeDrop = droplet.position.clone();
    room.tick(0.1, new THREE.PerspectiveCamera());
    expect(droplet.position.distanceTo(beforeDrop)).toBeGreaterThan(0.01);
    room.applyView(
      playerView(
        pumpRoom,
        { ...powered, switches: [false, true, true, true, true, true], powerOn: false },
        1_000_000
      )
    );
    expect(water.visible).toBe(true);
    const running = applyAction(pumpRoom, powered, { type: 'start_pump' }, 1_000_000).state;
    room.applyView(playerView(pumpRoom, running, 1_000_001));
    expect(lockPin.visible).toBe(false);
    const timedOut = applyAction(
      pumpRoom,
      running,
      { type: 'pump_timeout', deadline: running.pumpWindowUntil! },
      running.pumpWindowUntil!
    ).state;
    room.applyView(playerView(pumpRoom, timedOut, running.pumpWindowUntil!));
    expect(lockPin.visible).toBe(true);
    const revealed = applyAction(pumpRoom, running, { type: 'set_valve', open: true }, 1_005_000).state;
    room.applyView(playerView(pumpRoom, revealed, 1_005_000));

    expect(water.visible).toBe(false);
    expect(lockPin.visible).toBe(false);
    expect(water.userData.obscured).toBe(false);
    expect(displayValue(room.props.get('gauge_c')!.object)).toBe('9');
    expect(playerView(pumpRoom, revealed, 1_005_000).objects.find((object) => object.id === 'pump')?.gauge).toBe(48);
    expect(displayValue(room.props.get('discharge_gauge')!.object)).toBeNull();
    room.dispose();
  });

  it('shrinks the puddle as the sump comes down', () => {
    const room = build();
    const pool = room.props.get('floor_pool')!.object.getObjectByName('floor_pool:pool')!;

    room.applyView({ ...viewA, sumpMm: SUMP_START_MM });
    const flooded = pool.scale.x;
    room.applyView({ ...viewA, sumpMm: SUMP_START_MM / 2 });
    const half = pool.scale.x;
    room.applyView({ ...viewA, sumpMm: 0, pumpRunning: true });
    const dry = pool.scale.x;

    expect(half).toBeLessThan(flooded);
    expect(dry).toBeLessThan(half);
    expect(Number.isFinite(dry)).toBe(true);
    room.dispose();
  });

  it('puts the valve and the discharge gauge within reach of the pump node', () => {
    const room = build();
    const node = room.nodes.get('pump')!;
    const camera = new THREE.PerspectiveCamera(55, 1.6, 0.01, 50);
    camera.position.set(...node.position);
    camera.lookAt(new THREE.Vector3(...node.lookAt!));
    camera.updateMatrixWorld(true);

    for (const id of ['discharge_valve', 'discharge_gauge']) {
      const instance = room.props.get(id)!;
      instance.object.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(instance.object);
      const distance = box.getCenter(new THREE.Vector3()).distanceTo(camera.position);
      // Close enough that a step or two brings it inside the 1.45 m click gate.
      expect(distance).toBeLessThan(2.2);
    }
    room.dispose();
  });
});

describe('pipe fittings and instruments', () => {
  it('keeps flange couplings clear of the gauges and stencils they share a pipe with', () => {
    const room = buildRoom(pumpRoomVisual, themes.industrial, {
      objectIds: pumpRoom.objects.map((object) => object.id)
    });
    room.scene.updateMatrixWorld(true);

    const boxOf = (id: string): THREE.Box3 =>
      new THREE.Box3().setFromObject(room.props.get(id)!.object);

    for (const [pipeId, gaugeId, stencilId] of [
      ['pipe_a', 'gauge_a', 'stencil_a'],
      ['pipe_b', 'gauge_b', 'stencil_b'],
      ['pipe_c', 'gauge_c', 'stencil_c'],
      ['pipe_d', 'gauge_d', 'stencil_d']
    ]) {
      const gauge = new THREE.Box3().setFromObject(
        room.props.get(gaugeId)!.object.getObjectByName(`${gaugeId}:bezel`)!
      );
      const stencil = boxOf(stencilId);
      // Flange discs are wider than the pipe, so anything at their height cuts
      // across the face of an instrument. Check the fittings by their y span.
      const fittings: THREE.Box3[] = [];
      room.props.get(pipeId)!.object.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object.geometry.type !== 'CylinderGeometry') return;
        const box = new THREE.Box3().setFromObject(object);
        // The pipe barrel itself spans the whole run; fittings are short.
        if (box.max.y - box.min.y > 0.5) return;
        fittings.push(box);
      });
      expect(fittings.length).toBeGreaterThan(0);

      for (const fitting of fittings) {
        const wide = fitting.max.x - fitting.min.x > 0.16;
        if (!wide) continue;
        expect(fitting.intersectsBox(gauge)).toBe(false);
        expect(fitting.intersectsBox(stencil)).toBe(false);
      }
    }
    room.dispose();
  });
});
