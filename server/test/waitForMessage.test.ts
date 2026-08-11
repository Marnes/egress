import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUMP_CRANK_WINDOW_MS, pumpRoom } from '@egress/core';
import {
  applyToSession,
  clearSessionCache,
  completeSession,
  getSession,
  newSession,
  pushPlayerMessage,
  waitForMessage,
  type Session
} from '../src/sessions.js';
import { makeAgentPort } from '../src/agentPort.js';
import { clearStoredSessions } from '../src/sessionStore.js';

function makeSession(): Session {
  return {
    sessionId: randomUUID(),
    spec: pumpRoom,
    state: { ...pumpRoom.initialState, switches: pumpRoom.initialState.switches.slice() },
    playerQueue: [],
    waiters: [],
    playerMessages: [],
    browsers: new Set(),
    roomLog: [],
    intercomLog: [],
    agentSeen: false,
    completed: false
  };
}

beforeEach(() => {
  clearSessionCache();
  clearStoredSessions();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForMessage — queue', () => {
  it('resolves immediately from a message queued before the poll arrives', async () => {
    const session = makeSession();
    pushPlayerMessage(session, 'hello');
    const controller = new AbortController();
    await expect(waitForMessage(session, controller.signal, 1000)).resolves.toEqual({
      kind: 'message',
      text: 'hello'
    });
  });

  it('a message pushed while a poll is parked resolves that poll directly, not the queue', async () => {
    const session = makeSession();
    const controller = new AbortController();
    const promise = waitForMessage(session, controller.signal, 30_000);
    expect(session.waiters).toHaveLength(1);

    pushPlayerMessage(session, 'help');

    await expect(promise).resolves.toEqual({ kind: 'message', text: 'help' });
    expect(session.waiters).toHaveLength(0);
    expect(session.playerQueue).toHaveLength(0);
  });

  it('restores a queued message after the in-memory session cache is cleared', async () => {
    const session = newSession();
    pushPlayerMessage(session, 'still there?');
    clearSessionCache();

    const restored = getSession(session.sessionId);
    expect(restored).toBeDefined();
    await expect(waitForMessage(restored!, new AbortController().signal, 1000)).resolves.toEqual({
      kind: 'message',
      text: 'still there?'
    });
  });
});

describe('waitForMessage — system events', () => {
  it('documents and applies distinct player and room message prefixes', async () => {
    const session = newSession();
    const port = makeAgentPort(session);
    const briefing = port.connect().instructions;
    expect(briefing).toContain('PLAYER_MESSAGE means words typed by the player');
    expect(briefing).toContain('PLAYER_CHOICE means the option the player selected');
    expect(briefing).toContain('ROOM_MESSAGE means an automatic facility or room event');
    expect(briefing).toContain('EGRESS, the Emergency Guidance and Remote Engineering Support System');
    expect(briefing).toContain('Call turn_on_lights immediately after introducing yourself');
    expect(briefing).toContain('Read-only MCP tools');
    expect(briefing).toContain('are safe and may be called at any time without confirmation');
    expect(briefing).toContain('State-changing MCP tools may affect or endanger the player');
    expect(briefing).toContain('Never modify the user\'s filesystem');

    pushPlayerMessage(session, 'Is anyone there?');
    await expect(port.waitForMessage(new AbortController().signal)).resolves.toBe(
      'PLAYER_MESSAGE: "Is anyone there?"'
    );
  });

  it('delivers first full-board energisation as a system event, not a player message', async () => {
    const session = newSession();
    session.state = {
      ...session.state,
      panelLocked: false,
      switches: [true, true, true, true, true, false]
    };
    const waiting = makeAgentPort(session).waitForMessage(new AbortController().signal);

    applyToSession(session, { type: 'flip', index: 5 }, Date.now());

    const alert = await waiting;
    expect(alert).toContain('turn the local bypass crank on pump P-3');
    expect(alert).not.toContain('consult the pump schematic');
    expect(session.intercomLog).toEqual([]);
    expect(session.playerMessages).toEqual([]);
  });

  it('persists an unread system event and does not send it again after later power cycles', async () => {
    const session = newSession();
    session.state = {
      ...session.state,
      panelLocked: false,
      switches: [true, true, true, true, true, false]
    };
    applyToSession(session, { type: 'flip', index: 5 }, Date.now());
    const sessionId = session.sessionId;
    clearSessionCache();

    const restored = getSession(sessionId)!;
    await expect(makeAgentPort(restored).waitForMessage(new AbortController().signal)).resolves.toContain(
      'ROOM_MESSAGE: FACILITY ALERT — SYSTEM MALFUNCTION'
    );
    applyToSession(restored, { type: 'flip', index: 0 }, Date.now());
    applyToSession(restored, { type: 'flip', index: 0 }, Date.now());

    expect(restored.playerQueue).toEqual([]);
    expect(restored.intercomLog).toEqual([]);
  });
});

describe('waitForMessage — timeout', () => {
  it('resolves { kind: "timeout" } after timeoutMs with no message', async () => {
    vi.useFakeTimers();
    const session = makeSession();
    const controller = new AbortController();
    const promise = waitForMessage(session, controller.signal, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual({ kind: 'timeout' });
    expect(session.waiters).toHaveLength(0);
  });

  it('asks the agent to poll again after 10 seconds', async () => {
    vi.useFakeTimers();
    const promise = makeAgentPort(makeSession()).waitForMessage(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe(
      'No message in the last 10 seconds. The room is not yet solved. Call wait_for_message again now.'
    );
  });
});

describe('waitForMessage — abort', () => {
  it('resolves { kind: "timeout" } when the signal aborts before the timeout', async () => {
    const session = makeSession();
    const controller = new AbortController();
    const promise = waitForMessage(session, controller.signal, 30_000);
    controller.abort();
    await expect(promise).resolves.toEqual({ kind: 'timeout' });
    expect(session.waiters).toHaveLength(0);
  });
});

describe('waitForMessage — completion', () => {
  it('wakes every parked waiter with { kind: "complete" }', async () => {
    const session = makeSession();
    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = waitForMessage(session, c1.signal, 30_000);
    const p2 = waitForMessage(session, c2.signal, 30_000);
    expect(session.waiters).toHaveLength(2);

    completeSession(session);

    await expect(p1).resolves.toEqual({ kind: 'complete' });
    await expect(p2).resolves.toEqual({ kind: 'complete' });
    expect(session.waiters).toHaveLength(0);
  });

  it('once completed, resolves every subsequent poll as complete without parking it', async () => {
    const session = makeSession();
    completeSession(session);
    const controller = new AbortController();
    await expect(waitForMessage(session, controller.signal, 30_000)).resolves.toEqual({ kind: 'complete' });
    expect(session.waiters).toHaveLength(0);
  });

  it('completing twice is a no-op', () => {
    const session = makeSession();
    completeSession(session);
    expect(() => completeSession(session)).not.toThrow();
    expect(session.completed).toBe(true);
  });
});

describe('agent lighting capability', () => {
  it('turns on room lighting without energising the puzzle circuit', () => {
    const session = makeSession();
    const acknowledgement = makeAgentPort(session).turnOnLights();

    expect(acknowledgement).toBe('Room lighting restored.');
    expect(session.state.lightsOn).toBe(true);
    expect(session.state.powerOn).toBe(false);
    expect(session.roomLog).toContain('The ceiling lights flicker on.');
  });
});

describe('agent pump capability', () => {
  it('opens one persisted relay window and does not extend it on repeat calls', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const session = newSession();
    session.state = {
      ...session.state,
      switches: [true, true, true, true, true, true],
      powerOn: true
    };
    const port = makeAgentPort(session);

    expect(port.startPump()).toContain('thirty-second hold');
    const deadline = session.state.pumpWindowUntil;
    expect(deadline).toBe(Date.now() + PUMP_CRANK_WINDOW_MS);

    vi.setSystemTime(Date.now() + 10_000);
    expect(port.startPump()).toContain('original hold');
    expect(session.state.pumpWindowUntil).toBe(deadline);

    clearSessionCache();
    expect(getSession(session.sessionId)?.state.pumpWindowUntil).toBe(deadline);
  });

  it('settles an expired relay window when a persisted session is restored', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    const session = newSession();
    session.state = {
      ...session.state,
      switches: [true, true, true, true, true, true],
      powerOn: true
    };
    makeAgentPort(session).startPump();
    const sessionId = session.sessionId;
    clearSessionCache();

    vi.setSystemTime(Date.now() + PUMP_CRANK_WINDOW_MS + 1);
    const restored = getSession(sessionId)!;

    expect(restored.state.pumpRunning).toBe(false);
    expect(restored.state.pumpWindowUntil).toBeNull();
    expect(restored.state.valveOpen).toBe(false);
    expect(restored.roomLog.at(-1)).toContain('locking pin drops home');
  });

  it('automatically resets a live session when its relay hold expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(3_000_000);
    const session = newSession();
    session.state = {
      ...session.state,
      switches: [true, true, true, true, true, true],
      powerOn: true
    };
    makeAgentPort(session).startPump();

    await vi.advanceTimersByTimeAsync(PUMP_CRANK_WINDOW_MS + 25);

    expect(session.state.pumpRunning).toBe(false);
    expect(session.state.pumpWindowUntil).toBeNull();
    expect(session.roomLog.at(-1)).toContain('locking pin drops home');
  });
});
