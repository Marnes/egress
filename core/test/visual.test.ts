import { describe, expect, it } from 'vitest';
import { pumpRoomVisual } from '../src/rooms/pumpRoom.visual.js';
import { pumpRoom } from '../src/rooms/pumpRoom.js';
import { themes } from '../src/visual/themes.js';
import type { RoomVisual, Theme } from '../src/visual/types.js';
import { validateRoomVisual } from '../src/visual/validate.js';

const PROP_TYPES = [
  'shell',
  'box',
  'cylinder',
  'panelBox',
  'breakerSwitch',
  'gaugeDial',
  'stencilBand',
  'keypad',
  'door',
  'speakerGrille',
  'computerTerminal',
  'poweredCeilingLight',
  'barrel',
  'vermin',
  'hangingLamp',
  'pump',
  'puddle',
  'valveWheel',
  'workOrderPlan'
] as const;

const OBJECT_IDS = pumpRoom.objects.map((object) => object.id);

function cloneVisual(): RoomVisual {
  return JSON.parse(JSON.stringify(pumpRoomVisual)) as RoomVisual;
}

function validate(visual: RoomVisual, availableThemes: readonly Theme[] = Object.values(themes)) {
  return validateRoomVisual(visual, { objectIds: OBJECT_IDS, propTypes: PROP_TYPES, themes: availableThemes });
}

describe('validateRoomVisual', () => {
  it('accepts the shipped room without errors or warnings', () => {
    expect(validate(pumpRoomVisual)).toEqual([]);
  });

  it('reports unknown object ids and prop types', () => {
    const visual = cloneVisual();
    visual.props[0].type = 'unknown';
    visual.props[1].objectId = 'missing';

    const messages = validate(visual).map((issue) => issue.message);
    expect(messages).toContain('Unknown prop type "unknown"');
    expect(messages).toContain('Unknown objectId "missing"');
  });

  it('reports duplicate and unknown graph references', () => {
    const visual = cloneVisual();
    visual.nodes[1].id = visual.nodes[0].id;
    visual.props[1].id = visual.props[0].id;
    visual.props[2].parent = 'missing-parent';
    visual.props[3].nodes = ['missing-node'];
    visual.startNodeId = 'missing-start';

    const messages = validate(visual).map((issue) => issue.message);
    expect(messages.some((message) => message.startsWith('Duplicate node id'))).toBe(true);
    expect(messages.some((message) => message.startsWith('Duplicate prop id'))).toBe(true);
    expect(messages).toContain('Unknown parent "missing-parent"');
    expect(messages).toContain('Unknown node "missing-node"');
    expect(messages).toContain('Unknown startNodeId "missing-start"');
  });

  it('reports parent cycles', () => {
    const visual = cloneVisual();
    visual.props[0].parent = visual.props[1].id;
    visual.props[1].parent = visual.props[0].id;

    expect(validate(visual).some((issue) => issue.message.startsWith('Parent cycle'))).toBe(true);
  });

  it('rejects hex-like, malformed, functional, and named colors in params', () => {
    const visual = cloneVisual();
    visual.props[0].params = { goodHex: '#aabbcc', badHex: '#abcd', functionColor: 'rgb(1 2 3)', named: 'red' };

    const issues = validate(visual);
    expect(issues.filter((issue) => issue.message.startsWith('Prop params cannot contain colors'))).toHaveLength(4);
    expect(issues.some((issue) => issue.message.startsWith('Malformed hex color "#abcd"'))).toBe(true);
  });

  it('rejects material values outside the closed palette roles', () => {
    const visual = cloneVisual();
    visual.props[1].materials = { body: '#ff0000' as never };

    expect(validate(visual)).toContainEqual(
      expect.objectContaining({ level: 'error', message: 'Unknown palette role "#ff0000"' })
    );
  });

  it('checks eye height and direct and parent-relative world positions against bounds', () => {
    const visual = cloneVisual();
    visual.nodes[0].position[1] = 1.5;
    visual.props.find((prop) => prop.id === 'plinth')!.transform.position = [3.1, 1, 0];
    visual.props.find((prop) => prop.id === 'panel_body')!.transform.position = [2.9, 1.45, 0];
    visual.props.find((prop) => prop.id === 'switch_0')!.transform.position = [0.2, 0, 0];

    const issues = validate(visual);
    expect(issues.some((issue) => issue.message.startsWith('Node y must equal'))).toBe(true);
    expect(issues.some((issue) => issue.message.startsWith('Prop "plinth" is outside'))).toBe(true);
    expect(issues.some((issue) => issue.message.startsWith('Prop "switch_0" is outside'))).toBe(true);
  });

  it('requires an object link for interactive props and warns when they have no node', () => {
    const visual = cloneVisual();
    visual.props[1].interactive = true;

    const issues = validate(visual);
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', message: 'Interactive prop must have an objectId' }));
    expect(issues).toContainEqual(expect.objectContaining({ level: 'warn', message: expect.stringContaining('is unreachable') }));
  });

  it('warns for empty nodes, missing derived lookAt targets, and nearby nav nodes', () => {
    const visual = cloneVisual();
    const [x, y, z] = visual.nodes[0].position;
    visual.nodes.push({ id: 'empty', label: 'Empty', position: [x + 0.1, y, z] });

    const messages = validate(visual)
      .filter((issue) => issue.level === 'warn')
      .map((issue) => issue.message);
    expect(messages).toContain('Node "empty" has no props assigned');
    expect(messages).toContain('Node "empty" has no lookAt and no props from which to derive one');
    expect(messages.some((message) => message.includes('are closer than 0.5m'))).toBe(true);
  });

  it('reports unknown themes, malformed theme hex, and low WCAG ink contrast', () => {
    const unknown = cloneVisual();
    unknown.themeId = 'missing';
    expect(validate(unknown).some((issue) => issue.message === 'Unknown themeId "missing"')).toBe(true);

    const malformed: Theme = JSON.parse(JSON.stringify(themes.industrial)) as Theme;
    malformed.palette.wall = '#xyz';
    expect(validate(pumpRoomVisual, [malformed]).some((issue) => issue.message.startsWith('Malformed hex color'))).toBe(true);

    const lowContrast: Theme = JSON.parse(JSON.stringify(themes.industrial)) as Theme;
    lowContrast.palette.floor = lowContrast.palette.ink;
    expect(validate(pumpRoomVisual, [lowContrast]).some((issue) => issue.message.includes('Ink contrast against floor'))).toBe(true);
  });
});

describe('shipped visual data', () => {
  it('has sufficient ink contrast in both themes', () => {
    for (const theme of Object.values(themes)) {
      const visual = cloneVisual();
      visual.themeId = theme.id;
      expect(validate(visual, [theme])).toEqual([]);
    }
  });

  it('links every prop objectId to a pump-room object', () => {
    const objectIds = new Set(OBJECT_IDS);
    expect(pumpRoomVisual.props.filter((prop) => prop.objectId && !objectIds.has(prop.objectId))).toEqual([]);
  });

  it('survives a JSON roundtrip unchanged', () => {
    expect(JSON.parse(JSON.stringify(pumpRoomVisual))).toEqual(pumpRoomVisual);
  });
});
