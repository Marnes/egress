import * as THREE from 'three';
import type { KeypadStatus } from '@egress/core';
import type { GlyphPanel } from '../textures/legibility.js';
import type { PropFactory } from './registry.js';
import { createInstance, material, numberParam, panelMaterial } from './common.js';

export const keypad: PropFactory = (ctx) => {
  const width = numberParam(ctx, 'w', 0.16);
  const height = numberParam(ctx, 'h', 0.24);
  const depth = numberParam(ctx, 'd', 0.05);
  const root = new THREE.Group();
  root.name = ctx.spec.id;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material(ctx, 'body', 'metalDark')
  );
  root.add(body);

  const panel = ctx.legible?.glyphPanel({ widthPx: 256, heightPx: 96, aspectM: [width * 0.72, height * 0.22] });
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.72, height * 0.22),
    panelMaterial(ctx, panel)
  );
  display.position.set(0, height * 0.3, depth / 2 + 0.002);
  root.add(display);

  const keyMaterial = material(ctx, 'keys', 'metal');
  const keyPanels: GlyphPanel[] = [];
  const keyHitboxes: THREE.Mesh[] = [];
  const keyLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const keyIndex = row * 3 + column;
      const key = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.18, height * 0.095, depth * 0.2),
        keyMaterial
      );
      key.name = `${ctx.spec.id}:key:${keyLabels[keyIndex]}`;
      key.position.set((column - 1) * width * 0.25, height * (0.12 - row * 0.14), depth * 0.58);
      root.add(key);
      if (/^\d$/.test(keyLabels[keyIndex])) {
        key.userData.egressTarget = { kind: 'keypad-key', digit: keyLabels[keyIndex] };
        keyHitboxes.push(key);
      }
      const keyPanel = ctx.legible?.glyphPanel({
        widthPx: 64,
        heightPx: 64,
        aspectM: [width * 0.14, height * 0.07]
      });
      if (keyPanel) {
        keyPanel.draw(keyLabels[keyIndex], 'display');
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(width * 0.14, height * 0.07),
          keyPanel.material
        );
        label.position.copy(key.position);
        label.position.z = depth * 0.7;
        root.add(label);
        keyPanels.push(keyPanel);
      }
    }
  }

  let powered = false;
  let entered = '';
  let pendingAttempt: number | undefined;
  let nextAttempt = 0;
  let flash: Extract<KeypadStatus, 'correct' | 'wrong'> | undefined;
  let flashRemaining = 0;
  let previousValue: string | null | undefined;
  let previousFlash: typeof flash;
  const normalPanelColor = panel?.material.color.clone();
  const draw = () => {
    const value = !powered
      ? null
      : flash || pendingAttempt !== undefined
        ? entered
        : entered.length > 0
          ? entered.padEnd(4, '-')
          : '----';
    if (value === previousValue && flash === previousFlash) return;
    previousValue = value;
    previousFlash = flash;
    display.userData.value = value;
    display.userData.feedback = flash ?? null;
    if (panel && normalPanelColor) {
      panel.material.color.copy(normalPanelColor);
      if (flash === 'wrong') panel.material.color.set('#b51f28');
      if (flash === 'correct') panel.material.color.set('#2a9b55');
    }
    panel?.draw(value, 'display');
  };
  const update = (view: Parameters<NonNullable<ReturnType<PropFactory>['update']>>[0]) => {
    powered = view.powerOn;
    if (!powered) {
      entered = '';
      pendingAttempt = undefined;
      flash = undefined;
      flashRemaining = 0;
    }
    draw();
  };

  const instance = createInstance(root, ctx.spec.interactive ? [body, ...keyHitboxes] : [], {
    update,
    tick(dtSeconds) {
      const elapsedMs = Math.max(0, dtSeconds) * 1000;
      if (flashRemaining > 0) {
        flashRemaining = Math.max(0, flashRemaining - elapsedMs);
        if (flashRemaining === 0) {
          flash = undefined;
          entered = '';
        }
      }
      if (flashRemaining > 0 || previousFlash !== flash) draw();
    },
    panels: [...(panel ? [panel] : []), ...keyPanels]
  });
  return {
    ...instance,
    keypad: {
      press(digit) {
        if (!/^\d$/.test(digit) || !powered || pendingAttempt !== undefined || flash) {
          return undefined;
        }
        entered = `${entered}${digit}`.slice(0, 4);
        draw();
        if (entered.length < 4) return undefined;
        pendingAttempt = ++nextAttempt;
        draw();
        return { id: pendingAttempt, digits: entered };
      },
      resolve(id, status) {
        if (pendingAttempt !== id) return;
        pendingAttempt = undefined;
        if (status === 'correct' || status === 'wrong') {
          flash = status;
          flashRemaining = 800;
        } else {
          entered = '';
        }
        draw();
      },
      reject(id) {
        if (pendingAttempt !== id) return;
        pendingAttempt = undefined;
        entered = '';
        draw();
      }
    }
  };
};
