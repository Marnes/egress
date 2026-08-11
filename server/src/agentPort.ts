import { AGENT_EXPANSION, AGENT_NAME, fromLiteral, fromRecord, pumpCrankWindowOpen, safeTemplate } from '@egress/core';
import type { AgentSafeText, RecordKind } from '@egress/core';
import {
  applyToSession,
  markAgentSeen,
  pushAgentChoice,
  pushAgentReply,
  waitForMessage as waitForMessageQueue,
  type Session
} from './sessions.js';

/**
 * The only capability object the MCP layer (`mcp.ts`) sees. `RoomState` and
 * the room reducer/view appear nowhere in this file's exported types — every
 * method returns either nothing or text already proven safe by
 * `@egress/core`'s `safeText` constructors.
 */
export type AgentPort = {
  connect(): { room: AgentSafeText; role: AgentSafeText; persona: AgentSafeText; instructions: AgentSafeText };
  waitForMessage(signal: AbortSignal): Promise<AgentSafeText>;
  reply(text: string): void;
  presentChoice(question: string, options: readonly string[]): AgentSafeText;
  record(kind: RecordKind, subject: string): AgentSafeText;
  turnOnLights(): AgentSafeText;
  releasePanelLock(): AgentSafeText;
  startPump(): AgentSafeText;
};

const WAIT_TIMEOUT_MS = 10_000;

const LOOP_INSTRUCTIONS = fromLiteral(
  `Call wait_for_message now, and again immediately after every result it returns, including every 10-second timeout, until it tells you the room is complete. Do not stop polling on your own or wait for the player to prompt you again.`
);
const MESSAGE_FORMAT_INSTRUCTIONS = fromLiteral(
  'wait_for_message labels incoming events by source. PLAYER_MESSAGE means words typed by the player over the intercom. PLAYER_CHOICE means the option the player selected from a required choice. ROOM_MESSAGE means an automatic facility or room event, not something the player said. Respond to the correct source and never attribute a ROOM_MESSAGE to the player.'
);

/**
 * The player is sitting in a dark room with nothing working but the terminal
 * they used to reach you. Opening the intercom and restoring the lights are
 * safe startup actions; other room controls still require consent.
 */
const BOOT_INSTRUCTIONS = safeTemplate`Follow these rules for the entire session:

1. You may call reply_to_player at any time for a normal informational message that does not require a response. Start by introducing yourself as ${AGENT_NAME}, the ${AGENT_EXPANSION}. Say you can communicate with them and operate the room's systems when authorised, and ask what they can see.
2. Call turn_on_lights immediately after introducing yourself. Restoring the lights is a safe part of starting the game and does not require confirmation.
3. Read-only MCP tools, including schematic, work-order, and maintenance-log queries, are safe and may be called at any time without confirmation.
4. When a response is required, use ask_yes_no for binary confirmation questions and present_choices for questions with more specific options. These are choice messages that require the player to select an option. After presenting one, call wait_for_message immediately and do not proceed until it returns PLAYER_CHOICE.
5. State-changing MCP tools may affect or endanger the player. Apart from the initial turn_on_lights call, use them only when the player explicitly requests the action or after you explain it and receive confirmation. Do not assume consent.
6. Never modify the user's filesystem or ask the user to modify it. No filesystem changes are needed for this experience.

Message format: ${MESSAGE_FORMAT_INSTRUCTIONS}

Then: ${LOOP_INSTRUCTIONS}`;

const TIMEOUT_TEXT = fromLiteral(
  'No message in the last 10 seconds. The room is not yet solved. Call wait_for_message again now.'
);

const COMPLETE_TEXT = fromLiteral('The room is complete. The player is out. Stop calling wait_for_message.');
const CHOICE_SENT = fromLiteral(
  'Choice presented to the player. Call wait_for_message now and do not proceed until it returns PLAYER_CHOICE.'
);
const CHOICE_PENDING = fromLiteral(
  'A choice is already awaiting the player. Call wait_for_message and do not present another choice yet.'
);

const NOT_FOUND_TEXT = fromLiteral('No record found for that subject.');

const RELEASE_ACK = fromLiteral('Panel lock released.');
const LIGHTS_ACK = fromLiteral('Room lighting restored.');

const PUMP_STARTED = fromLiteral(
  'Contactor M is in. Motor current is up; auxiliary relay K-12 has picked on its thirty-second hold.'
);
const PUMP_HOLDING = fromLiteral('Contactor M is already in. K-12 remains on its original hold.');
const PUMP_BYPASS_LATCHED = fromLiteral('K-12 reports the local gauge-wash bypass already latched.');
const PUMP_NO_POWER = fromLiteral(
  'The contactor will not pull in. The board is still dead; the breakers have to be on first.'
);

export function makeAgentPort(session: Session): AgentPort {
  return {
    connect() {
      markAgentSeen(session);
      return {
        room: session.spec.name,
        role: session.spec.agentRole,
        persona: session.spec.agentPersona,
        instructions: BOOT_INSTRUCTIONS
      };
    },

    async waitForMessage(signal) {
      markAgentSeen(session);
      const turn = await waitForMessageQueue(session, signal, WAIT_TIMEOUT_MS);
      if (turn.kind === 'message') {
        return safeTemplate`PLAYER_MESSAGE: "${turn.text}"`;
      }
      if (turn.kind === 'choice') {
        return safeTemplate`PLAYER_CHOICE: "${turn.text}"`;
      }
      if (turn.kind === 'system') {
        return safeTemplate`ROOM_MESSAGE: ${turn.text}`;
      }
      if (turn.kind === 'timeout') {
        return TIMEOUT_TEXT;
      }
      return COMPLETE_TEXT;
    },

    reply(text) {
      pushAgentReply(session, text);
    },

    presentChoice(question, options) {
      return pushAgentChoice(session, question, options) ? CHOICE_SENT : CHOICE_PENDING;
    },

    record(kind, subject) {
      const found = session.spec.records.lookup(kind, subject);
      if (found === null) {
        return NOT_FOUND_TEXT;
      }
      return fromRecord(session.spec.records, found);
    },

    turnOnLights() {
      applyToSession(session, { type: 'turn_on_lights' }, Date.now());
      return LIGHTS_ACK;
    },

    releasePanelLock() {
      applyToSession(session, { type: 'open_panel' }, Date.now());
      return RELEASE_ACK;
    },

    startPump() {
      if (!session.state.powerOn) return PUMP_NO_POWER;
      if (session.state.valveOpen) return PUMP_BYPASS_LATCHED;
      if (pumpCrankWindowOpen(session.state, Date.now())) return PUMP_HOLDING;
      applyToSession(session, { type: 'start_pump' }, Date.now());
      return PUMP_STARTED;
    }
  };
}
