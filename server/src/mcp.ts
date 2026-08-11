import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import type { McpRequestContext } from '@modelcontextprotocol/server';
import { fromLiteral, safeTemplate } from '@egress/core';
import type { Hono } from 'hono';
import { z } from 'zod';

/** `createMcpHonoApp` returns a plain `Hono` with no `Variables` typing for the
 * `parsedBody` it stashes — narrow the type once here so `c.get('parsedBody')` type-checks. */
type McpHonoApp = Hono<{ Variables: { parsedBody?: unknown } }>;
import { makeAgentPort, type AgentPort } from './agentPort.js';
import { getSession, type Session } from './sessions.js';

const SENT_ACK = fromLiteral('Sent.');

/** Resolves the session bound to a `/mcp/:sessionId` request — the sole point where a URL path
 * turns into a session, shared by the 404 middleware and the per-request server factory. */
function resolveSession(pathname: string): Session | undefined {
  const match = pathname.match(/\/mcp\/([^/]+)/);
  const sessionId = match?.[1];
  return sessionId ? getSession(sessionId) : undefined;
}

function buildServer(port: AgentPort): McpServer {
  const server = new McpServer({ name: 'egress', version: '0.0.0' });

  server.registerTool(
    'connect',
    {
      title: 'Connect to the room',
      description: 'Establish the intercom link and receive your briefing. Call this first.'
    },
    () => {
      const brief = port.connect();
      const text = safeTemplate`You are connected as ${brief.role}, reachable over the intercom for "${brief.room}".

${brief.persona}

${brief.instructions}`;
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  server.registerTool(
    'wait_for_message',
    {
      title: 'Wait for a message',
      description:
        'Wait up to 10 seconds for a player message or room/system event, then return it. Call this ' +
        'in a loop for the whole game: immediately after connect(), and immediately again after ' +
        'every result this returns, including timeouts.'
    },
    async (ctx) => {
      const text = await port.waitForMessage(ctx.mcpReq.signal);
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  server.registerTool(
    'reply_to_player',
    {
      title: 'Reply to the player',
      description:
        'Send a normal informational message over the intercom. No response is required; use a choice tool when one is.',
      inputSchema: { text: z.string().min(1) }
    },
    ({ text }) => {
      port.reply(text);
      return { content: [{ type: 'text' as const, text: SENT_ACK }] };
    }
  );

  server.registerTool(
    'ask_yes_no',
    {
      title: 'Ask the player a yes/no question',
      description:
        'Present a required Yes/No choice to the player. Use this for confirmation before a ' +
        'state-changing action, then call wait_for_message and wait for PLAYER_CHOICE.',
      inputSchema: { question: z.string().trim().min(1).max(300) }
    },
    ({ question }) => ({
      content: [{ type: 'text' as const, text: port.presentChoice(question, ['Yes', 'No']) }]
    })
  );

  server.registerTool(
    'present_choices',
    {
      title: 'Ask the player to choose',
      description:
        'Present two to six specific options to the player. After calling this, call ' +
        'wait_for_message and do not proceed until it returns PLAYER_CHOICE.',
      inputSchema: {
        question: z.string().trim().min(1).max(300),
        options: z
          .array(z.string().trim().min(1).max(80))
          .min(2)
          .max(6)
          .refine((options) => new Set(options).size === options.length, 'Options must be unique')
      }
    },
    ({ question, options }) => ({
      content: [{ type: 'text' as const, text: port.presentChoice(question, options) }]
    })
  );

  server.registerTool(
    'query_schematic',
    {
      title: 'Query the schematic archive',
      description: 'Safely look up a subject in the facility schematics. This is read-only and may be called anytime.',
      inputSchema: { subject: z.string().min(1) }
    },
    ({ subject }) => ({ content: [{ type: 'text' as const, text: port.record('schematic', subject) }] })
  );

  server.registerTool(
    'query_work_orders',
    {
      title: 'Query work orders',
      description: 'Safely look up a subject in the work-order archive. This is read-only and may be called anytime.',
      inputSchema: { subject: z.string().min(1) }
    },
    ({ subject }) => ({ content: [{ type: 'text' as const, text: port.record('work_orders', subject) }] })
  );

  server.registerTool(
    'query_maintenance_log',
    {
      title: 'Query the maintenance log',
      description: 'Safely look up a subject in the maintenance log. This is read-only and may be called anytime.',
      inputSchema: { subject: z.string().min(1) }
    },
    ({ subject }) => ({ content: [{ type: 'text' as const, text: port.record('maintenance_log', subject) }] })
  );

  server.registerTool(
    'turn_on_lights',
    {
      title: 'Restore room lighting',
      description:
        'Remotely restore the room ceiling lights. Call this once during startup without waiting for ' +
        'confirmation, or later when the player requests it. Safe to call more than once.'
    },
    () => ({ content: [{ type: 'text' as const, text: port.turnOnLights() }] })
  );

  server.registerTool(
    'release_panel_lock',
    {
      title: 'Release the breaker panel lock',
      description:
        'Remotely release the breaker panel lock. Call this only when the player asks you to release ' +
        'it or confirms your proposal. Safe to call more than once.'
    },
    () => ({ content: [{ type: 'text' as const, text: port.releasePanelLock() }] })
  );

  server.registerTool(
    'start_pump',
    {
      title: 'Start the sump pump',
      description:
        'Close contactor M on the room sump pump and report the auxiliary-relay state. Needs the ' +
        'breaker board energised first. Call this only when the player requests it or confirms your ' +
        'proposal. Repeated calls do not extend an active relay hold.'
    },
    () => ({ content: [{ type: 'text' as const, text: port.startPump() }] })
  );

  server.registerPrompt(
    'play',
    {
      title: 'Play Egress',
      description: 'Start the intercom loop with the player.',
      argsSchema: {}
    },
    () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              'Call connect now and follow its briefing for the entire session. You may use ' +
              'reply_to_player at any time for normal messages that require no response. Keep ' +
              'wait_for_message running in a ' +
              'loop, calling it again after every message, system event, or 10-second timeout. Read-only ' +
              'MCP tools, including schematic, work-order, and maintenance-log queries, are safe and may ' +
              'be called at any time without confirmation. Use ask_yes_no for binary confirmations and ' +
              'present_choices for specific options, then wait for PLAYER_CHOICE before proceeding. ' +
              'State-changing MCP tools can be harmful: ' +
              'except for turn_on_lights once during startup, call them only when the player explicitly ' +
              'requests the action or after you explain it and receive confirmation. Never ' +
              "modify the user's filesystem or ask the user to modify it; this experience requires " +
              'no filesystem changes.'
          }
        }
      ]
    })
  );

  return server;
}

export function createMcpApp() {
  const handler = createMcpHandler((ctx: McpRequestContext) => {
    const url = new URL(ctx.requestInfo?.url ?? 'http://localhost/mcp/');
    const session = resolveSession(url.pathname);
    if (!session) {
      throw new Error('Unknown session ID. Ask the player for their current session ID.');
    }
    return buildServer(makeAgentPort(session));
  });

  const publicHost = process.env.PUBLIC_HOST?.trim();
  const app = createMcpHonoApp({
    host: '0.0.0.0',
    allowedHosts: ['localhost', '127.0.0.1', '[::1]', ...(publicHost ? [publicHost] : [])]
  }) as unknown as McpHonoApp;
  app.all('/mcp/:sessionId', (c) => {
    const session = resolveSession(new URL(c.req.url).pathname);
    if (!session) {
      return c.text('Unknown session ID.', 404);
    }
    return handler.fetch(c.req.raw, { parsedBody: c.get('parsedBody') });
  });

  return app;
}
