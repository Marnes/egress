import type { ActionOutcome, PlayerAction, RoomEvent, RoomSpec, RoomState } from './types.js';

export const KEYPAD_CODE = '7319';
export const PUMP_CRANK_WINDOW_MS = 30_000;

/** Standing water in the sump when the room starts, in mm. */
export const SUMP_START_MM = 240;
/** Low-water threshold used for an intermediate visual update while draining. */
export const SUMP_DRY_MM = 40;
export const SUMP_DRAIN_MM_PER_SECOND = 26;

/**
 * Discharge pressure. A centrifugal pump pushing against a shut valve runs at
 * shutoff head — high reading, no flow — which is the tell that the valve is
 * closed. Against an open one it settles at its duty point.
 */
export const PUMP_DUTY_PSI = 48;
export const PUMP_SHUTOFF_PSI = 74;

/** Water level now, derived from when pumping began rather than accumulated. */
export function sumpLevelMm(state: RoomState, now: number): number {
  if (state.pumpingSince === null) return state.sumpMm;
  const seconds = Math.max(0, (now - state.pumpingSince) / 1000);
  return Math.max(0, state.sumpMm - seconds * SUMP_DRAIN_MM_PER_SECOND);
}

export function sumpIsClear(state: RoomState, now: number): boolean {
  return sumpLevelMm(state, now) <= SUMP_DRY_MM;
}

/** What the discharge gauge shows, or null when the needle is dead. */
export function pumpDischargePsi(state: RoomState): number | null {
  if (!state.pumpRunning) return null;
  return state.valveOpen ? PUMP_DUTY_PSI : PUMP_SHUTOFF_PSI;
}

export function pumpCrankWindowOpen(state: RoomState, now: number): boolean {
  return (
    !state.valveOpen &&
    state.pumpRunning &&
    state.pumpWindowUntil !== null &&
    now < state.pumpWindowUntil
  );
}

/**
 * Bank the level reached so far and restate whether water is moving. Call it
 * after anything that changes the pump or the valve.
 */
function retime(state: RoomState, now: number): RoomState {
  const level = sumpLevelMm(state, now);
  const moving = state.pumpRunning && state.valveOpen && level > 0;
  return { ...state, sumpMm: level, pumpingSince: moving ? now : null };
}

function room(text: string): RoomEvent {
  return { kind: 'room', text };
}

function findObject(spec: RoomSpec, objectId: string) {
  return spec.objects.find((o) => o.id === objectId);
}

export function applyAction(
  spec: RoomSpec,
  state: RoomState,
  action: PlayerAction,
  now: number
): { state: RoomState; events: RoomEvent[]; outcome?: ActionOutcome } {
  switch (action.type) {
    case 'turn_on_lights': {
      if (state.lightsOn) return { state, events: [] };
      return {
        state: { ...state, lightsOn: true },
        events: [room('The ceiling lights flicker on.')]
      };
    }

    case 'open_panel': {
      if (!state.panelLocked) {
        return { state, events: [] };
      }
      return {
        state: { ...state, panelLocked: false },
        events: [room('The panel door swings open.')]
      };
    }

    case 'flip': {
      if (state.panelLocked) {
        return { state, events: [room('The panel is locked shut.')] };
      }
      if (action.index < 0 || action.index >= state.switches.length) {
        return { state, events: [] };
      }
      const switches = state.switches.slice();
      switches[action.index] = !switches[action.index];
      const powerOn = switches.every(Boolean);
      const events: RoomEvent[] = [];
      if (powerOn && !state.powerOn) {
        events.push(
          room('The panel instruments hum to life. Over by the return line, an old wash pipe coughs and starts running.')
        );
      } else if (!powerOn && state.powerOn) {
        events.push(room('The panel instruments go dark.'));
      }
      let next = { ...state, switches, powerOn, gaugeWashStarted: state.gaugeWashStarted || powerOn };
      if (!powerOn && state.powerOn && state.pumpRunning) {
        next = retime({ ...next, pumpRunning: false, pumpWindowUntil: null }, now);
        events.push(room('The contactor drops out. On the riser, a steel pin snaps home.'));
      }
      return { state: next, events };
    }

    case 'start_pump': {
      if (!state.powerOn) {
        return { state, events: [room('Something clicks in the panel, but nothing turns over.')] };
      }
      if (state.valveOpen || pumpCrankWindowOpen(state, now)) return { state, events: [] };
      const next = {
        ...state,
        pumpRunning: true,
        pumpWindowUntil: now + PUMP_CRANK_WINDOW_MS,
        pumpingSince: null
      };
      return {
        state: next,
        events: [
          room(
            'The pump catches with a heavy thud. Above the handwheel, an old locking pin chatters loose.'
          )
        ]
      };
    }

    case 'set_valve': {
      if (!action.open || state.valveOpen) return { state, events: [] };
      if (!pumpCrankWindowOpen(state, now)) {
        if (state.pumpWindowUntil !== null && now >= state.pumpWindowUntil) {
          return applyAction(spec, state, { type: 'pump_timeout', deadline: state.pumpWindowUntil }, now);
        }
        return { state, events: [] };
      }
      const next = retime({ ...state, valveOpen: true, pumpWindowUntil: null }, now);
      return {
        state: next,
        events: [
          room(
            'The handwheel fights, then gives. The sheet over Pipe C gutters away, leaving the gauge glass clear.'
          )
        ]
      };
    }

    case 'pump_timeout': {
      if (state.valveOpen || state.pumpWindowUntil !== action.deadline) return { state, events: [] };
      const next = retime({ ...state, pumpRunning: false, pumpWindowUntil: null, valveOpen: false }, now);
      return {
        state: next,
        events: [room('The motor winds down. The handwheel kicks against its stop and the locking pin drops home.')]
      };
    }

    case 'pump_complete': {
      if (state.pumpingSince !== action.pumpingSince || sumpLevelMm(state, now) > 0) {
        return { state, events: [] };
      }
      return {
        state: { ...state, sumpMm: 0, pumpingSince: null, pumpRunning: false, pumpWindowUntil: null },
        events: [room('The gully takes one last gulp. The pump coasts into silence.')]
      };
    }

    case 'enter_code': {
      if (!state.powerOn) {
        return {
          state,
          events: [room('The keypad is dark and unresponsive.')],
          outcome: { kind: 'keypad', status: 'unpowered' }
        };
      }
      if (action.digits === KEYPAD_CODE) {
        return {
          state: { ...state, doorOpen: true },
          events: [room('The door unlocks with a heavy clunk.'), { kind: 'complete' }],
          outcome: { kind: 'keypad', status: 'correct' }
        };
      }
      return {
        state,
        events: [room('The keypad flashes red, then resets.')],
        outcome: { kind: 'keypad', status: 'wrong' }
      };
    }

    case 'inspect': {
      const obj = findObject(spec, action.objectId);
      if (!obj) {
        return { state, events: [] };
      }
      if (obj.reading) {
        const value = obj.reading(state, now);
        const text = value === null ? 'The needle sits dead on its stop.' : `${obj.label} reads ${value}.`;
        return { state, events: [room(text)] };
      }
      if (obj.gauge !== undefined) {
        const obstruction = obj.gaugeObscured?.(state, now) ?? null;
        const text = obstruction ?? (state.powerOn ? `Gauge ${obj.stencil ?? obj.label} reads ${obj.gauge}.` : 'The gauge face is dark.');
        return { state, events: [room(text)] };
      }
      if (obj.inspect) {
        return { state, events: [room(obj.inspect(state, now))] };
      }
      return { state, events: [room('You see nothing unusual.')] };
    }
  }
}
