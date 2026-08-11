import { Hono } from 'hono';
import { playerView, themes } from '@egress/core';
import type { PlayerAction, RoomVisual, Theme } from '@egress/core';
import {
  applyToSession,
  getSession,
  newSession,
  pushPlayerMessage,
  restartSession,
  selectAgentChoice,
  type Session
} from './sessions.js';

export const playerApi = new Hono();

function viewOf(session: Session) {
  return playerView(session.spec, session.state, Date.now());
}

function sessionPayload(session: Session, themeOverride?: string) {
  const authoredVisual = session.spec.visual;
  const themeId = themeOverride && Object.hasOwn(themes, themeOverride) ? themeOverride : authoredVisual.themeId;
  const theme: Theme = themes[themeId];
  const visual: RoomVisual =
    theme.id === authoredVisual.themeId ? authoredVisual : { ...authoredVisual, themeId: theme.id };
  return {
    sessionId: session.sessionId,
    view: viewOf(session),
    visual,
    theme,
    agentConnected: session.agentSeen,
    roomLog: session.roomLog.map((text) => ({ text })),
    intercomLog: session.intercomLog
  };
}

function resolveAction(
  session: Session,
  objectId: string,
  actionId: string,
  digits: unknown,
  now: number
): PlayerAction | undefined {
  const obj = session.spec.objects.find((o) => o.id === objectId);
  const actionDef = obj?.actions.find((a) => a.id === actionId);
  if (!actionDef) return undefined;
  if (actionDef.needs && !actionDef.needs(session.state, now)) return undefined;
  const template = actionDef.action;
  switch (template.type) {
    case 'inspect':
      return { type: 'inspect', objectId };
    case 'enter_code':
      if (typeof digits !== 'string' || !/^\d{4}$/.test(digits)) return undefined;
      return { type: 'enter_code', digits };
    case 'flip':
      return { type: 'flip', index: template.index };
    case 'open_panel':
      return { type: 'open_panel' };
    case 'set_valve':
      return { type: 'set_valve', open: template.open };
  }
}

playerApi.post('/session', (c) => {
  const session = newSession();
  return c.json(sessionPayload(session, c.req.query('theme')));
});

playerApi.get('/session/:sessionId', (c) => {
  const session = getSession(c.req.param('sessionId'));
  if (!session) return c.text('Unknown session ID.', 404);
  return c.json(sessionPayload(session, c.req.query('theme')));
});

playerApi.post('/session/:sessionId/restart', (c) => {
  const session = getSession(c.req.param('sessionId'));
  if (!session) return c.text('Unknown session ID.', 404);
  restartSession(session);
  return c.json(sessionPayload(session, c.req.query('theme')));
});

playerApi.post('/session/:sessionId/action', async (c) => {
  const session = getSession(c.req.param('sessionId'));
  if (!session) return c.text('Unknown session ID.', 404);

  const body = await c.req.json().catch(() => null);
  const objectId = body?.objectId;
  const actionId = body?.actionId;
  if (typeof objectId !== 'string' || typeof actionId !== 'string') {
    return c.text('objectId and actionId are required.', 400);
  }

  const now = Date.now();
  const action = resolveAction(session, objectId, actionId, body?.digits, now);
  if (!action) return c.text('Unknown or unavailable action.', 400);

  const outcome = applyToSession(session, action, now);
  return c.json({ view: viewOf(session), outcome: outcome ?? null });
});

playerApi.post('/session/:sessionId/say', async (c) => {
  const session = getSession(c.req.param('sessionId'));
  if (!session) return c.text('Unknown session ID.', 404);

  const body = await c.req.json().catch(() => null);
  const text = body?.text;
  if (typeof text !== 'string' || text.trim() === '') {
    return c.text('text is required.', 400);
  }

  pushPlayerMessage(session, text);
  return c.body(null, 204);
});

playerApi.post('/session/:sessionId/choice', async (c) => {
  const session = getSession(c.req.param('sessionId'));
  if (!session) return c.text('Unknown session ID.', 404);

  const body = await c.req.json().catch(() => null);
  const choiceId = body?.choiceId;
  const optionId = body?.optionId;
  if (typeof choiceId !== 'string' || typeof optionId !== 'string') {
    return c.text('choiceId and optionId are required.', 400);
  }
  if (!selectAgentChoice(session, choiceId, optionId)) {
    return c.text('Unknown, invalid, or already answered choice.', 409);
  }
  return c.body(null, 204);
});
