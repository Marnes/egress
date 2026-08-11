import * as THREE from 'three';
import type { PlayerView } from '@egress/core';
import type { RoomHandle } from './buildRoom.js';

export type PropInteraction = {
  kind: 'prop';
  propId: string;
  objectId: string;
  actionId: string;
  input?: 'digits4';
  /** Set when clicking should open a client-side surface instead of acting. */
  opens?: 'terminal';
};
export type KeypadKeyInteraction = {
  kind: 'keypad-key';
  propId: string;
  objectId: string;
  actionId: string;
  digit: string;
  input: 'digits4';
  opens?: undefined;
};
export type BlockedPropInteraction = {
  kind: 'blocked-prop';
  propId: string;
  objectId: string;
  detail: string;
  opens?: undefined;
};

export type NavInteraction = { kind: 'nav'; nodeId: string };
export type InteractionTarget = PropInteraction | KeypadKeyInteraction | BlockedPropInteraction | NavInteraction;

type TargetMetadata =
  | { kind: 'prop'; propId: string; objectId?: string; opens?: 'terminal' }
  | { kind: 'keypad-key'; propId: string; objectId?: string; digit: string }
  | { kind: 'nav'; nodeId: string };

export class InteractionRaycaster {
  readonly raycaster = new THREE.Raycaster();
  private view?: PlayerView;

  constructor(
    private readonly room: Pick<RoomHandle, 'activeHitboxes'>,
    private readonly options: { maxPropDistanceM?: number; maxOpenDistanceM?: number } = {}
  ) {}

  setView(view: PlayerView | undefined): void {
    this.view = view;
  }

  pick(camera: THREE.Camera, ndc: THREE.Vector2): InteractionTarget | null {
    this.raycaster.setFromCamera(ndc, camera);
    const hitboxes = this.room.activeHitboxes();
    const allowed = new Set(
      hitboxes.flatMap((hitbox) => {
        const metadata = findMetadata(hitbox);
        return metadata ? [targetKey(metadata)] : [];
      })
    );
    const intersections = this.raycaster.intersectObjects(hitboxes, true);
    const visited = new Set<string>();
    for (const intersection of intersections) {
      const metadata = findMetadata(intersection.object);
      if (!metadata) continue;
      if (!allowed.has(targetKey(metadata))) continue;
      if (metadata.kind === 'nav') return metadata;
      // Props that open a client surface are room-scale affordances, so they
      // answer from further off than something you have to reach out and touch.
      const reach = metadata.kind === 'prop' && metadata.opens
        ? (this.options.maxOpenDistanceM ?? 3.5)
        : (this.options.maxPropDistanceM ?? Number.POSITIVE_INFINITY);
      if (intersection.distance > reach) return null;
      if (visited.has(metadata.propId)) continue;
      visited.add(metadata.propId);
      if (!metadata.objectId || !this.view) return null;
      const object = this.view.objects.find((candidate) => candidate.id === metadata.objectId);
      const enabledActions = object?.actions.filter((candidate) => candidate.enabled) ?? [];
      if (metadata.kind === 'keypad-key') {
        const action = enabledActions.find((candidate) => candidate.input === 'digits4');
        if (!action) return null;
        return {
          kind: 'keypad-key',
          propId: metadata.propId,
          objectId: metadata.objectId,
          actionId: action.id,
          digit: metadata.digit,
          input: 'digits4'
        };
      }
      const action =
        enabledActions.find((candidate) => candidate.input !== undefined) ??
        enabledActions.find((candidate) => candidate.id === 'inspect') ??
        enabledActions[0];
      if (!action) {
        const blockedAction = object?.actions.find(
          (candidate) => !candidate.enabled && candidate.disabledLabel !== undefined
        );
        return blockedAction
          ? {
              kind: 'blocked-prop',
              propId: metadata.propId,
              objectId: metadata.objectId,
              detail: blockedAction.disabledLabel!
            }
          : null;
      }
      return {
        kind: 'prop',
        propId: metadata.propId,
        objectId: metadata.objectId,
        actionId: action.id,
        input: action.input,
        opens: metadata.opens
      };
    }
    return null;
  }

  hover(camera: THREE.Camera, ndc: THREE.Vector2): InteractionTarget | null {
    return this.pick(camera, ndc);
  }

  click(camera: THREE.Camera, ndc: THREE.Vector2): InteractionTarget | null {
    return this.pick(camera, ndc);
  }
}

function targetKey(metadata: TargetMetadata): string {
  if (metadata.kind === 'nav') return `nav:${metadata.nodeId}`;
  return metadata.kind === 'keypad-key'
    ? `keypad-key:${metadata.propId}:${metadata.digit}`
    : `prop:${metadata.propId}`;
}

export function pointerNdc(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  target = new THREE.Vector2()
): THREE.Vector2 {
  target.set(
    ((clientX - bounds.left) / bounds.width) * 2 - 1,
    -((clientY - bounds.top) / bounds.height) * 2 + 1
  );
  return target;
}

function findMetadata(object: THREE.Object3D): TargetMetadata | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    const metadata = current.userData.egressTarget as TargetMetadata | undefined;
    if (metadata) return metadata;
    current = current.parent;
  }
  return undefined;
}
