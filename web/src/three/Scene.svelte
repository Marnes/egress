<script lang="ts">
  import type { KeypadStatus, PlayerView, RoomVisual, Theme } from '@egress/core';
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import * as THREE from 'three';
  import type { InputMode } from '../ui/input';
  import {
    buildRoom,
    configureCameraForRoom,
    createCameraController,
    createLegibilityKit,
    createRenderer,
    InteractionRaycaster,
    pointerNdc,
    type CameraController,
    type RendererHandle,
    type RoomHandle
  } from './index';

  export type SceneControls = { focus(): void; escape(): boolean };

  let {
    visual,
    theme,
    view,
    messages,
    agentConnected,
    inputMode,
    onaction,
    onkeypad,
    onterminal,
    onready,
    onerror
  }: {
    visual: RoomVisual;
    theme: Theme;
    view: PlayerView;
    messages: { from: 'player' | 'agent'; text: string }[];
    agentConnected: boolean;
    inputMode: InputMode;
    onaction(objectId: string, actionId: string): void | Promise<void>;
    onkeypad(objectId: string, actionId: string, digits: string): Promise<KeypadStatus>;
    onterminal(): void;
    onready?(controls: SceneControls): void;
    onerror?(message: string): void;
  } = $props();

  let canvas: HTMLCanvasElement;
  // The view effects run before onMount; making the handle reactive reruns them once the room exists.
  let room = $state.raw<RoomHandle | undefined>();
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined;
  let cameraController: CameraController | undefined;
  let interaction: InteractionRaycaster | undefined;
  let renderer: RendererHandle | undefined;
  let hover = $state<{ label: string; detail: string; x: number; y: number }>();
  let drag:
    | { pointerId: number; lastX: number; lastY: number; distance: number }
    | undefined;
  let suppressClick = false;
  const heldKeys = new SvelteSet<string>();

  $effect(() => {
    room?.applyView(view);
    room?.applyMessages(messages);
    interaction?.setView(view);
  });
  $effect(() => room?.applyLink(agentConnected));
  $effect(() => {
    if (inputMode !== 'world') heldKeys.clear();
  });

  onMount(() => {
    let frame = 0;
    let observer: ResizeObserver | undefined;
    try {
      const legibility = createLegibilityKit();
      room = buildRoom(visual, theme, {
        legibility,
        objectIds: view.objects.map((object) => object.id),
        navDiscs: false,
        wallTargets: false,
        allPropHitboxes: true
      });
      room.applyView(view);
      room.applyMessages(messages);
      room.applyLink(agentConnected);

      camera = new THREE.PerspectiveCamera(48, 1, 0.01, 50);
      configureCameraForRoom(camera, visual.bounds);
      cameraController = createCameraController(camera, room);
      cameraController.snapToNode(room.activeNodeId);
      interaction = new InteractionRaycaster(room, { maxPropDistanceM: 1.45 });
      interaction.setView(view);
      renderer = createRenderer({
        canvas,
        scene: room.scene,
        camera,
        theme,
        bounds: visual.bounds,
        occluder: room.occluder
      });

      const resize = (): void => {
        const rect = canvas.getBoundingClientRect();
        renderer?.resize(rect.width, rect.height);
      };
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
      resize();

      onready?.({
        focus: () => canvas.focus(),
        escape: () => cameraController?.escape() ?? false
      });

      let previous = performance.now();
      const animate = (now: number): void => {
        const dt = (now - previous) / 1000;
        previous = now;
        cameraController?.tick(Math.min(dt, 0.1));
        moveCamera(Math.min(dt, 0.1));
        room?.tick(dt, camera!);
        renderer?.render(dt);
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    } catch (cause) {
      onerror?.(cause instanceof Error ? cause.message : 'Unable to create the 3D room.');
    }

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      renderer?.dispose();
      room?.dispose();
      renderer = undefined;
      interaction = undefined;
      cameraController = undefined;
      room = undefined;
      camera = undefined;
    };
  });

  function targetAt(event: PointerEvent | MouseEvent) {
    if (!interaction || !camera) return null;
    const ndc = pointerNdc(event.clientX, event.clientY, canvas.getBoundingClientRect());
    return interaction.pick(camera, ndc);
  }

  /** Before the link is up, the terminal is the only live thing in the room. */
  function reachable(target: { kind: string; opens?: 'terminal' }): boolean {
    return agentConnected || target.opens === 'terminal';
  }

  function pointerMove(event: PointerEvent): void {
    if (inputMode !== 'world') {
      canvas.style.cursor = 'default';
      hover = undefined;
      return;
    }
    if (drag?.pointerId === event.pointerId && camera && cameraController?.state.mode === 'node') {
      const deltaX = event.clientX - drag.lastX;
      const deltaY = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.distance += Math.abs(deltaX) + Math.abs(deltaY);
      const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      rotation.y -= deltaX * 0.003;
      rotation.x = THREE.MathUtils.clamp(rotation.x - deltaY * 0.003, -1.25, 1.25);
      camera.quaternion.setFromEuler(rotation);
      canvas.style.cursor = 'grabbing';
      hover = undefined;
      return;
    }
    const target = targetAt(event);
    canvas.style.cursor = target && reachable(target) ? 'pointer' : 'default';
    if (!target || !reachable(target)) {
      hover = undefined;
    } else if (target.kind === 'nav') {
      canvas.style.cursor = 'default';
      hover = undefined;
    } else {
      const object = view.objects.find((candidate) => candidate.id === target.objectId);
      const action = target.kind === 'blocked-prop'
        ? undefined
        : object?.actions.find((candidate) => candidate.id === target.actionId);
      hover = {
        label: object?.label ?? target.objectId,
        detail:
          target.kind === 'blocked-prop'
            ? target.detail
            : target.kind === 'keypad-key'
            ? `Press ${target.digit}`
            : target.opens === 'terminal'
              ? 'Open terminal'
              : (action?.label ?? 'Inspect'),
        x: event.clientX,
        y: event.clientY
      };
    }
  }

  function pointerDown(event: PointerEvent): void {
    canvas.focus();
    hover = undefined;
    if (inputMode !== 'world' || cameraController?.state.mode !== 'node') return;
    drag = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, distance: 0 };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  }

  function pointerUp(event: PointerEvent): void {
    if (drag?.pointerId !== event.pointerId) return;
    suppressClick = drag.distance > 4;
    drag = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    canvas.style.cursor = 'default';
  }

  function click(event: MouseEvent): void {
    canvas.focus();
    hover = undefined;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (inputMode !== 'world') return;
    const target = targetAt(event);
    if (!target) return;
    if (target.kind === 'nav' || target.kind === 'blocked-prop') return;
    if (!reachable(target)) return;
    if (target.opens === 'terminal') {
      onterminal();
      return;
    }
    if (target.kind === 'keypad-key') {
      const controller = room?.props.get(target.propId)?.keypad;
      if (controller) {
        const attempt = controller.press(target.digit);
        if (!attempt) return;
        void onkeypad(target.objectId, target.actionId, attempt.digits).then(
          (status) => controller.resolve(attempt.id, status),
          () => controller.reject(attempt.id)
        );
      }
      return;
    }
    const supportsZoomInput = view.objects
      .find((object) => object.id === target.objectId)
      ?.actions.some((action) => action.input === 'digits4');
    if (supportsZoomInput) {
      cameraController?.inspect(target.propId);
      return;
    }
    void onaction(target.objectId, target.actionId);
  }

  function keyboard(event: KeyboardEvent, down: boolean): void {
    const key = event.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'shift'].includes(key)) return;
    event.preventDefault();
    if (down) heldKeys.add(key);
    else heldKeys.delete(key);
  }

  function moveCamera(dtSeconds: number): void {
    if (!camera || cameraController?.state.mode !== 'node' || inputMode !== 'world') return;
    if (!agentConnected) return;
    const forwardAmount = Number(heldKeys.has('w')) - Number(heldKeys.has('s'));
    const rightAmount = Number(heldKeys.has('d')) - Number(heldKeys.has('a'));
    if (forwardAmount === 0 && rightAmount === 0) return;
    const forward = camera.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();
    const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const movement = forward.multiplyScalar(forwardAmount).addScaledVector(right, rightAmount);
    if (movement.lengthSq() > 1) movement.normalize();
    movement.multiplyScalar((heldKeys.has('shift') ? 2.8 : 1.6) * dtSeconds);
    const nextPosition = room?.moveWithCollisions(camera.position, movement);
    if (nextPosition) camera.position.copy(nextPosition);
    else camera.position.add(movement);
    const [width, , depth] = visual.bounds.size;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -width / 2 + 0.25, width / 2 - 0.25);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -depth / 2 + 0.25, depth / 2 - 0.25);
    camera.position.y = visual.eyeHeightM;
  }
</script>

<canvas
  bind:this={canvas}
  tabindex="0"
  aria-label="Room view. Use W A S D to move and drag to look around."
  onkeydown={(event) => keyboard(event, true)}
  onkeyup={(event) => keyboard(event, false)}
  onblur={() => heldKeys.clear()}
  onpointerdown={pointerDown}
  onpointermove={pointerMove}
  onpointerup={pointerUp}
  onpointercancel={pointerUp}
  onpointerleave={() => {
    if (!drag) canvas.style.cursor = 'default';
    hover = undefined;
  }}
  onclick={click}
></canvas>

{#if hover}
  <div class="hover-label" style={`left: ${hover.x}px; top: ${hover.y}px`}>
    <strong>{hover.label}</strong>
    <span>{hover.detail}</span>
  </div>
{/if}

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    outline: none;
    touch-action: none;
  }
  .hover-label {
    position: fixed;
    z-index: 10;
    display: grid;
    gap: 0.12rem;
    min-width: 8rem;
    transform: translate(-50%, calc(-100% - 0.8rem));
    border: 1px solid #c6a05e;
    padding: 0.42rem 0.55rem;
    color: #f1f3ed;
    background: rgb(7 10 11 / 92%);
    box-shadow: 0 0.5rem 1.5rem #0007;
    font-family: ui-monospace, monospace;
    pointer-events: none;
  }
  .hover-label strong { font-size: 0.76rem; letter-spacing: 0.05em; text-transform: uppercase; }
  .hover-label span { color: #b6c0b8; font-size: 0.64rem; }
</style>
