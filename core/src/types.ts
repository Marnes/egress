import type { RecordStore } from './records.js';
import type { AgentSafeText } from './safeText.js';
import type { RoomVisual } from './visual/types.js';

export type ActionInputKind = 'digits4';

export type ChoiceOption = { id: string; label: string };
export type ChoicePrompt = {
  id: string;
  options: ChoiceOption[];
  selectedOptionId: string | null;
};
export type IntercomLine = {
  from: 'player' | 'agent';
  text: string;
  choice?: ChoicePrompt;
};

/**
 * A JSON-serializable template for the action a button produces. `inspect`
 * has its `objectId` filled in by the server from the owning object;
 * `enter_code` has its `digits` filled in from the player's keypad input.
 */
export type ActionTemplate =
  | { type: 'flip'; index: number }
  | { type: 'open_panel' }
  | { type: 'enter_code' }
  | { type: 'set_valve'; open: boolean }
  | { type: 'inspect' };

export type ActionDef = {
  id: string;
  label: string;
  /** whether this action is currently available; defaults to always available */
  needs?: (state: RoomState, now: number) => boolean;
  /** Hint shown when this is an object's only action and is currently unavailable. */
  disabledLabel?: string;
  input?: ActionInputKind;
  action: ActionTemplate;
};

export type RoomObject = {
  id: string;
  label: string;
  /** wall-stencilled letter shown to the player, e.g. "A" — display only */
  stencil?: string;
  /** static gauge reading; only visible to the player once the room has power */
  gauge?: number;
  /** live reading, for gauges whose value depends on what the room is doing */
  reading?: (state: RoomState, now: number) => number | null;
  /** Diegetic obstruction over a static gauge; null means its face is clear. */
  gaugeObscured?: (state: RoomState, now: number) => string | null;
  /** flavor text for `inspect`, when not a gauge; pure function of state and time */
  inspect?: (state: RoomState, now: number) => string;
  actions: ActionDef[];
};

export type RoomState = {
  lightsOn: boolean;
  panelLocked: boolean;
  switches: boolean[];
  powerOn: boolean;
  /** One-way latch: the gauge-wash line starts with first full-board energisation. */
  gaugeWashStarted: boolean;
  doorOpen: boolean;
  /** Local gauge-wash bypass: latched once the player's crank turn succeeds. */
  valveOpen: boolean;
  /** Contactor closed. The pump can be running and still move nothing. */
  pumpRunning: boolean;
  /** Absolute expiry of the pump auxiliary-relay window, or null outside an attempt. */
  pumpWindowUntil: number | null;
  /** Sump depth as of `pumpingSince`, in mm. Read it with `sumpLevelMm`. */
  sumpMm: number;
  /** When water actually started moving, or null when it is not. */
  pumpingSince: number | null;
};

export type PlayerAction =
  | { type: 'flip'; index: number }
  | { type: 'open_panel' }
  | { type: 'turn_on_lights' }
  | { type: 'start_pump' }
  | { type: 'pump_timeout'; deadline: number }
  | { type: 'pump_complete'; pumpingSince: number }
  | { type: 'set_valve'; open: boolean }
  | { type: 'enter_code'; digits: string }
  | { type: 'inspect'; objectId: string };

export type KeypadStatus = 'correct' | 'wrong' | 'unpowered';
export type ActionOutcome = { kind: 'keypad'; status: KeypadStatus };

export type RoomEvent = { kind: 'room'; text: string } | { kind: 'complete' };

export type RoomSpec = {
  id: string;
  name: AgentSafeText;
  agentRole: AgentSafeText;
  agentPersona: AgentSafeText;
  objects: RoomObject[];
  records: RecordStore;
  initialState: RoomState;
  visual: RoomVisual;
  isComplete(state: RoomState): boolean;
};

export type PlayerViewObject = {
  id: string;
  label: string;
  stencil?: string;
  /** the gauge reading, or null when the object has no gauge or it is unreadable right now */
  gauge: number | null;
  gaugeObscured?: boolean;
  actions: { id: string; label: string; enabled: boolean; disabledLabel?: string; input?: ActionInputKind }[];
};

export type PlayerView = {
  roomId: string;
  roomName: string;
  objects: PlayerViewObject[];
  switches: boolean[];
  lightsOn: boolean;
  powerOn: boolean;
  panelLocked: boolean;
  doorOpen: boolean;
  /** Bypass crank position, so the room can show whether it caught. */
  valveOpen: boolean;
  pumpRunning: boolean;
  /** Standing water right now, in mm, used by the room puddle. */
  sumpMm: number;
  complete: boolean;
};
