import type * as THREE from 'three';
import type { KeypadStatus, PlayerView } from '@egress/core';
import type { LegibilityKit } from '../textures/legibility.js';
import type { ResolvedInspectPose, RoomVisual, PropSpec } from '../types.js';
import type { ThemeRuntime } from '../theme.js';
import { shell } from './shell.js';
import { barrel } from './barrel.js';
import { box } from './box.js';
import { cylinder } from './cylinder.js';
import { panelBox } from './panelBox.js';
import { breakerSwitch } from './breakerSwitch.js';
import { gaugeDial } from './gaugeDial.js';
import { stencilBand } from './stencilBand.js';
import { keypad } from './keypad.js';
import { door } from './door.js';
import { speakerGrille } from './speakerGrille.js';
import { computerTerminal } from './computerTerminal.js';
import { hangingLamp } from './hangingLamp.js';
import { poweredCeilingLight } from './poweredCeilingLight.js';
import { pump } from './pump.js';
import { puddle } from './puddle.js';
import { valveWheel } from './valveWheel.js';
import { vermin } from './vermin.js';
import { workOrderPlan } from './workOrderPlan.js';

export type PropMessage = { from: 'player' | 'agent'; text: string };
export type KeypadAttempt = { id: number; digits: string };
export type KeypadController = {
  press(digit: string): KeypadAttempt | undefined;
  resolve(id: number, status: KeypadStatus): void;
  reject(id: number): void;
};

export type PropContext = {
  spec: PropSpec;
  theme: ThemeRuntime;
  legible?: LegibilityKit;
  bounds: RoomVisual['bounds'];
};

export type PropInstance = {
  object: THREE.Object3D;
  hitboxes: THREE.Object3D[];
  update?(view: PlayerView): void;
  updateMessages?(messages: readonly PropMessage[]): void;
  updateLink?(connected: boolean): void;
  tick?(dtSeconds: number): void;
  keypad?: KeypadController;
  dispose(): void;
  spec?: PropSpec;
  inspectPose?: ResolvedInspectPose;
};

export type PropFactory = (ctx: PropContext) => PropInstance;

export const propRegistry: Readonly<Record<string, PropFactory>> = Object.freeze({
  shell,
  box,
  barrel,
  cylinder,
  panelBox,
  breakerSwitch,
  gaugeDial,
  stencilBand,
  keypad,
  door,
  speakerGrille,
  computerTerminal,
  poweredCeilingLight,
  hangingLamp,
  pump,
  puddle,
  valveWheel,
  vermin,
  workOrderPlan
});

export const propTypes = Object.freeze(Object.keys(propRegistry));
