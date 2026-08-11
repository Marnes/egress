import { describe, expect, it } from 'vitest';
import {
  applyAction,
  PUMP_CRANK_WINDOW_MS,
  PUMP_DUTY_PSI,
  PUMP_SHUTOFF_PSI,
  pumpDischargePsi,
  SUMP_DRY_MM,
  SUMP_START_MM,
  sumpIsClear,
  sumpLevelMm
} from '../src/room.js';
import { playerView } from '../src/view.js';
import { pumpRoom } from '../src/rooms/pumpRoom.js';
import type { RoomState } from '../src/types.js';

const NOW = 1_000_000;

function openState(): RoomState {
  return { ...pumpRoom.initialState, switches: pumpRoom.initialState.switches.slice(), panelLocked: false };
}

function poweredState(): RoomState {
  return {
    ...openState(),
    switches: [true, true, true, true, true, true],
    powerOn: true,
    gaugeWashStarted: true
  };
}

describe('applyAction — panel', () => {
  it('open_panel unlocks a locked panel and emits one event', () => {
    const { state, events } = applyAction(pumpRoom, pumpRoom.initialState, { type: 'open_panel' }, NOW);
    expect(state.panelLocked).toBe(false);
    expect(events).toEqual([{ kind: 'room', text: 'The panel door swings open.' }]);
  });

  it('open_panel is idempotent — no event, no change, on an already-open panel', () => {
    const already = openState();
    const { state, events } = applyAction(pumpRoom, already, { type: 'open_panel' }, NOW);
    expect(state).toBe(already);
    expect(events).toEqual([]);
  });

  it('flip does nothing but a locked-panel event while the panel is locked', () => {
    const { state, events } = applyAction(pumpRoom, pumpRoom.initialState, { type: 'flip', index: 0 }, NOW);
    expect(state).toBe(pumpRoom.initialState);
    expect(events).toEqual([{ kind: 'room', text: 'The panel is locked shut.' }]);
  });
});

describe('applyAction — lighting', () => {
  it('turns on room lighting independently from puzzle power', () => {
    const { state, events } = applyAction(
      pumpRoom,
      pumpRoom.initialState,
      { type: 'turn_on_lights' },
      NOW
    );
    expect(state.lightsOn).toBe(true);
    expect(state.powerOn).toBe(false);
    expect(events).toEqual([{ kind: 'room', text: 'The ceiling lights flicker on.' }]);
  });

  it('turning on lighting twice is idempotent', () => {
    const lit = { ...pumpRoom.initialState, lightsOn: true };
    const result = applyAction(pumpRoom, lit, { type: 'turn_on_lights' }, NOW);
    expect(result.state).toBe(lit);
    expect(result.events).toEqual([]);
  });
});

describe('applyAction — switches and power', () => {
  it('flipping all six switches turns power on', () => {
    let state = openState();
    for (let i = 0; i < 6; i++) {
      ({ state } = applyAction(pumpRoom, state, { type: 'flip', index: i }, NOW));
    }
    expect(state.powerOn).toBe(true);
  });

  it('flipping the sixth switch emits the power-on event exactly once', () => {
    let state = openState();
    for (let i = 0; i < 5; i++) {
      ({ state } = applyAction(pumpRoom, state, { type: 'flip', index: i }, NOW));
    }
    const result = applyAction(pumpRoom, state, { type: 'flip', index: 5 }, NOW);
    expect(result.state.powerOn).toBe(true);
    expect(result.state.gaugeWashStarted).toBe(true);
    expect(result.events).toEqual([
      {
        kind: 'room',
        text: 'The panel instruments hum to life. Over by the return line, an old wash pipe coughs and starts running.'
      }
    ]);
  });

  it('flipping a switch back off while powered kills power', () => {
    const powered = poweredState();
    const result = applyAction(pumpRoom, powered, { type: 'flip', index: 0 }, NOW);
    expect(result.state.powerOn).toBe(false);
    expect(result.state.gaugeWashStarted).toBe(true);
    expect(result.events).toEqual([{ kind: 'room', text: 'The panel instruments go dark.' }]);
  });

  it('does not start the gauge wash before every breaker is on', () => {
    let state = openState();
    for (let index = 0; index < 5; index += 1) {
      ({ state } = applyAction(pumpRoom, state, { type: 'flip', index }, NOW));
    }
    expect(state.gaugeWashStarted).toBe(false);
    expect(playerView(pumpRoom, state, NOW).objects.find((object) => object.id === 'pipe_c')?.gaugeObscured).toBe(
      false
    );
  });
});

describe('applyAction — gauges', () => {
  it('gauges are unreadable without power', () => {
    const { events } = applyAction(pumpRoom, openState(), { type: 'inspect', objectId: 'pipe_a' }, NOW);
    expect(events).toEqual([{ kind: 'room', text: 'The gauge face is dark.' }]);
  });

  it('gauges read their static value once powered', () => {
    const { events } = applyAction(pumpRoom, poweredState(), { type: 'inspect', objectId: 'pipe_a' }, NOW);
    expect(events).toEqual([{ kind: 'room', text: 'Gauge A reads 7.' }]);
  });

  it('withholds Pipe C while water is crossing its gauge glass', () => {
    const state = poweredState();
    const { events } = applyAction(pumpRoom, state, { type: 'inspect', objectId: 'pipe_c' }, NOW);
    const pipeC = playerView(pumpRoom, state, NOW).objects.find((object) => object.id === 'pipe_c');

    expect(events).toEqual([
      { kind: 'room', text: 'A hard sheet of water drums across Gauge C. The face behind it is unreadable.' }
    ]);
    expect(pipeC?.gauge).toBeNull();
    expect(pipeC?.gaugeObscured).toBe(true);
  });
});

describe('applyAction — keypad', () => {
  it('the keypad is dead without power', () => {
    const { events, outcome } = applyAction(pumpRoom, openState(), { type: 'enter_code', digits: '7319' }, NOW);
    expect(events).toEqual([{ kind: 'room', text: 'The keypad is dark and unresponsive.' }]);
    expect(outcome).toEqual({ kind: 'keypad', status: 'unpowered' });
  });

  it('rejects the schematic-only reading (7391) without locking out', () => {
    const { state, events, outcome } = applyAction(
      pumpRoom,
      poweredState(),
      { type: 'enter_code', digits: '7391' },
      NOW
    );
    expect(state.doorOpen).toBe(false);
    expect(events).toEqual([{ kind: 'room', text: 'The keypad flashes red, then resets.' }]);
    expect(outcome).toEqual({ kind: 'keypad', status: 'wrong' });
  });

  it('accepts the work-order-corrected reading (7319) and completes the room', () => {
    const { state, events, outcome } = applyAction(
      pumpRoom,
      poweredState(),
      { type: 'enter_code', digits: '7319' },
      NOW
    );
    expect(state.doorOpen).toBe(true);
    expect(events).toEqual([
      { kind: 'room', text: 'The door unlocks with a heavy clunk.' },
      { kind: 'complete' }
    ]);
    expect(pumpRoom.isComplete(state)).toBe(true);
    expect(outcome).toEqual({ kind: 'keypad', status: 'correct' });
  });

  it('accepts the correct code immediately after a wrong attempt', () => {
    const wrong = applyAction(pumpRoom, poweredState(), { type: 'enter_code', digits: '7391' }, NOW);
    const correct = applyAction(pumpRoom, wrong.state, { type: 'enter_code', digits: '7319' }, NOW + 1);
    expect(correct.state.doorOpen).toBe(true);
    expect(correct.outcome).toEqual({ kind: 'keypad', status: 'correct' });
  });
});

describe('applyAction — pump and crank', () => {
  it('will not start the pump on a dead board', () => {
    const { state, events } = applyAction(pumpRoom, openState(), { type: 'start_pump' }, NOW);
    expect(state.pumpRunning).toBe(false);
    expect(events).toEqual([
      { kind: 'room', text: 'Something clicks in the panel, but nothing turns over.' }
    ]);
  });

  it('starts one thirty-second relay window without moving water', () => {
    const { state, events } = applyAction(pumpRoom, poweredState(), { type: 'start_pump' }, NOW);
    expect(state.pumpRunning).toBe(true);
    expect(state.pumpWindowUntil).toBe(NOW + PUMP_CRANK_WINDOW_MS);
    expect(state.pumpingSince).toBeNull();
    expect(sumpLevelMm(state, NOW + 60_000)).toBe(SUMP_START_MM);
    expect(pumpDischargePsi(state)).toBe(PUMP_SHUTOFF_PSI);
    expect(events).toEqual([
      {
        kind: 'room',
        text: 'The pump catches with a heavy thud. Above the handwheel, an old locking pin chatters loose.'
      }
    ]);
  });

  it('does not extend an active window when the pump is started twice', () => {
    const running = applyAction(pumpRoom, poweredState(), { type: 'start_pump' }, NOW).state;
    const result = applyAction(pumpRoom, running, { type: 'start_pump' }, NOW + 10_000);
    expect(result.state).toBe(running);
    expect(result.state.pumpWindowUntil).toBe(NOW + PUMP_CRANK_WINDOW_MS);
  });

  it('keeps the crank unavailable before the relay window', () => {
    const crank = playerView(pumpRoom, poweredState(), NOW).objects.find((object) => object.id === 'valve');
    const result = applyAction(pumpRoom, poweredState(), { type: 'set_valve', open: true }, NOW);
    expect(crank?.actions).toEqual([
      {
        id: 'turn_crank',
        label: 'Turn crank',
        enabled: false,
        disabledLabel: 'Needs override',
        input: undefined
      }
    ]);
    expect(result.state.valveOpen).toBe(false);
  });

  it('catches the crank inside the window and permanently clears Gauge C', () => {
    const running = applyAction(pumpRoom, poweredState(), { type: 'start_pump' }, NOW).state;
    const before = playerView(pumpRoom, running, NOW + 1).objects.find((object) => object.id === 'valve');
    const { state, events } = applyAction(pumpRoom, running, { type: 'set_valve', open: true }, NOW + 5_000);
    const pipeC = playerView(pumpRoom, state, NOW + 5_000).objects.find((object) => object.id === 'pipe_c');

    expect(before?.actions[0].enabled).toBe(true);
    expect(state.valveOpen).toBe(true);
    expect(state.pumpWindowUntil).toBeNull();
    expect(state.pumpingSince).toBe(NOW + 5_000);
    expect(pumpDischargePsi(state)).toBe(PUMP_DUTY_PSI);
    expect(pipeC?.gauge).toBe(9);
    expect(pipeC?.gaugeObscured).toBe(false);
    expect(events[0]).toEqual({
      kind: 'room',
      text: 'The handwheel fights, then gives. The sheet over Pipe C gutters away, leaving the gauge glass clear.'
    });
  });

  it('resets the pump and crank when the relay hold expires', () => {
    const running = applyAction(pumpRoom, poweredState(), { type: 'start_pump' }, NOW).state;
    const deadline = running.pumpWindowUntil!;
    const { state, events } = applyAction(pumpRoom, running, { type: 'pump_timeout', deadline }, deadline);
    expect(state.pumpRunning).toBe(false);
    expect(state.pumpWindowUntil).toBeNull();
    expect(state.valveOpen).toBe(false);
    expect(events[0]).toEqual({
      kind: 'room',
      text: 'The motor winds down. The handwheel kicks against its stop and the locking pin drops home.'
    });
  });

  it('rejects a crank turn at the exact deadline and resets the attempt', () => {
    const running = applyAction(pumpRoom, poweredState(), { type: 'start_pump' }, NOW).state;
    const { state } = applyAction(
      pumpRoom,
      running,
      { type: 'set_valve', open: true },
      running.pumpWindowUntil!
    );
    expect(state.valveOpen).toBe(false);
    expect(state.pumpRunning).toBe(false);
  });

  it('does not gate the powered keypad on standing water', () => {
    const flooded = { ...poweredState(), sumpMm: SUMP_DRY_MM + 1 };
    expect(sumpIsClear(flooded, NOW)).toBe(false);
    const { state } = applyAction(pumpRoom, flooded, { type: 'enter_code', digits: '7319' }, NOW);
    expect(state.doorOpen).toBe(true);
  });

  it('stops the pump at an empty sump without hiding C again', () => {
    const running = applyAction(pumpRoom, poweredState(), { type: 'start_pump' }, NOW).state;
    const open = applyAction(pumpRoom, running, { type: 'set_valve', open: true }, NOW + 1_000).state;
    const pumpingSince = open.pumpingSince!;
    const { state } = applyAction(
      pumpRoom,
      open,
      { type: 'pump_complete', pumpingSince },
      NOW + 60_000
    );
    expect(state.pumpRunning).toBe(false);
    expect(state.sumpMm).toBe(0);
    expect(state.valveOpen).toBe(true);
    expect(playerView(pumpRoom, state, NOW + 60_000).objects.find((object) => object.id === 'pipe_c')?.gauge).toBe(9);
  });
});
