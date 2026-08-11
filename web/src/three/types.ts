import type { OccluderSpec } from '@egress/core';

export type {
  Fog,
  Hex,
  InspectPose,
  Issue,
  LightRig,
  NavNode,
  OccluderSpec,
  OutlineSpec,
  Palette,
  PaletteRole,
  PropSpec,
  RoomVisual,
  Theme,
  Transform,
  Vec3
} from '@egress/core';

export type FogSpec = import('@egress/core').Fog;
export type LightConeSpec = Extract<OccluderSpec, { kind: 'lightCone' }>;
export type WhiteoutSpec = Extract<OccluderSpec, { kind: 'whiteout' }>;
export type VisorSpec = Extract<OccluderSpec, { kind: 'visor' }>;
export type TurbiditySpec = Extract<OccluderSpec, { kind: 'turbidity' }>;

export type ResolvedInspectPose = {
  anchor: import('@egress/core').Vec3;
  normal: import('@egress/core').Vec3;
  distanceM: number;
  fovDeg: number;
};
