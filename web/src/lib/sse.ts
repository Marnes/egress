import type { IntercomLine, PlayerView } from '@egress/core';

export type SSEHandlers = {
  onSync?: (snapshot: {
    view: PlayerView;
    agentConnected: boolean;
    roomLog: { text: string }[];
    intercomLog: IntercomLine[];
  }) => void;
  onState?: (view: PlayerView) => void;
  onRoom?: (text: string) => void;
  onIntercom?: (line: IntercomLine) => void;
  onAgent?: (connected: boolean) => void;
};

export function connectEvents(sessionId: string, handlers: SSEHandlers): () => void {
  const source = new EventSource(`/api/events/${encodeURIComponent(sessionId)}`);

  source.addEventListener('sync', (e) => {
    handlers.onSync?.(JSON.parse((e as MessageEvent).data));
  });
  source.addEventListener('state', (e) => {
    handlers.onState?.(JSON.parse((e as MessageEvent).data));
  });
  source.addEventListener('room', (e) => {
    const { text } = JSON.parse((e as MessageEvent).data);
    handlers.onRoom?.(text);
  });
  source.addEventListener('intercom', (e) => {
    handlers.onIntercom?.(JSON.parse((e as MessageEvent).data));
  });
  source.addEventListener('agent', (e) => {
    const { connected } = JSON.parse((e as MessageEvent).data);
    handlers.onAgent?.(connected);
  });

  return () => source.close();
}
