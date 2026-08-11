import {
  AGENT_NAME,
  applyAction,
  fromAgentChoice,
  fromLiteral,
  fromPlayer,
  pumpRoom,
  SUMP_DRAIN_MM_PER_SECOND,
  SUMP_DRY_MM,
  sumpLevelMm
} from '@egress/core';
import { randomUUID } from 'node:crypto';
import type { ActionOutcome, AgentSafeText, IntercomLine, PlayerAction, RoomSpec, RoomState } from '@egress/core';
import { broadcastAgentConnected, broadcastIntercom, broadcastRoom, broadcastState, broadcastSync } from './events.js';
import { loadStoredSession, saveStoredSession, type StoredSession } from './sessionStore.js';

export type PlayerTurn =
  | { kind: 'message'; text: AgentSafeText }
  | { kind: 'choice'; choiceId: string; optionId: string; text: AgentSafeText }
  | { kind: 'system'; text: AgentSafeText }
  | { kind: 'timeout' }
  | { kind: 'complete' };

export type SSEWriter = { send: (event: string, data: unknown) => Promise<void> };

type Waiter = { resolve: (turn: PlayerTurn) => void; cleanup: () => void };

export type Session = {
  sessionId: string;
  spec: RoomSpec;
  state: RoomState;
  playerQueue: PlayerTurn[];
  waiters: Waiter[];
  playerMessages: string[];
  browsers: Set<SSEWriter>;
  roomLog: string[];
  intercomLog: IntercomLine[];
  agentSeen: boolean;
  completed: boolean;
  /** Pending expiry of the pump's auxiliary-relay window. */
  pumpWindowTimer?: ReturnType<typeof setTimeout>;
  /** Pending re-broadcast while the sump is draining; see `scheduleDrain`. */
  drainTimer?: ReturnType<typeof setTimeout>;
};

const sessions = new Map<string, Session>();
const POWER_ON_ALERT = fromLiteral(
  'FACILITY ALERT — SYSTEM MALFUNCTION: Full-board energisation started an uncommanded return-line gauge wash. To stop the water at Pipe C, turn the local bypass crank on pump P-3.'
);

function cloneInitialState(spec: RoomSpec): RoomState {
  return { ...spec.initialState, switches: spec.initialState.switches.slice() };
}

function createSession(sessionId: string): Session {
  const spec: RoomSpec = pumpRoom;
  const session: Session = {
    sessionId,
    spec,
    state: cloneInitialState(spec),
    playerQueue: [],
    waiters: [],
    playerMessages: [],
    browsers: new Set(),
    roomLog: [],
    intercomLog: [],
    agentSeen: false,
    completed: false
  };
  sessions.set(sessionId, session);
  return session;
}

function storedSnapshot(session: Session): StoredSession {
  const playerQueue: StoredSession['playerQueue'] = [];
  for (const turn of session.playerQueue) {
    if (turn.kind === 'message') playerQueue.push({ kind: 'player', text: turn.text });
    if (turn.kind === 'choice') {
      playerQueue.push({ kind: 'choice', choiceId: turn.choiceId, optionId: turn.optionId });
    }
    if (turn.kind === 'system') playerQueue.push({ kind: 'power_on_alert' });
  }
  return {
    schemaVersion: 1,
    roomId: 'pump-room',
    state: session.state,
    playerQueue,
    playerMessages: session.playerMessages,
    roomLog: session.roomLog,
    intercomLog: session.intercomLog.map((line) =>
      line.choice
        ? { ...line, choice: { ...line.choice, options: line.choice.options.map((option) => ({ ...option })) } }
        : { from: line.from, text: line.text }
    ),
    agentSeen: session.agentSeen,
    completed: session.completed
  };
}

function persistSession(session: Session): void {
  saveStoredSession(session.sessionId, storedSnapshot(session));
}

function hydrateSession(sessionId: string, stored: StoredSession): Session {
  const playerMessages = [...stored.playerMessages];
  const intercomLog: IntercomLine[] = stored.intercomLog.map((line) =>
    line.choice
      ? { ...line, choice: { ...line.choice, options: line.choice.options.map((option) => ({ ...option })) } }
      : { from: line.from, text: line.text }
  );
  const restoredState = { ...stored.state, switches: [...stored.state.switches] };
  restoredState.gaugeWashStarted =
    restoredState.gaugeWashStarted || restoredState.powerOn || restoredState.switches.every(Boolean);
  if (restoredState.pumpRunning && !restoredState.valveOpen && restoredState.pumpWindowUntil === null) {
    restoredState.pumpRunning = false;
  }
  const session: Session = {
    sessionId,
    spec: pumpRoom,
    state: restoredState,
    playerQueue: stored.playerQueue.map((turn): PlayerTurn => {
      if (typeof turn === 'string') {
        return { kind: 'message', text: fromPlayer({ playerMessages }, turn) };
      }
      if (turn.kind === 'player') {
        return { kind: 'message', text: fromPlayer({ playerMessages }, turn.text) };
      }
      if (turn.kind === 'choice') {
        return {
          kind: 'choice',
          choiceId: turn.choiceId,
          optionId: turn.optionId,
          text: fromAgentChoice({ intercomLog }, turn.choiceId, turn.optionId)
        };
      }
      return { kind: 'system', text: POWER_ON_ALERT };
    }),
    waiters: [],
    playerMessages,
    browsers: new Set(),
    roomLog: [...stored.roomLog],
    intercomLog,
    agentSeen: stored.agentSeen,
    completed: stored.completed
  };
  sessions.set(sessionId, session);
  schedulePumpWindow(session);
  scheduleDrain(session);
  return session;
}

export function newSession(): Session {
  let sessionId = randomUUID();
  while (loadStoredSession(sessionId)) sessionId = randomUUID();
  const session = createSession(sessionId);
  persistSession(session);
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  const active = sessions.get(sessionId);
  if (active) return active;
  const stored = loadStoredSession(sessionId);
  return stored ? hydrateSession(sessionId, stored) : undefined;
}

export function clearSessionCache(): void {
  for (const session of sessions.values()) {
    clearTimeout(session.pumpWindowTimer);
    clearTimeout(session.drainTimer);
  }
  sessions.clear();
}

export function restartSession(session: Session): void {
  clearTimeout(session.pumpWindowTimer);
  session.pumpWindowTimer = undefined;
  clearTimeout(session.drainTimer);
  session.drainTimer = undefined;
  session.state = cloneInitialState(session.spec);
  session.playerQueue = [];
  session.playerMessages = [];
  session.roomLog = [];
  session.intercomLog = [];
  session.completed = false;
  persistSession(session);
  broadcastSync(session);
}

export function markAgentSeen(session: Session): void {
  if (session.agentSeen) return;
  session.agentSeen = true;
  const text = `The terminal crackles. ${AGENT_NAME} is on the line.`;
  session.roomLog.push(text);
  persistSession(session);
  broadcastAgentConnected(session, true);
  broadcastRoom(session, text);
}

/** Long-polling wait for player or system messages, drained when either source produces an event. */
export function waitForMessage(session: Session, signal: AbortSignal, timeoutMs: number): Promise<PlayerTurn> {
  if (session.completed) return Promise.resolve({ kind: 'complete' });
  const queued = session.playerQueue.shift();
  if (queued) {
    persistSession(session);
    return Promise.resolve(queued);
  }

  return new Promise((resolve) => {
    function finish(turn: PlayerTurn) {
      waiter.cleanup();
      resolve(turn);
    }
    const timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs);
    const onAbort = () => finish({ kind: 'timeout' });
    signal.addEventListener('abort', onAbort, { once: true });
    const waiter: Waiter = {
      resolve: finish,
      cleanup: () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        const idx = session.waiters.indexOf(waiter);
        if (idx !== -1) session.waiters.splice(idx, 1);
      }
    };
    session.waiters.push(waiter);
  });
}

/** Records a player intercom message: wakes a parked waiter, or queues it for the next poll. */
export function pushPlayerMessage(session: Session, text: string): void {
  session.playerMessages.push(text);
  session.intercomLog.push({ from: 'player', text });

  const turn: PlayerTurn = { kind: 'message', text: fromPlayer(session, text) };
  const waiter = session.waiters.shift();
  if (!waiter) session.playerQueue.push(turn);
  persistSession(session);
  broadcastIntercom(session, { from: 'player', text });
  waiter?.resolve(turn);
}

export function pushAgentReply(session: Session, text: string): void {
  const line: IntercomLine = { from: 'agent', text };
  session.intercomLog.push(line);
  persistSession(session);
  broadcastIntercom(session, line);
}

export function pushAgentChoice(session: Session, question: string, labels: readonly string[]): boolean {
  if (session.intercomLog.some((line) => line.choice?.selectedOptionId === null)) return false;
  const choice = {
    id: randomUUID(),
    options: labels.map((label, index) => ({ id: `option-${index + 1}`, label })),
    selectedOptionId: null
  };
  const line: IntercomLine = { from: 'agent', text: question, choice };
  session.intercomLog.push(line);
  persistSession(session);
  broadcastIntercom(session, line);
  return true;
}

export function selectAgentChoice(session: Session, choiceId: string, optionId: string): boolean {
  const line = session.intercomLog.find((candidate) => candidate.choice?.id === choiceId);
  if (!line?.choice || line.choice.selectedOptionId !== null) return false;
  const option = line.choice.options.find((candidate) => candidate.id === optionId);
  if (!option) return false;

  line.choice.selectedOptionId = option.id;
  session.intercomLog.push({ from: 'player', text: option.label });
  const turn: PlayerTurn = {
    kind: 'choice',
    choiceId,
    optionId,
    text: fromAgentChoice(session, choiceId, optionId)
  };
  const waiter = session.waiters.shift();
  if (!waiter) session.playerQueue.push(turn);
  persistSession(session);
  broadcastSync(session);
  waiter?.resolve(turn);
  return true;
}

function schedulePumpWindow(session: Session): void {
  clearTimeout(session.pumpWindowTimer);
  session.pumpWindowTimer = undefined;
  const deadline = session.state.pumpWindowUntil;
  if (deadline === null) return;

  const expire = () => applyToSession(session, { type: 'pump_timeout', deadline }, Date.now());
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    expire();
    return;
  }
  const timer = setTimeout(expire, remaining + 20);
  timer.unref?.();
  session.pumpWindowTimer = timer;
}

/** The single writer for room state: runs the reducer, persists the result, and broadcasts it. */
/**
 * The water level is derived from a timestamp, so nothing pushes a new view
 * when it crosses the float or finally runs dry — no action happens at that
 * moment. Re-broadcast at the points where the room's behaviour changes.
 */
function scheduleDrain(session: Session): void {
  clearTimeout(session.drainTimer);
  session.drainTimer = undefined;
  if (session.state.pumpingSince === null) return;

  const level = sumpLevelMm(session.state, Date.now());
  if (level <= 0) {
    applyToSession(session, { type: 'pump_complete', pumpingSince: session.state.pumpingSince }, Date.now());
    return;
  }
  const target = level > SUMP_DRY_MM ? SUMP_DRY_MM : 0;
  const delay = ((level - target) / SUMP_DRAIN_MM_PER_SECOND) * 1000 + 40;
  const timer = setTimeout(() => {
    session.drainTimer = undefined;
    const pumpingSince = session.state.pumpingSince;
    if (pumpingSince !== null && sumpLevelMm(session.state, Date.now()) <= 0) {
      applyToSession(session, { type: 'pump_complete', pumpingSince }, Date.now());
    } else {
      broadcastState(session);
      scheduleDrain(session);
    }
  }, Math.max(50, delay));
  timer.unref?.();
  session.drainTimer = timer;
}

export function applyToSession(session: Session, action: PlayerAction, now: number): ActionOutcome | undefined {
  const washWasStarted = session.state.gaugeWashStarted;
  const { state, events, outcome } = applyAction(session.spec, session.state, action, now);
  session.state = state;
  const roomEvents: string[] = [];
  let completedNow = false;
  for (const event of events) {
    if (event.kind === 'room') {
      session.roomLog.push(event.text);
      roomEvents.push(event.text);
    } else if (event.kind === 'complete' && !session.completed) {
      session.completed = true;
      completedNow = true;
    }
  }
  let systemWaiter: Waiter | undefined;
  if (!washWasStarted && state.gaugeWashStarted) {
    const turn: PlayerTurn = { kind: 'system', text: POWER_ON_ALERT };
    systemWaiter = session.waiters.shift();
    if (!systemWaiter) session.playerQueue.push(turn);
  }
  persistSession(session);
  for (const text of roomEvents) broadcastRoom(session, text);
  broadcastState(session);
  schedulePumpWindow(session);
  scheduleDrain(session);
  systemWaiter?.resolve({ kind: 'system', text: POWER_ON_ALERT });
  if (completedNow) {
    clearTimeout(session.pumpWindowTimer);
    clearTimeout(session.drainTimer);
    resolveCompletedWaiters(session);
  }
  return outcome;
}

export function completeSession(session: Session): void {
  if (session.completed) return;
  session.completed = true;
  persistSession(session);
  resolveCompletedWaiters(session);
}

function resolveCompletedWaiters(session: Session): void {
  const waiters = session.waiters.splice(0);
  for (const waiter of waiters) {
    waiter.resolve({ kind: 'complete' });
  }
}
