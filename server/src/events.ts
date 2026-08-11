import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { playerView } from '@egress/core';
import type { IntercomLine } from '@egress/core';
import { getSession } from './sessions.js';
import type { Session, SSEWriter } from './sessions.js';

export function subscribe(session: Session, writer: SSEWriter): void {
  session.browsers.add(writer);
}

export function unsubscribe(session: Session, writer: SSEWriter): void {
  session.browsers.delete(writer);
}

function broadcast(session: Session, event: string, data: unknown): void {
  for (const writer of session.browsers) {
    void writer.send(event, data).catch(() => unsubscribe(session, writer));
  }
}

export function broadcastState(session: Session): void {
  broadcast(session, 'state', playerView(session.spec, session.state, Date.now()));
}

export function broadcastRoom(session: Session, text: string): void {
  broadcast(session, 'room', { text });
}

export function broadcastIntercom(session: Session, line: IntercomLine): void {
  broadcast(session, 'intercom', line);
}

export function broadcastAgentConnected(session: Session, connected: boolean): void {
  broadcast(session, 'agent', { connected });
}

function syncPayload(session: Session) {
  return {
    view: playerView(session.spec, session.state, Date.now()),
    agentConnected: session.agentSeen,
    roomLog: session.roomLog.map((text) => ({ text })),
    intercomLog: session.intercomLog
  };
}

export function broadcastSync(session: Session): void {
  broadcast(session, 'sync', syncPayload(session));
}

const KEEPALIVE_MS = 15_000;

export const eventsApi = new Hono();

eventsApi.get('/events/:sessionId', (c) => {
  const session = getSession(c.req.param('sessionId'));
  if (!session) return c.text('Unknown session ID.', 404);

  return streamSSE(c, async (stream) => {
    let pending = Promise.resolve();
    const writer: SSEWriter = {
      send: (event, data) => {
        pending = pending.then(() => stream.writeSSE({ event, data: JSON.stringify(data) }));
        return pending;
      }
    };
    subscribe(session, writer);
    await writer.send('sync', syncPayload(session));

    const keepalive = setInterval(() => {
      void writer.send('ping', '').catch(() => unsubscribe(session, writer));
    }, KEEPALIVE_MS);

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(keepalive);
        unsubscribe(session, writer);
        resolve();
      });
    });
  });
});
