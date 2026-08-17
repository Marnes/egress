import * as THREE from 'three';
import {
  createSurfaceKit,
  type Decal,
  type DecalKind,
  type Surface,
  type SurfaceKind,
  type SurfaceKit
} from './textures/surfaces.js';
import type { PaletteRole, RoomVisual, Theme } from './types.js';

/** Roles that get a baked surface unless a prop asks for something else. */
const DEFAULT_SURFACE: Partial<Record<PaletteRole, SurfaceKind>> = {
  floor: 'concreteFloor',
  wall: 'brick',
  ceiling: 'concreteCeiling',
  structure: 'concreteWall',
  metal: 'rustedSteel',
  metalDark: 'darkMetal'
};

export type ThemeRuntime = {
  readonly spec: Theme;
  readonly palette: Theme['palette'];
  /** Shared material for a palette role, textured when a surface exists. */
  material(role: PaletteRole, kind?: SurfaceKind): THREE.MeshStandardMaterial;
  /** The baked surface behind that material, for callers that need its tile size. */
  surface(role: PaletteRole, kind?: SurfaceKind): Surface | undefined;
  /** Translucent weathering band, laid over a surface rather than tiled into it. */
  decal(kind: DecalKind): (Decal & { material: THREE.MeshStandardMaterial }) | undefined;
  dispose(): void;
};

export function createThemeRuntime(theme: Theme, surfaces?: SurfaceKit): ThemeRuntime {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const kit = surfaces ?? createSurfaceKit(theme.palette);
  const resolve = (role: PaletteRole, kind?: SurfaceKind): SurfaceKind | undefined =>
    kind ?? DEFAULT_SURFACE[role];

  return {
    spec: theme,
    palette: theme.palette,
    surface(role, kind) {
      const resolved = resolve(role, kind);
      return resolved ? kit.get(resolved) : undefined;
    },
    decal(kind) {
      const decal = kit.decal(kind);
      if (!decal) return undefined;
      const key = `decal|${kind}`;
      let material = materials.get(key);
      if (!material) {
        material = new THREE.MeshStandardMaterial({
          map: decal.map,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
          // Standing water is the one that should catch a highlight. The
          // scene's environment is dialled right down, so the wet look has to
          // come from a broad specular rather than a mirror finish.
          roughness:
            kind === 'waterSheet' ? 0.08 : kind === 'puddle' ? 0.13 : kind === 'damp' ? 0.45 : 0.95,
          metalness: 0,
          envMapIntensity: kind === 'waterSheet' ? 3 : kind === 'puddle' ? 3 : 0.1
        });
        material.name = `theme:${theme.id}:decal:${kind}`;
        materials.set(key, material);
      }
      return { ...decal, material };
    },
    material(role, kind) {
      const resolved = resolve(role, kind);
      const key = `${role}|${resolved ?? 'flat'}`;
      let material = materials.get(key);
      if (material) return material;

      const metallic = role === 'metal' || role === 'metalDark';
      const architectural = role === 'floor' || role === 'wall' || role === 'ceiling';
      material = new THREE.MeshStandardMaterial({
        color: theme.palette[role],
        flatShading: false,
        roughness: metallic
          ? role === 'metal' ? 0.38 : 0.52
          : architectural ? 0.92 : Math.max(theme.surface.roughness, 0.68),
        metalness: metallic ? 0.72 : architectural ? 0.02 : theme.surface.metalness,
        envMapIntensity: metallic ? 0.55 : 0.12
      });
      material.name = `theme:${theme.id}:${role}`;

      const surface = resolved ? kit.get(resolved) : undefined;
      if (surface) {
        // The maps already carry the palette tint, so the base colour steps
        // aside and the roughness/metalness scalars become map multipliers.
        material.color.setRGB(1, 1, 1);
        material.map = surface.map;
        material.normalMap = surface.normalMap;
        material.normalScale = new THREE.Vector2(surface.normalScale, surface.normalScale);
        material.roughnessMap = surface.ormMap;
        material.metalnessMap = surface.ormMap;
        material.roughness = 1;
        material.metalness = 1;
        material.envMapIntensity = metallic ? 0.7 : 0.16;
        material.needsUpdate = true;
      }

      materials.set(key, material);
      return material;
    },
    dispose() {
      for (const material of materials.values()) material.dispose();
      materials.clear();
      if (!surfaces) kit.dispose();
    }
  };
}

export function applyThemeToScene(
  scene: THREE.Scene,
  theme: Theme,
  bounds: RoomVisual['bounds']
): THREE.Object3D[] {
  scene.background = new THREE.Color(theme.palette.background);
  const visibility = Math.max(theme.fog.visibilityM, 0.001);
  scene.fog =
    theme.fog.mode === 'exp2'
      ? new THREE.FogExp2(theme.fog.color, 3 / visibility)
      : new THREE.Fog(theme.fog.color, visibility * 0.05, visibility);

  const lights: THREE.Object3D[] = [];
  const rig = theme.lightRig;
  lights.push(new THREE.AmbientLight(rig.ambient.color, rig.ambient.intensity));

  if (rig.hemisphere) {
    lights.push(
      new THREE.HemisphereLight(
        rig.hemisphere.sky,
        rig.hemisphere.ground,
        rig.hemisphere.intensity
      )
    );
  }

  const extent = Math.max(...bounds.size);
  for (const spec of rig.directional ?? []) {
    const direction = new THREE.Vector3(...spec.direction).normalize();
    const light = new THREE.DirectionalLight(spec.color, spec.intensity);
    light.position.copy(direction.multiplyScalar(-extent));
    light.target.position.set(0, bounds.size[1] * 0.5, 0);
    lights.push(light, light.target);
  }

  for (const spec of rig.points ?? []) {
    const light = new THREE.PointLight(spec.color, spec.intensity, spec.reachM, 2);
    light.position.set(...spec.position);
    lights.push(light);
  }

  scene.add(...lights);
  return lights;
}
