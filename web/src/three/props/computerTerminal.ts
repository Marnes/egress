import * as THREE from 'three';
import { AGENT_NAME } from '@egress/core';
import { tileBoxUv } from '../textures/uv.js';
import type { PropFactory, PropMessage } from './registry.js';
import { createInstance, material, numberParam, stringParam, tileOf } from './common.js';

const PHOSPHOR = '#ffb14a';
const FALLBACK_COLUMNS = 44;
const FALLBACK_ROWS = 6;
const PHOSPHOR_DEAD = '#4a3016';

/**
 * A wall-mounted CRT link terminal: a phosphor screen sunk behind a bezel in a
 * steel chassis, throwing the only warm light in an unpowered room.
 */
export const computerTerminal: PropFactory = (ctx) => {
  const width = numberParam(ctx, 'w', 1.4);
  const height = numberParam(ctx, 'h', 0.72);
  const depth = numberParam(ctx, 'd', 0.12);
  const root = new THREE.Group();
  root.name = ctx.spec.id;

  const frameMaterial = material(ctx, 'frame', 'metalDark');
  const accentMaterial = material(ctx, 'accent', 'accent');
  const frameTile = tileOf(ctx, 'frame', 'metalDark');

  const chassisSize: [number, number, number] = [width, height, depth];
  const chassisGeometry = new THREE.BoxGeometry(...chassisSize);
  tileBoxUv(chassisGeometry, chassisSize, frameTile);
  const monitor = new THREE.Mesh(chassisGeometry, frameMaterial);
  monitor.position.y = height * 0.12;

  const screenWidth = width * 0.84;
  const screenHeight = height * 0.68;
  const screenY = height * 0.12;
  // The canvas is cut to the mesh's aspect so the type is never stretched.
  const screenPanel = ctx.legible?.crtPanel({
    widthPx: 1024,
    heightPx: Math.round((1024 * screenHeight) / screenWidth),
    title: stringParam(ctx, 'title', 'Kestrel link'),
    phosphor: PHOSPHOR
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(screenWidth, screenHeight),
    screenPanel?.material ?? material(ctx, 'face', 'ink')
  );
  screen.name = `${ctx.spec.id}:screen`;
  screen.position.set(0, screenY, depth / 2 + 0.004);

  // A bezel standing proud of the glass, so the screen reads as recessed.
  const bezelDepth = 0.026;
  const bezel = (size: [number, number, number], x: number, y: number) => {
    const geometry = new THREE.BoxGeometry(...size);
    tileBoxUv(geometry, size, frameTile);
    const mesh = new THREE.Mesh(geometry, frameMaterial);
    mesh.position.set(x, y, depth / 2 + bezelDepth / 2);
    root.add(mesh);
  };
  bezel([width * 0.94, height * 0.08, bezelDepth], 0, screenY + screenHeight / 2 + height * 0.04);
  bezel([width * 0.94, height * 0.08, bezelDepth], 0, screenY - screenHeight / 2 - height * 0.04);
  bezel([width * 0.05, height * 0.84, bezelDepth], -(screenWidth / 2 + width * 0.025), screenY);
  bezel([width * 0.05, height * 0.84, bezelDepth], screenWidth / 2 + width * 0.025, screenY);

  const trimMaterial = material(ctx, 'trim', 'metalDark');
  const topRail = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.72, height * 0.025, depth * 0.12),
    trimMaterial
  );
  topRail.position.set(0, height * 0.61, depth * 0.57);
  const lowerRail = topRail.clone();
  lowerRail.position.y = -height * 0.37;
  const leftStatus = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.035, height * 0.09, depth * 0.13),
    accentMaterial
  );
  leftStatus.position.set(-width * 0.45, height * 0.5, depth * 0.58);
  const rightStatus = leftStatus.clone();
  rightStatus.position.x = width * 0.45;

  // A power lamp that stays lit whether or not the room has any.
  const lampMaterial = new THREE.MeshBasicMaterial({ color: PHOSPHOR, toneMapped: false });
  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.016, height * 0.016, 0.012, 12),
    lampMaterial
  );
  lamp.name = `${ctx.spec.id}:lamp`;
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(screenWidth / 2 - width * 0.02, screenY - screenHeight / 2 - height * 0.04, depth / 2 + bezelDepth);

  const terminalLight = new THREE.PointLight(
    PHOSPHOR,
    numberParam(ctx, 'lightIntensity', 3.2),
    numberParam(ctx, 'lightReachM', 3),
    2
  );
  terminalLight.name = `${ctx.spec.id}:light`;
  terminalLight.position.set(0, screenY, depth * 6.5);
  terminalLight.userData.alwaysOn = true;
  root.add(monitor, screen, topRail, lowerRail, leftStatus, rightStatus, lamp, terminalLight);

  let transcript: readonly PropMessage[] = [];
  let connected = false;

  const repaint = (): void => {
    const text = terminalText(
      transcript,
      connected,
      screenPanel?.columns ?? FALLBACK_COLUMNS,
      screenPanel?.rows ?? FALLBACK_ROWS
    );
    screen.userData.value = text;
    screen.userData.linkConnected = connected;
    // The lamp on the bezel follows the link, so the state reads even from
    // across the room where the header type is too small.
    lampMaterial.color.set(connected ? PHOSPHOR : PHOSPHOR_DEAD);
    screenPanel?.draw(text, {
      label: connected ? 'ONLINE' : 'OFFLINE',
      live: connected
    });
  };

  const updateMessages = (messages: readonly PropMessage[]): void => {
    transcript = messages;
    repaint();
  };
  const updateLink = (nextConnected: boolean): void => {
    connected = nextConnected;
    repaint();
  };
  repaint();

  const instance = createInstance(root, ctx.spec.interactive ? [monitor, screen] : [], {
    updateMessages,
    updateLink,
    tick: (dtSeconds) => screenPanel?.tick(dtSeconds)
  });
  return {
    ...instance,
    dispose() {
      terminalLight.dispose();
      lampMaterial.dispose();
      screenPanel?.dispose();
      instance.dispose();
    }
  };
};

function terminalText(
  messages: readonly PropMessage[],
  connected: boolean,
  columns: number,
  rows: number
): string {
  if (messages.length === 0) {
    return connected
      ? ['LINK ESTABLISHED', '', 'CLICK THE SCREEN OR PRESS ENTER TO TALK'].join('\n')
      : ['LINK OFFLINE', '', 'CLICK THE SCREEN TO RAISE AN OPERATOR'].join('\n');
  }
  const lines = messages.slice(-rows).flatMap((message) => {
    const prefix = message.from === 'agent' ? `${AGENT_NAME.toUpperCase()}> ` : 'YOU> ';
    return wrap(`${prefix}${message.text}`, columns);
  });
  return lines.slice(-rows).join('\n');
}

function wrap(text: string, width: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
