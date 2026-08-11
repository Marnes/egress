import type { RoomVisual } from '../visual/types.js';

export const pumpRoomVisual: RoomVisual = {
  version: 1,
  bounds: { size: [6, 3, 4] },
  eyeHeightM: 1.6,
  themeId: 'industrial',
  startNodeId: 'intercom',
  nodes: [
    { id: 'exit', label: 'Exit', position: [0, 1.6, -0.5], lookAt: [3, 1.6, -0.5] },
    { id: 'panel', label: 'Breakers', position: [-0.5, 1.6, 0], lookAt: [-0.5, 1.6, -2] },
    { id: 'pipes', label: 'Pipes', position: [0.5, 1.6, 0], lookAt: [0.5, 1.6, 2] },
    { id: 'intercom', label: 'Terminal', position: [-1.05, 1.6, 0.25], lookAt: [-3, 1.5, 0.12] },
    { id: 'pump', label: 'Pump', position: [-1.75, 1.6, 0.95], lookAt: [-2.6, 1.0, 1.45] }
  ],
  props: [
    {
      id: 'shell',
      type: 'shell',
      transform: { position: [0, 1.5, 0] },
      materials: { floor: 'floor', wall: 'wall', ceiling: 'ceiling' },
      params: { thickness: 0.05 }
    },
    {
      id: 'plinth',
      type: 'box',
      transform: { position: [-2.4, 0.15, 1.4] },
      materials: { body: 'structure' },
      params: { w: 0.9, h: 0.3, d: 0.7 }
    },
    {
      id: 'conduit_run',
      type: 'cylinder',
      transform: { position: [0, 2.82, -1.9], rotation: [0, 0, 1.5708] },
      materials: { body: 'metalDark' },
      params: { radius: 0.045, height: 5.6, segments: 8, variant: 7 }
    },
    {
      id: 'ceiling_light_a',
      type: 'poweredCeilingLight',
      transform: { position: [-1.55, 2.91, -0.55] },
      materials: { housing: 'structure' },
      params: { w: 1.75, h: 0.08, d: 0.3, intensity: 18, reachM: 7, strikeDelaySec: 0 }
    },
    {
      id: 'ceiling_light_b',
      type: 'poweredCeilingLight',
      transform: { position: [1.55, 2.91, 0.55] },
      materials: { housing: 'structure' },
      params: { w: 1.75, h: 0.08, d: 0.3, intensity: 18, reachM: 7, strikeDelaySec: 0.26 }
    },
    {
      id: 'pump_unit',
      type: 'pump',
      transform: { position: [-2.4, 0.3, 1.4], rotation: [0, -0.18, 0] },
      materials: { body: 'metal', hardware: 'metalDark' },
      params: { scale: 1, variant: 4, riseM: 0.8, runM: 0.42 }
    },
    {
      id: 'work_lamp',
      type: 'hangingLamp',
      transform: { position: [0.95, 2.86, 0.25] },
      materials: { shade: 'metal', hardware: 'metalDark' },
      params: { dropM: 0.7, radius: 0.12, intensity: 15, reachM: 6, swayRad: 0.05, swaySeconds: 5.4 }
    },
    {
      id: 'floor_pool',
      type: 'puddle',
      transform: { position: [1.02, 0, -0.62] },
      params: { w: 0.95, d: 0.78, dripFromM: 2.72, dripSeconds: 2.9 }
    },
    {
      id: 'rubble_a',
      type: 'box',
      transform: { position: [-0.35, 0.035, -1.86], rotation: [0, 0.5, 0.08] },
      materials: { body: 'wall' },
      params: { w: 0.21, h: 0.07, d: 0.1, variant: 3 }
    },
    {
      id: 'rubble_b',
      type: 'box',
      transform: { position: [-0.52, 0.032, -1.79], rotation: [0, -0.9, 0.02] },
      materials: { body: 'wall' },
      params: { w: 0.19, h: 0.065, d: 0.09, variant: 5 }
    },
    {
      id: 'rubble_c',
      type: 'box',
      transform: { position: [-0.44, 0.1, -1.88], rotation: [0.1, 1.9, 0.05] },
      materials: { body: 'wall' },
      params: { w: 0.12, h: 0.06, d: 0.09, variant: 7 }
    },
    {
      id: 'discharge_valve',
      type: 'valveWheel',
      transform: { position: [-2.548, 1.02, 1.373], rotation: [0, -0.18, 0] },
      nodes: ['pump'],
      objectId: 'valve',
      interactive: true,
      materials: { body: 'metal', hardware: 'metalDark' },
      params: { radius: 0.1, bore: 0.058, turns: 2.5, stemTiltRad: -1.5708 },
      inspect: { anchor: [-2.548, 1.06, 1.373], normal: [0.62, 0.42, -0.66], distanceM: 0.5, fovDeg: 30 }
    },
    {
      id: 'discharge_gauge',
      type: 'gaugeDial',
      transform: { position: [-2.44, 0.79, 1.3], rotation: [0, -0.5, 0] },
      nodes: ['pump'],
      objectId: 'pump',
      interactive: false,
      materials: { bezel: 'metalDark' },
      params: { radius: 0.075, depth: 0.03, showValue: false },
      inspect: { anchor: [-2.44, 0.79, 1.3], normal: [0.5, 0.35, -0.79], distanceM: 0.46, fovDeg: 28 }
    },
    {
      id: 'barrel_a',
      type: 'barrel',
      transform: { position: [2.32, 0.44, -1.52] },
      materials: { body: 'metal', hardware: 'metalDark' },
      params: { radius: 0.29, height: 0.88, hoops: 2, variant: 1 }
    },
    {
      id: 'barrel_b',
      type: 'barrel',
      transform: { position: [2.34, 0.44, -0.87], rotation: [0, 0.7, 0] },
      materials: { body: 'metal', hardware: 'metalDark' },
      params: { radius: 0.29, height: 0.88, hoops: 2, variant: 2 }
    },
    {
      id: 'pipe_service_plan',
      type: 'workOrderPlan',
      transform: { position: [2.33, 0.915, -1.195], rotation: [-1.5708, 0, 0] },
      params: { w: 0.5, h: 0.72 }
    },
    {
      id: 'barrel_tipped',
      type: 'barrel',
      transform: { position: [1.42, 0.29, -1.66], rotation: [0, 0.42, 1.5708] },
      materials: { body: 'metal', hardware: 'metalDark' },
      params: { radius: 0.29, height: 0.88, hoops: 2, variant: 3 }
    },
    {
      id: 'block_stack_a',
      type: 'box',
      transform: { position: [-2.58, 0.11, 0.62] },
      materials: { body: 'structure' },
      params: { w: 0.42, h: 0.22, d: 0.2, variant: 1 }
    },
    {
      id: 'block_stack_b',
      type: 'box',
      transform: { position: [-2.55, 0.33, 0.6], rotation: [0, 0.18, 0] },
      materials: { body: 'structure' },
      params: { w: 0.42, h: 0.22, d: 0.2, variant: 2 }
    },
    {
      id: 'mice_north',
      type: 'vermin',
      transform: { position: [0.55, 0, -1.84] },
      params: { count: 2, runM: 1.9, seed: 1207 }
    },
    {
      id: 'mice_south',
      type: 'vermin',
      transform: { position: [-1.35, 0, 1.72], rotation: [0, 3.1416, 0] },
      params: { count: 1, runM: 1.3, scale: 0.9, seed: 5891 }
    },
    {
      id: 'mice_corner',
      type: 'vermin',
      transform: { position: [-2.68, 0, -1.1], rotation: [0, 1.5708, 0] },
      params: { count: 1, runM: 1.5, scale: 1.05, seed: 733 }
    },
    {
      id: 'pipe_backplate',
      type: 'box',
      transform: { position: [0, 1.5, 1.93] },
      nodes: ['pipes'],
      materials: { body: 'structure' },
      params: { w: 4.2, h: 2.68, d: 0.04 }
    },
    {
      id: 'pipe_header',
      type: 'cylinder',
      transform: { position: [0, 2.67, 1.82], rotation: [0, 0, 1.5708] },
      nodes: ['pipes'],
      materials: { body: 'metalDark', clamp: 'structure' },
      params: { radius: 0.09, height: 4.2, segments: 28, clamps: 5, variant: 5 }
    },
    {
      id: 'pipe_return',
      type: 'cylinder',
      transform: { position: [0, 0.32, 1.82], rotation: [0, 0, 1.5708] },
      nodes: ['pipes'],
      materials: { body: 'metalDark', clamp: 'structure' },
      params: { radius: 0.085, height: 4.2, segments: 28, clamps: 5, variant: 6 }
    },
    {
      id: 'panel_body',
      type: 'panelBox',
      transform: { position: [-1.2, 1.45, -1.94] },
      nodes: ['panel'],
      objectId: 'panel',
      interactive: true,
      materials: { body: 'metal', door: 'metalDark', interior: 'structure', vent: 'ink', plate: 'ink', letters: 'accent' },
      params: { w: 0.62, h: 0.84, d: 0.1, hinge: 'left', openRad: -1.95, label: 'Breakers' },
      inspect: { anchor: [-1.2, 1.45, -1.9], normal: [0, 0, 1], distanceM: 0.85, fovDeg: 36 }
    },
    {
      id: 'switch_0',
      type: 'breakerSwitch',
      parent: 'panel_body',
      transform: { position: [0, 0.3, 0.055] },
      nodes: ['panel'],
      objectId: 'switch_0',
      interactive: true,
      materials: { body: 'metalDark', lever: 'accent' },
      params: { index: 0, w: 0.34, h: 0.09 }
    },
    {
      id: 'switch_1',
      type: 'breakerSwitch',
      parent: 'panel_body',
      transform: { position: [0, 0.18, 0.055] },
      nodes: ['panel'],
      objectId: 'switch_1',
      interactive: true,
      materials: { body: 'metalDark', lever: 'accent' },
      params: { index: 1, w: 0.34, h: 0.09 }
    },
    {
      id: 'switch_2',
      type: 'breakerSwitch',
      parent: 'panel_body',
      transform: { position: [0, 0.06, 0.055] },
      nodes: ['panel'],
      objectId: 'switch_2',
      interactive: true,
      materials: { body: 'metalDark', lever: 'accent' },
      params: { index: 2, w: 0.34, h: 0.09 }
    },
    {
      id: 'switch_3',
      type: 'breakerSwitch',
      parent: 'panel_body',
      transform: { position: [0, -0.06, 0.055] },
      nodes: ['panel'],
      objectId: 'switch_3',
      interactive: true,
      materials: { body: 'metalDark', lever: 'accent' },
      params: { index: 3, w: 0.34, h: 0.09 }
    },
    {
      id: 'switch_4',
      type: 'breakerSwitch',
      parent: 'panel_body',
      transform: { position: [0, -0.18, 0.055] },
      nodes: ['panel'],
      objectId: 'switch_4',
      interactive: true,
      materials: { body: 'metalDark', lever: 'accent' },
      params: { index: 4, w: 0.34, h: 0.09 }
    },
    {
      id: 'switch_5',
      type: 'breakerSwitch',
      parent: 'panel_body',
      transform: { position: [0, -0.3, 0.055] },
      nodes: ['panel'],
      objectId: 'switch_5',
      interactive: true,
      materials: { body: 'metalDark', lever: 'accent' },
      params: { index: 5, w: 0.34, h: 0.09 }
    },
    {
      id: 'pipe_a',
      type: 'cylinder',
      transform: { position: [-1.65, 1.5, 1.82] },
      nodes: ['pipes'],
      objectId: 'pipe_a',
      interactive: true,
      materials: { body: 'metal' },
      params: { radius: 0.07, height: 3, segments: 24, clamps: 3, flanges: 1, flangeOffsetM: -0.62, variant: 1 },
      inspect: { anchor: [-1.65, 1.6, 1.73], normal: [0, 0, -1], distanceM: 0.55, fovDeg: 30 }
    },
    {
      id: 'pipe_b',
      type: 'cylinder',
      transform: { position: [-0.55, 1.5, 1.82] },
      nodes: ['pipes'],
      objectId: 'pipe_b',
      interactive: true,
      materials: { body: 'metal' },
      params: { radius: 0.07, height: 3, segments: 24, clamps: 3, flanges: 1, flangeOffsetM: -0.62, variant: 2 },
      inspect: { anchor: [-0.55, 1.6, 1.73], normal: [0, 0, -1], distanceM: 0.55, fovDeg: 30 }
    },
    {
      id: 'pipe_c',
      type: 'cylinder',
      transform: { position: [0.55, 1.5, 1.82] },
      nodes: ['pipes'],
      objectId: 'pipe_c',
      interactive: true,
      materials: { body: 'metal' },
      params: { radius: 0.07, height: 3, segments: 24, clamps: 3, flanges: 1, flangeOffsetM: -0.62, variant: 3 },
      inspect: { anchor: [0.55, 1.6, 1.73], normal: [0, 0, -1], distanceM: 0.55, fovDeg: 30 }
    },
    {
      id: 'pipe_d',
      type: 'cylinder',
      transform: { position: [1.65, 1.5, 1.82] },
      nodes: ['pipes'],
      objectId: 'pipe_d',
      interactive: true,
      materials: { body: 'metal' },
      params: { radius: 0.07, height: 3, segments: 24, clamps: 3, flanges: 1, flangeOffsetM: -0.62, variant: 4 },
      inspect: { anchor: [1.65, 1.6, 1.73], normal: [0, 0, -1], distanceM: 0.55, fovDeg: 30 }
    },
    {
      id: 'stencil_a',
      type: 'stencilBand',
      parent: 'pipe_a',
      transform: { position: [0, 0.6, -0.071] },
      nodes: ['pipes'],
      objectId: 'pipe_a',
      materials: { band: 'metalDark' },
      params: { w: 0.11, h: 0.14 }
    },
    {
      id: 'stencil_b',
      type: 'stencilBand',
      parent: 'pipe_b',
      transform: { position: [0, 0.6, -0.071] },
      nodes: ['pipes'],
      objectId: 'pipe_b',
      materials: { band: 'metalDark' },
      params: { w: 0.11, h: 0.14 }
    },
    {
      id: 'stencil_c',
      type: 'stencilBand',
      parent: 'pipe_c',
      transform: { position: [0, 0.6, -0.071] },
      nodes: ['pipes'],
      objectId: 'pipe_c',
      materials: { band: 'metalDark' },
      params: { w: 0.11, h: 0.14 }
    },
    {
      id: 'stencil_d',
      type: 'stencilBand',
      parent: 'pipe_d',
      transform: { position: [0, 0.6, -0.071] },
      nodes: ['pipes'],
      objectId: 'pipe_d',
      materials: { band: 'metalDark' },
      params: { w: 0.11, h: 0.14 }
    },
    {
      id: 'gauge_a',
      type: 'gaugeDial',
      parent: 'pipe_a',
      transform: { position: [0, -0.05, -0.09] },
      nodes: ['pipes'],
      objectId: 'pipe_a',
      materials: { bezel: 'metalDark' },
      params: { radius: 0.075, depth: 0.03 }
    },
    {
      id: 'gauge_b',
      type: 'gaugeDial',
      parent: 'pipe_b',
      transform: { position: [0, -0.05, -0.09] },
      nodes: ['pipes'],
      objectId: 'pipe_b',
      materials: { bezel: 'metalDark' },
      params: { radius: 0.075, depth: 0.03 }
    },
    {
      id: 'gauge_c',
      type: 'gaugeDial',
      parent: 'pipe_c',
      transform: { position: [0, -0.05, -0.09] },
      nodes: ['pipes'],
      objectId: 'pipe_c',
      materials: { bezel: 'metalDark' },
      params: { radius: 0.075, depth: 0.03, waterJet: true, waterDropM: 1.42, waterReachM: 0.82 }
    },
    {
      id: 'gauge_d',
      type: 'gaugeDial',
      parent: 'pipe_d',
      transform: { position: [0, -0.05, -0.09] },
      nodes: ['pipes'],
      objectId: 'pipe_d',
      materials: { bezel: 'metalDark' },
      params: { radius: 0.075, depth: 0.03 }
    },
    {
      id: 'exit_door',
      type: 'door',
      transform: { position: [2.97, 1.05, 0], rotation: [0, -1.5708, 0] },
      nodes: ['exit'],
      objectId: 'door',
      interactive: true,
      materials: { slab: 'metal', frame: 'metalDark' },
      params: { w: 0.95, h: 2.1, d: 0.08, swingRad: -1.6 },
      inspect: { anchor: [2.9, 1.2, 0], normal: [-1, 0, 0], distanceM: 1.1, fovDeg: 40 }
    },
    {
      id: 'keypad_unit',
      type: 'keypad',
      transform: { position: [2.95, 1.35, 0.85], rotation: [0, -1.5708, 0] },
      nodes: ['exit'],
      objectId: 'keypad',
      interactive: true,
      materials: { body: 'metalDark', keys: 'metal' },
      params: { w: 0.14, h: 0.2, d: 0.045 },
      inspect: { anchor: [2.92, 1.35, 0.85], normal: [-1, 0, 0], distanceM: 0.34, fovDeg: 45 }
    },
    {
      id: 'facility_terminal',
      type: 'computerTerminal',
      transform: { position: [-2.84, 1.45, 0], rotation: [0, 1.5708, 0] },
      nodes: ['intercom'],
      objectId: 'intercom',
      interactive: true,
      opens: 'terminal',
      materials: { frame: 'metalDark', trim: 'metalDark', accent: 'accent' },
      params: { w: 1.4, h: 0.72, d: 0.12, lightIntensity: 2.8, lightReachM: 3.2 }
    }
  ]
};
