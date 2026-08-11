import * as THREE from 'three';
import type { PlayerView } from '@egress/core';
import type { PaletteRole } from '../types.js';
import type { GlyphPanel } from '../textures/legibility.js';
import type { SurfaceKind } from '../textures/surfaces.js';
import type { Tile } from '../textures/uv.js';
import type { PropContext, PropInstance, PropMessage } from './registry.js';

export function numberParam(ctx: PropContext, key: string, fallback: number): number {
  const value = ctx.spec.params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function stringParam(ctx: PropContext, key: string, fallback: string): string {
  const value = ctx.spec.params?.[key];
  return typeof value === 'string' ? value : fallback;
}

export function material(
  ctx: PropContext,
  slot: string,
  fallback: PaletteRole,
  kind?: SurfaceKind
): THREE.MeshStandardMaterial {
  return ctx.theme.material(ctx.spec.materials?.[slot] ?? fallback, kind);
}

/**
 * World size of the texture tile behind a material slot, or undefined when the
 * surface could not be baked. Feed it to the `tile*Uv` helpers.
 */
export function tileOf(
  ctx: PropContext,
  slot: string,
  fallback: PaletteRole,
  kind?: SurfaceKind
): Tile {
  return ctx.theme.surface(ctx.spec.materials?.[slot] ?? fallback, kind)?.tileM;
}

export function viewObject(view: PlayerView, objectId: string | undefined) {
  return objectId === undefined ? undefined : view.objects.find((object) => object.id === objectId);
}

export function createInstance(
  object: THREE.Object3D,
  hitboxes: THREE.Object3D[],
  options: {
    update?: (view: PlayerView) => void;
    tick?: (dtSeconds: number) => void;
    updateMessages?: (messages: readonly PropMessage[]) => void;
    updateLink?: (connected: boolean) => void;
    panels?: GlyphPanel[];
  } = {}
): PropInstance {
  return {
    object,
    hitboxes,
    update: options.update,
    tick: options.tick,
    updateMessages: options.updateMessages,
    updateLink: options.updateLink,
    dispose() {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      for (const panel of options.panels ?? []) panel.dispose();
    }
  };
}

export function panelMaterial(ctx: PropContext, panel: GlyphPanel | undefined): THREE.Material {
  return panel?.material ?? material(ctx, 'face', 'ink');
}
