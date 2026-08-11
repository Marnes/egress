import type { ActionOutcome, IntercomLine, PlayerView, RoomVisual, Theme } from '@egress/core';

export type ApiSession = {
  sessionId: string;
  view: PlayerView;
  visual: RoomVisual;
  theme: Theme;
  agentConnected: boolean;
  roomLog: { text: string }[];
  intercomLog: IntercomLine[];
};

export type ActionResult = { view: PlayerView; outcome: ActionOutcome | null };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

function themeQuery(theme?: string): string {
  return theme ? `?theme=${encodeURIComponent(theme)}` : '';
}

export function createSession(theme?: string): Promise<ApiSession> {
  return fetch(`/api/session${themeQuery(theme)}`, { method: 'POST' }).then((r) => json(r));
}

export function fetchSession(sessionId: string, theme?: string): Promise<ApiSession> {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}${themeQuery(theme)}`).then((r) => json(r));
}

export function restartSession(sessionId: string, theme?: string): Promise<ApiSession> {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}/restart${themeQuery(theme)}`, {
    method: 'POST'
  }).then((r) => json(r));
}

export async function sendAction(
  sessionId: string,
  objectId: string,
  actionId: string,
  digits?: string
): Promise<ActionResult> {
  const response = await fetch(`/api/session/${encodeURIComponent(sessionId)}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectId, actionId, digits })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<ActionResult>;
}

export async function sendSay(sessionId: string, text: string): Promise<void> {
  const response = await fetch(`/api/session/${encodeURIComponent(sessionId)}/say`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function sendChoice(sessionId: string, choiceId: string, optionId: string): Promise<void> {
  const response = await fetch(`/api/session/${encodeURIComponent(sessionId)}/choice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ choiceId, optionId })
  });
  if (!response.ok) throw new Error(await response.text());
}
