export type Vec3 = [number, number, number];
export type Hex = string;

export type Transform = {
  position: Vec3;
  rotation?: Vec3;
  scale?: Vec3 | number;
};

export type PaletteRole =
  | 'background'
  | 'floor'
  | 'wall'
  | 'ceiling'
  | 'structure'
  | 'metal'
  | 'metalDark'
  | 'accent'
  | 'warning'
  | 'ink';

export type Palette = Record<PaletteRole, Hex>;

export type Fog = {
  color: Hex;
  visibilityM: number;
  mode: 'exp2' | 'linear';
};

export type LightRig = {
  ambient: { color: Hex; intensity: number };
  hemisphere?: { sky: Hex; ground: Hex; intensity: number };
  directional?: { color: Hex; intensity: number; direction: Vec3 }[];
  points?: { color: Hex; intensity: number; position: Vec3; reachM: number }[];
};

export type OccluderSpec =
  | {
      kind: 'lightCone';
      angleDeg: number;
      penumbra: number;
      intensity: number;
      reachM: number;
      color: Hex;
      ambientFloor: number;
    }
  | { kind: 'whiteout'; driftMps: number; particleCount: number; color: Hex; gustHz: number }
  | { kind: 'visor'; fovDeg: number; vignetteInner: number; vignetteOuter: number; glare: number }
  | { kind: 'turbidity'; causticsHz: number; swayM: number; color: Hex };

export type OutlineSpec = {
  thicknessPx: number;
  depthSensitivity: number;
  normalSensitivity: number;
};

export type Theme = {
  id: string;
  palette: Palette;
  fog: Fog;
  lightRig: LightRig;
  occluder: OccluderSpec;
  outline: OutlineSpec;
  surface: { shading: 'flat' | 'smooth'; roughness: number; metalness: number };
  grade: {
    vignette: number;
    grain: number;
    exposure: number;
    saturation?: number;
    contrast?: number;
  };
};

export type NavNode = {
  id: string;
  label: string;
  position: Vec3;
  lookAt?: Vec3;
};

export type InspectPose = {
  anchor?: Vec3;
  normal?: Vec3;
  distanceM?: number;
  fovDeg?: number;
};

export type PropSpec = {
  id: string;
  type: string;
  transform: Transform;
  parent?: string;
  nodes?: string[];
  objectId?: string;
  interactive?: boolean;
  /**
   * Client-side surface this prop opens when clicked, instead of (or as well
   * as) sending an action to the server.
   */
  opens?: 'terminal';
  inspect?: InspectPose;
  materials?: Record<string, PaletteRole>;
  params?: Record<string, number | string | boolean>;
};

export type RoomVisual = {
  version: 1;
  bounds: { size: Vec3 };
  eyeHeightM: number;
  themeId: string;
  startNodeId: string;
  nodes: NavNode[];
  props: PropSpec[];
};
