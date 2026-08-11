import { beforeEach, describe, expect, it } from 'vitest';
import { playerApi } from '../src/playerApi.js';
import {
  applyToSession,
  clearSessionCache,
  getSession,
  pushAgentChoice,
  pushAgentReply,
  pushPlayerMessage
} from '../src/sessions.js';
import { makeAgentPort } from '../src/agentPort.js';
import { clearStoredSessions } from '../src/sessionStore.js';

beforeEach(() => {
  clearSessionCache();
  clearStoredSessions();
});

describe('player session payload', () => {
  it('includes the visual and authored theme', async () => {
    const response = await playerApi.request('/session', { method: 'POST' });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.visual.themeId).toBe('industrial');
    expect(payload.theme.id).toBe('industrial');
    expect(payload.view.roomId).toBe('pump-room');
    expect(payload.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('applies a known theme override and rejects inherited object keys', async () => {
    const snow = await playerApi.request('/session?theme=snow', { method: 'POST' });
    const snowPayload = await snow.json();
    expect(snowPayload.visual.themeId).toBe('snow');
    expect(snowPayload.theme.id).toBe('snow');

    const invalid = await playerApi.request('/session?theme=toString', { method: 'POST' });
    const invalidPayload = await invalid.json();
    expect(invalidPayload.visual.themeId).toBe('industrial');
    expect(invalidPayload.theme.id).toBe('industrial');
  });

  it('restores progress and conversation history after the runtime cache is cleared', async () => {
    const created = await playerApi.request('/session', { method: 'POST' });
    const { sessionId } = await created.json();
    const session = getSession(sessionId)!;
    applyToSession(session, { type: 'turn_on_lights' }, Date.now());
    pushPlayerMessage(session, 'Can you hear me?');
    pushAgentReply(session, 'Loud and clear.');

    clearSessionCache();
    const response = await playerApi.request(`/session/${sessionId}`);
    const restored = await response.json();

    expect(response.status).toBe(200);
    expect(restored.sessionId).toBe(sessionId);
    expect(restored.view.lightsOn).toBe(true);
    expect(restored.roomLog).toContainEqual({ text: 'The ceiling lights flicker on.' });
    expect(restored.intercomLog).toEqual([
      { from: 'player', text: 'Can you hear me?' },
      { from: 'agent', text: 'Loud and clear.' }
    ]);
  });

  it('keeps different player sessions isolated', async () => {
    const first = await (await playerApi.request('/session', { method: 'POST' })).json();
    const second = await (await playerApi.request('/session', { method: 'POST' })).json();
    applyToSession(getSession(first.sessionId)!, { type: 'turn_on_lights' }, Date.now());

    clearSessionCache();
    const firstRestored = await (await playerApi.request(`/session/${first.sessionId}`)).json();
    const secondRestored = await (await playerApi.request(`/session/${second.sessionId}`)).json();

    expect(first.sessionId).not.toBe(second.sessionId);
    expect(firstRestored.view.lightsOn).toBe(true);
    expect(secondRestored.view.lightsOn).toBe(false);
  });

  it('restarts a session from its initial state without changing its ID', async () => {
    const created = await (await playerApi.request('/session', { method: 'POST' })).json();
    const session = getSession(created.sessionId)!;
    applyToSession(session, { type: 'turn_on_lights' }, Date.now());
    pushPlayerMessage(session, 'Before restart');
    pushAgentReply(session, 'Acknowledged');

    const response = await playerApi.request(`/session/${created.sessionId}/restart`, { method: 'POST' });
    const restarted = await response.json();

    expect(response.status).toBe(200);
    expect(restarted.sessionId).toBe(created.sessionId);
    expect(restarted.view.lightsOn).toBe(false);
    expect(restarted.roomLog).toEqual([]);
    expect(restarted.intercomLog).toEqual([]);

    clearSessionCache();
    expect(getSession(created.sessionId)?.state.lightsOn).toBe(false);
  });

  it('accepts the bypass crank only during the pump relay window', async () => {
    const created = await (await playerApi.request('/session', { method: 'POST' })).json();
    const session = getSession(created.sessionId)!;
    session.state = {
      ...session.state,
      switches: [true, true, true, true, true, true],
      powerOn: true
    };

    const early = await playerApi.request(`/session/${created.sessionId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectId: 'valve', actionId: 'turn_crank' })
    });
    expect(early.status).toBe(400);

    applyToSession(session, { type: 'start_pump' }, Date.now());
    const active = await playerApi.request(`/session/${created.sessionId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectId: 'valve', actionId: 'turn_crank' })
    });

    expect(active.status).toBe(200);
    expect(session.state.valveOpen).toBe(true);
    expect(session.state.pumpWindowUntil).toBeNull();
  });

  it('persists the gauge-wash latch after board power is switched off', async () => {
    const created = await (await playerApi.request('/session', { method: 'POST' })).json();
    const session = getSession(created.sessionId)!;
    applyToSession(session, { type: 'open_panel' }, Date.now());
    for (let index = 0; index < 6; index += 1) {
      applyToSession(session, { type: 'flip', index }, Date.now());
    }
    applyToSession(session, { type: 'flip', index: 0 }, Date.now());

    clearSessionCache();
    const restored = getSession(created.sessionId)!;
    expect(restored.state.powerOn).toBe(false);
    expect(restored.state.gaugeWashStarted).toBe(true);
  });

  it('returns keypad outcomes with the resulting player view', async () => {
    const wrongSession = await (await playerApi.request('/session', { method: 'POST' })).json();
    const wrongState = getSession(wrongSession.sessionId)!;
    wrongState.state = {
      ...wrongState.state,
      switches: [true, true, true, true, true, true],
      powerOn: true,
      gaugeWashStarted: true
    };
    const wrong = await playerApi.request(`/session/${wrongSession.sessionId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectId: 'keypad', actionId: 'enter_code', digits: '0000' })
    });
    const wrongPayload = await wrong.json();
    expect(wrong.status).toBe(200);
    expect(wrongPayload.outcome).toEqual({ kind: 'keypad', status: 'wrong' });

    const correct = await playerApi.request(`/session/${wrongSession.sessionId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectId: 'keypad', actionId: 'enter_code', digits: '7319' })
    });
    const correctPayload = await correct.json();
    expect(correctPayload.outcome).toEqual({ kind: 'keypad', status: 'correct' });
    expect(correctPayload.view.doorOpen).toBe(true);
  });

  it('persists a required choice and returns the validated selection to the agent', async () => {
    const created = await (await playerApi.request('/session', { method: 'POST' })).json();
    const session = getSession(created.sessionId)!;
    expect(pushAgentChoice(session, 'Want me to unlock it?', ['Yes', 'No'])).toBe(true);
    expect(pushAgentChoice(session, 'Another question?', ['A', 'B'])).toBe(false);

    clearSessionCache();
    const restoredPayload = await (await playerApi.request(`/session/${created.sessionId}`)).json();
    const choice = restoredPayload.intercomLog[0].choice;
    expect(choice.options.map((option: { label: string }) => option.label)).toEqual(['Yes', 'No']);
    expect(choice.selectedOptionId).toBeNull();

    const invalid = await playerApi.request(`/session/${created.sessionId}/choice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choiceId: choice.id, optionId: 'not-offered' })
    });
    expect(invalid.status).toBe(409);

    const selected = await playerApi.request(`/session/${created.sessionId}/choice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choiceId: choice.id, optionId: choice.options[0].id })
    });
    expect(selected.status).toBe(204);

    clearSessionCache();
    const restored = getSession(created.sessionId)!;
    await expect(makeAgentPort(restored).waitForMessage(new AbortController().signal)).resolves.toBe(
      'PLAYER_CHOICE: "Yes"'
    );
    expect(restored.intercomLog.at(-1)).toEqual({ from: 'player', text: 'Yes' });

    const duplicate = await playerApi.request(`/session/${created.sessionId}/choice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choiceId: choice.id, optionId: choice.options[0].id })
    });
    expect(duplicate.status).toBe(409);
  });
});
