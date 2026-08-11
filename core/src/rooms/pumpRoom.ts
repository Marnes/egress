import { RecordStore } from '../records.js';
import { AGENT_EXPANSION, AGENT_NAME } from '../agent.js';
import { pumpCrankWindowOpen, pumpDischargePsi, SUMP_START_MM } from '../room.js';
import { fromLiteral, safeTemplate } from '../safeText.js';
import type { RoomObject, RoomSpec, RoomState } from '../types.js';
import { pumpRoomVisual } from './pumpRoom.visual.js';

const initialState: RoomState = {
  lightsOn: false,
  panelLocked: true,
  switches: [false, false, false, false, false, false],
  powerOn: false,
  gaugeWashStarted: false,
  doorOpen: false,
  valveOpen: false,
  pumpRunning: false,
  pumpWindowUntil: null,
  sumpMm: SUMP_START_MM,
  pumpingSince: null
};

const inspectAction = { id: 'inspect', label: 'Inspect', action: { type: 'inspect' } } as const;

const panel: RoomObject = {
  id: 'panel',
  label: 'Breaker panel',
  inspect: (s) =>
    s.panelLocked
      ? 'A grey steel panel, bolted shut. No visible handle or keyhole.'
      : 'The panel stands open. Six switches inside.',
  actions: [inspectAction]
};

const switches: RoomObject[] = [0, 1, 2, 3, 4, 5].map((i) => ({
  id: `switch_${i}`,
  label: `Switch ${i + 1}`,
  actions: [
    {
      id: 'flip',
      label: 'Flip',
      needs: (s) => !s.panelLocked,
      action: { type: 'flip', index: i }
    }
  ]
}));

function pipe(
  id: string,
  stencil: string,
  gauge: number,
  gaugeObscured?: (state: RoomState, now: number) => string | null
): RoomObject {
  return {
    id,
    label: `Pipe ${stencil}`,
    stencil,
    gauge,
    gaugeObscured,
    actions: [inspectAction]
  };
}

const pipes: RoomObject[] = [
  pipe('pipe_a', 'A', 7),
  pipe('pipe_b', 'B', 3),
  pipe('pipe_c', 'C', 9, (state) =>
    !state.gaugeWashStarted || state.valveOpen
      ? null
      : 'A hard sheet of water drums across Gauge C. The face behind it is unreadable.'
  ),
  pipe('pipe_d', 'D', 1)
];

const pumpUnit: RoomObject = {
  id: 'pump',
  label: 'Discharge gauge',
  reading: (s) => pumpDischargePsi(s),
  inspect: (s) =>
    s.pumpRunning
      ? 'The pump is running. The casing is warm and the discharge gauge is live.'
      : 'A squat pump on a concrete plinth, cold and still.',
  actions: [inspectAction]
};

const valve: RoomObject = {
  id: 'valve',
  label: 'Bypass crank',
  actions: [
    {
      id: 'turn_crank',
      label: 'Turn crank',
      disabledLabel: 'Needs override',
      needs: (state, now) => pumpCrankWindowOpen(state, now),
      action: { type: 'set_valve', open: true }
    }
  ]
};

const keypad: RoomObject = {
  id: 'keypad',
  label: 'Keypad',
  inspect: (s) =>
    !s.powerOn
      ? 'The keypad is dark.'
      : 'A four-digit keypad, lit and waiting.',
  actions: [
    inspectAction,
    {
      id: 'enter_code',
      label: 'Enter code',
      input: 'digits4',
      needs: (s) => s.powerOn,
      action: { type: 'enter_code' }
    }
  ]
};

const intercom: RoomObject = {
  id: 'intercom',
  label: 'Facility terminal',
  inspect: () => 'A facility terminal linked to Kestrel control.',
  actions: [inspectAction]
};

const door: RoomObject = {
  id: 'door',
  label: 'Door',
  inspect: (s) => (s.doorOpen ? 'The door stands open.' : 'A heavy door, keypad-locked.'),
  actions: [inspectAction]
};

const agentPersona = safeTemplate`You are ${AGENT_NAME}, the ${AGENT_EXPANSION}, serving as the on-call building systems operator for Kestrel Facilities. Someone is on the facility terminal, trapped in the pump room. You have no camera and no sensors — the only way you know what is happening is what they tell you. You have access to the facility archive (schematics, work orders, maintenance logs) and can remotely restore the room lighting, release the breaker panel lock, and start the room's sump pump.

Act decisively. When the player asks you to do something you're able to do, just do it — don't interrogate them for names, safety confirmations, or incident details first. If they ask you to turn on the lights or say they cannot see, restore the room lighting immediately. Keep replies short. Only ask a question when you genuinely need information from them to make progress — a gauge reading, a switch position, a keypad response — never as a stalling tactic.`;

export const pumpRoom: RoomSpec = {
  id: 'pump-room',
  name: fromLiteral('Pump room'),
  agentRole: fromLiteral('building systems operator, Kestrel Facilities'),
  agentPersona,
  objects: [panel, ...switches, ...pipes, pumpUnit, valve, keypad, intercom, door],
  records: new RecordStore(
    {
      'schematic:keypad': 'Entry order is: primary feed, secondary feed, return line, overflow line.',
      'schematic:pipes': 'A = primary. B = secondary. C = return. D = overflow.',
      'work_orders:pipes':
        'WO-2291 (1994): return and overflow lines swapped at the manifold; wall stencils never ' +
        'updated. Three later lockouts were traced to crews reading wall order as manifold order.',
      'maintenance_log:pipes':
        'Recurring return/overflow misidentification at the manifold. Brass tags requested; requisition closed unfunded.',
      'maintenance_log:keypad':
        'Keypad feed transferred to the overhead lighting tray after the 2003 flood. Under-slab ' +
        'conduit and float relay F-7 tagged abandoned in place.',
      'schematic:pump':
        'P-3 remote starter: main contactor M and auxiliary relay K-12. K-12 holds for thirty ' +
        'seconds and lifts the local gauge-wash bypass interlock.',
      'schematic:sump':
        'Sump takes the pump-room floor gully. P-3 discharge rises beside the return-line gauge ' +
        'and shares its old wash-water bypass.',
      'work_orders:sump':
        'WO-3140 (2003): exit keypad feed moved overhead after flood damage. Float relay F-7 ' +
        'bridged out; removal deferred until next slab works.',
      'work_orders:pump':
        'WO-4417 (2008), return-line gauge wash: bypass actuator seized. Temporary floor crank ' +
        'retained; spring return and K-12 interlock tested serviceable. Permanent actuator deferred.',
      'maintenance_log:pump':
        '14:32 — Control started P-3. Mercer caught the bypass crank before K-12 dropped; the sheet ' +
        'over the C glass broke clean. Actuator requisition remains outstanding.'
    },
    {
      // Query-string aliases so a plausibly-phrased lookup doesn't dead-end on "no record found"
      // for the same subject the room author filed under a different word.
      'schematic:pipe': 'pipes',
      'schematic:manifold': 'pipes',
      'work_orders:pipe': 'pipes',
      'work_orders:manifold': 'pipes',
      'work_orders:return': 'pipes',
      'work_orders:overflow': 'pipes',
      'work_orders:return line': 'pipes',
      'work_orders:overflow line': 'pipes',
      'work_orders:gauges': 'pipes',
      'work_orders:wo-2291': 'pipes',
      'work_orders:2291': 'pipes',
      'work_orders:1994': 'pipes',
      'work_orders:pipe work': 'pipes',
      'work_orders:1994 pipe work': 'pipes',
      'work_orders:pipe service order': 'pipes',
      'work_orders:1994 pipe service order': 'pipes',
      'maintenance_log:pipe': 'pipes',
      'maintenance_log:manifold': 'pipes',
      'maintenance_log:return': 'pipes',
      'maintenance_log:overflow': 'pipes',
      'schematic:door': 'keypad',
      'schematic:code': 'keypad',
      'work_orders:code': 'keypad',
      'work_orders:door': 'keypad',
      'work_orders:lock': 'keypad',
      'maintenance_log:code': 'keypad',
      'maintenance_log:door': 'keypad',
      'maintenance_log:lock': 'keypad',
      'schematic:valve': 'pump',
      'schematic:discharge': 'pump',
      'schematic:crank': 'pump',
      'schematic:bypass': 'pump',
      'schematic:relay': 'pump',
      'schematic:k-12': 'pump',
      'schematic:water': 'sump',
      'schematic:flood': 'sump',
      'schematic:gully': 'sump',
      'schematic:drain': 'sump',
      'schematic:float': 'sump',
      'work_orders:valve': 'pump',
      'work_orders:crank': 'pump',
      'work_orders:bypass': 'pump',
      'work_orders:relay': 'pump',
      'work_orders:k-12': 'pump',
      'work_orders:pipe c': 'pump',
      'work_orders:gauge c': 'pump',
      'work_orders:water': 'sump',
      'work_orders:flood': 'sump',
      'work_orders:float': 'sump',
      'work_orders:interlock': 'sump',
      'maintenance_log:valve': 'pump',
      'maintenance_log:discharge': 'pump',
      'maintenance_log:crank': 'pump',
      'maintenance_log:bypass': 'pump',
      'maintenance_log:relay': 'pump',
      'maintenance_log:k-12': 'pump',
      'maintenance_log:pipe c': 'pump',
      'maintenance_log:gauge c': 'pump',
      'maintenance_log:sump': 'pump',
      'maintenance_log:water': 'pump',
      'maintenance_log:flood': 'pump'
    }
  ),
  initialState,
  visual: pumpRoomVisual,
  isComplete: (s) => s.doorOpen
};
