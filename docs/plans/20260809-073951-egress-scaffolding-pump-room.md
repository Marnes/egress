# Egress — scaffolding + "Pump room" test room

> **Status: Implemented 2026-08-09.** Repo skeleton, `core/`, `server/`, and `web/` all built
> per this plan; `npm test`, `npm run typecheck`, and `npm run lint` are green, and the full
> vertical slice (session creation, SSE, `wait_for_player` long-poll parking/waking/completion,
> record queries through the leak guard, `release_panel_lock`, and a full switches → gauges →
> keypad → door solve) was verified end-to-end against the running server over real HTTP/MCP
> calls. The ESLint `no-restricted-imports` leak guard was confirmed to actually fire on a
> deliberately leaky import.
>
> **Not yet done — needs a human:** the 15+ minute live-Claude-Code loop-stability test (build
> order step 1's gate) and the blind human playtest (step 5) both require a live second agent
> session and/or a person who hasn't seen the records; see "Manual end-to-end test" below.

## Context

An asymmetric-information escape room. The **player** sees a room and can act in it but has no
documentation; the **AI agent** reads building records and operates one remote actuator but is
blind. They talk over an in-game intercom. Neither escapes alone.

The agent is not hosted — the player attaches their own Claude Code to the server over MCP.

This milestone proves the interaction loop end to end with one hardcoded room and a plain DOM
client. Out of scope: 3D, procedural generation, accounts, persistence, audio.

The riskiest unknown is whether a real Claude Code instance will sit in a
`wait_for_player()` loop for the length of a game without being re-prodded. Everything else is
ordinary web plumbing. The build order below reaches that answer first, but inside the real repo
structure rather than a throwaway spike.

### Decisions taken

| Decision | Choice |
|---|---|
| Agent↔room pairing | Session code in the MCP URL path (`/mcp/:code`), stateless MCP handler |
| First milestone | Real repo skeleton, vertical slice — loop first, through the real intercom |
| Agent action visibility | Diegetic room events only; no `[tool: ...]` lines on the intercom |

### SDK note — this uses MCP TypeScript SDK **v2**

The monolithic `@modelcontextprotocol/sdk` (v1, currently 1.30.0) has been superseded by v2 split
packages implementing the 2026-07-28 spec. v2 ships a **first-party Hono adapter**, which fits the
chosen stack exactly:

```
npm i @modelcontextprotocol/server @modelcontextprotocol/hono hono @hono/node-server zod
```

- `createMcpHonoApp(opts)` — Hono app with `parsedBody` exposure + DNS-rebinding protection
- `localhostHostValidation()` — Host header check, wanted for a localhost server
- `createMcpHandler(factory, { responseMode })` — factory runs **once per HTTP request**, returns
  `{ fetch, close, notify, bus }`. Stateless by construction, which is why the code goes in the URL.
- `server.registerTool(name, { description, inputSchema }, handler)`
- `server.registerPrompt(name, { title, description, argsSchema }, handler)` → `{ messages: [...] }`

TypeScript ≥6 no longer auto-includes `@types/*` — put `"types": ["node"]` in `compilerOptions`.

---

## Repo layout

Single repo, npm workspaces, ESM throughout.

```
egress/
  package.json              # workspaces: core, server, web; scripts: dev, test, build
  tsconfig.base.json        # strict, moduleResolution bundler, types: ["node"]
  vitest.config.ts

  core/                     # pure, no I/O, unit tested
    src/
      types.ts              # RoomSpec, RoomState, PlayerAction, RoomEvent, PlayerView
      records.ts            # RecordStore — frozen static text, no access to RoomState
      room.ts               # applyAction(spec, state, action) -> { state, events }
      view.ts               # playerView(spec, state) -> PlayerView
      safeText.ts           # AgentSafeText branded type + constructors  ← leak guard
      rooms/pumpRoom.ts     # the hardcoded room
      index.ts
    test/

  server/                   # Hono; MCP endpoint; SSE; in-memory sessions
    src/
      index.ts              # app assembly + @hono/node-server
      sessions.ts           # Map<code, Session>, code generation, lifecycle
      agentPort.ts          # the ONLY capability object the MCP layer sees
      mcp.ts                # tools + prompt, built over AgentPort
      playerApi.ts          # POST action / POST say / GET session
      events.ts             # SSE fan-out to browsers
    test/

  web/                      # Vite + Svelte, grey boxes, no canvas
    src/
      App.svelte            # object list, action buttons, intercom input, message log
      lib/api.ts  lib/sse.ts
```

Dev runs two processes (`vite` + `tsx watch server`) with Vite proxying `/api`, `/events`, `/mcp`
to the Hono server on `:8787`. The **runtime** is a single Node process — in `build`, Hono serves
`web/dist` statically.

---

## `core/` — the room spec type

The type is designed so that the record surface is physically unable to reach room state.

```ts
// core/src/types.ts
export type RoomSpec = {
  id: string;
  name: string;
  agentRole: string;          // "building systems operator, Kestrel Facilities"
  agentPersona: string;       // persona brief returned by connect()
  objects: RoomObject[];      // static definitions only
  records: RecordStore;       // frozen at construction; see below
  initialState: RoomState;
  isComplete(s: RoomState): boolean;
};

export type RoomObject = {
  id: string;                 // "panel" | "pipe_a" | "keypad" | "intercom"
  label: string;              // "Breaker panel"
  actions: ActionDef[];       // { id, label, needs?: (s) => boolean, input?: 'digits4' }
};

export type RoomState = {
  panelLocked: boolean;
  switches: boolean[];        // 6
  powerOn: boolean;           // derived on apply: switches.every(Boolean)
  keypadLockoutUntil: number | null;
  doorOpen: boolean;
};

export type PlayerAction =
  | { type: 'flip'; index: number }
  | { type: 'open_panel' }
  | { type: 'enter_code'; digits: string }
  | { type: 'inspect'; objectId: string };

export type RoomEvent =
  | { kind: 'room'; text: string }        // diegetic, shown in the room log
  | { kind: 'complete' };
```

`applyAction` is a pure reducer: `(spec, state, action, now) => { state, events }`. Every state
transition in the game goes through it, including the one the agent triggers
(`release_panel_lock` dispatches `{ type: 'open_panel' }`). Timers are passed in as `now`, never
read from `Date.now()` inside core — that keeps the lockout unit-testable.

### `RecordStore` — static by construction

```ts
// core/src/records.ts
export type RecordKind = 'schematic' | 'work_orders' | 'maintenance_log';

export class RecordStore {
  private readonly entries: ReadonlyMap<string, string>;
  constructor(entries: Record<`${RecordKind}:${string}`, string>) {
    this.entries = new Map(Object.entries(entries));
    Object.freeze(this);
  }
  lookup(kind: RecordKind, subject: string): string | null {
    return this.entries.get(`${kind}:${subject.trim().toLowerCase()}`) ?? null;
  }
  /** every string the agent is ever allowed to read from records */
  corpus(): readonly string[] { return [...this.entries.values()]; }
}
```

`lookup` takes no state and has no closure over any. This is the structural half of the hard
constraint; the runtime half is below.

---

## Enforcing "no tool may return live room state"

Three layers, cheapest first. Layer 2 is the one that actually has teeth.

**1 — Capability narrowing (`server/src/agentPort.ts`).** The MCP layer closes over exactly one
object. `RoomState` appears in none of its return types.

```ts
export type AgentPort = {
  brief(): { room: string; role: string; persona: string };
  waitForPlayer(signal: AbortSignal): Promise<PlayerTurn>;
  reply(text: string): void;                 // void — nothing comes back
  record(kind: RecordKind, subject: string): AgentSafeText | null;
  releasePanelLock(): AgentSafeText;         // fixed acknowledgement, always the same
};

export type PlayerTurn =
  | { kind: 'message'; text: string }
  | { kind: 'timeout' }
  | { kind: 'complete' };
```

`server/src/mcp.ts` imports `AgentPort` and nothing else from the game. An ESLint
`no-restricted-imports` rule blocks `core/room`, `core/view`, and `core/types#RoomState` from that
file, so a future careless edit fails lint rather than silently leaking.

**2 — Branded outbound text with a runtime corpus check (`core/src/safeText.ts`).** Every string
that reaches the agent must be constructed through one of three functions:

```ts
declare const brand: unique symbol;
export type AgentSafeText = string & { readonly [brand]: 'agent-safe' };

export function fromLiteral(s: StaticLiteral): AgentSafeText;      // compile-time constants only
export function fromRecord(store: RecordStore, s: string): AgentSafeText;   // asserts membership
export function fromPlayer(session: Session, s: string): AgentSafeText;     // asserts it was typed
```

`fromRecord` throws unless `store.corpus().includes(s)`. `fromPlayer` throws unless the string is
in the session's message history. The MCP tool handlers' return type is
`{ content: [{ type: 'text'; text: AgentSafeText }] }` — a raw `string` will not type-check, and a
string that was fabricated at runtime rather than sourced will throw at the boundary.

Test: a deliberately leaky fake tool that tries to return `` `gauge A reads ${state.gaugeA}` ``
must throw, and must fail `tsc`.

**3 — Fixed-shape acknowledgements.** `releasePanelLock()` is idempotent and returns the *same*
literal whether or not the panel was already open. Otherwise success-vs-error is a one-bit read of
room state — the subtlest leak in the design, and the easiest to write by accident.

---

## Session lifecycle and pairing

```ts
// server/src/sessions.ts
type Session = {
  code: string;                    // "EGRESS-7K2P"
  spec: RoomSpec;
  state: RoomState;                // server-only, never serialized to the agent
  playerQueue: PlayerTurn[];       // typed but not yet collected by the agent
  waiters: Waiter[];               // parked wait_for_player calls
  playerMessages: string[];        // corpus for fromPlayer()
  browsers: Set<SSEWriter>;
  roomLog: string[];
  intercomLog: { from: 'player' | 'agent'; text: string }[];
  agentSeen: boolean;
  completed: boolean;
};
```

1. Browser loads, calls `POST /api/session` → `{ code, view }`. The page keeps `code` in
   `sessionStorage` and prefers `GET /api/session/:code` on reload.
2. Page displays the code and the exact command to paste:
   `claude mcp add --transport http egress http://localhost:8787/mcp/EGRESS-7K2P`
3. Agent hits `/mcp/:code`. Hono middleware resolves code → session (404 + a clear body if
   unknown), stashes it on the context, and `createMcpHandler`'s factory builds a fresh
   `McpServer` per request closing over `makeAgentPort(session)`.
4. First `connect()` sets `agentSeen`, pushes a room event
   (*"The intercom crackles. Someone is on the line."*) and broadcasts it.

Because the handler is stateless and the code is in the path, an agent restart re-binds for free —
there is no reconnect path to write and no session map to reap.

> **Pin the code in dev.** With the code in the URL, a fresh code per page-load means re-running
> `claude mcp add` constantly, and `tsx watch` drops in-memory sessions on every server edit.
> Support `EGRESS_DEV_CODE=DEV`: when set, `POST /api/session` always returns that code and
> re-creates the session under it if missing. `http://localhost:8787/mcp/DEV` then works forever.
> This is the difference between a pleasant dev loop and a miserable one.

---

## Long-polling `wait_for_player()`

A promise parked in `session.waiters`, plus a queue so nothing is lost between polls.

```ts
function waitForPlayer(session, signal, timeoutMs = 30_000): Promise<PlayerTurn> {
  if (session.completed) return Promise.resolve({ kind: 'complete' });
  const queued = session.playerQueue.shift();
  if (queued) return Promise.resolve(queued);

  return new Promise(resolve => {
    const waiter = { resolve };
    session.waiters.push(waiter);
    const done = (t: PlayerTurn) => { cleanup(); resolve(t); };
    const timer = setTimeout(() => done({ kind: 'timeout' }), timeoutMs);
    const onAbort = () => done({ kind: 'timeout' });      // client hung up
    signal.addEventListener('abort', onAbort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      remove(session.waiters, waiter);
    };
    waiter.cleanup = cleanup;
  });
}
```

- `POST /api/session/:code/say` → shift a waiter and resolve it; if none, push to `playerQueue`.
- On completion → resolve **all** waiters with `{ kind: 'complete' }` and latch `session.completed`.
- Wire the tool handler's `AbortSignal` through, so a killed agent doesn't leak a 30s timer.

**The timeout text carries the loop instruction.** This is the single highest-leverage detail in
the milestone:

| Result | Text returned to the agent |
|---|---|
| message | `PLAYER: "<verbatim>"` |
| timeout | `No message in the last 30 seconds. The room is not yet solved. Call wait_for_player again now.` |
| complete | `The room is complete. The player is out. Stop calling wait_for_player.` |

Keep the timeout line short — at one poll per 30s it is the dominant consumer of the agent's
context over a 20-minute game.

---

## SSE channel to the browser

`GET /api/events/:code` returns `text/event-stream` via `streamSSE` from `hono/streaming`. The
writer is registered in `session.browsers` and removed on close.

| Event | Payload | Fired by |
|---|---|---|
| `state` | full `PlayerView` | any state change |
| `room` | `{ text }` | diegetic room events, including agent-caused ones |
| `intercom` | `{ from, text }` | player message echo, agent reply |
| `agent` | `{ connected: boolean }` | first `connect()` |

The view is small, so broadcast the whole thing rather than diffing. Send `: keepalive` every 15s.
Browser input is **not** over SSE — plain `POST` returning `204`, with the resulting change
arriving back over the stream. One direction of truth.

On `EventSource` reconnect the page refetches `GET /api/session/:code` for a full resync;
`Last-Event-ID` replay is not worth it here.

---

## What state lives where

| State | Home | Notes |
|---|---|---|
| `RoomSpec` (objects, records, briefing) | `core/`, module constant | Frozen, shared by all sessions |
| `RoomState` | `server` session registry, in memory | Never serialized to the agent |
| Player/agent message logs | Same session object | Also the corpus for `fromPlayer()` |
| Parked `wait_for_player` promises | Same session object | Cleared on message, timeout, abort, completion |
| Rendered view | `web`, Svelte store | Derived only; SSE overwrites it wholesale |
| MCP protocol state | None | Handler is stateless; code in URL |
| Anything on disk | Nothing | No SQLite this milestone |

---

## The Pump room

`core/src/rooms/pumpRoom.ts`.

**Player sees:** a locked breaker panel (6 unlabelled switches); four wall pipes stencilled A, B,
C, D with gauges; a dead keypad by the door; an intercom.

**Chain:**
1. Panel is locked. Only `release_panel_lock()` opens it.
2. Panel open → player flips the six switches → power on → keypad lights, gauge faces readable
   (before power, `inspect` on a pipe returns *"the gauge face is dark"*).
3. Keypad accepts `7319` → door opens → complete.

**Records (static, frozen):**

| Key | Text |
|---|---|
| `schematic:keypad` | Entry order is: primary feed, secondary feed, return line, overflow line. |
| `schematic:pipes` | A = primary. B = secondary. C = return. D = overflow. |
| `work_orders:pipes` | WO-2291 (1994): return and overflow lines swapped at the manifold; wall stencils never updated. |
| `maintenance_log:pipes` | Recurring misidentification at the manifold; see outstanding work orders. |
| `maintenance_log:keypad` | Keypad is on the lighting circuit. Dead until the panel is energised. |

Unknown subjects return `No record found for "<subject>".` — the agent should be able to feel the
edges of the archive.

**Arithmetic check.** Gauges A=7, B=3, C=9, D=1. Schematic alone → primary(A=7), secondary(B=3),
return(C=9), overflow(D=1) = **7391**, wrong. Applying WO-2291, the pipe stencilled D is the real
return and the pipe stencilled C is the real overflow → 7, 3, 1, 9 = **7319**. ✓

Neither side can get there alone: the agent has the ordering and the correction but cannot see the
letters or the numbers; the player can read the letters and numbers but has no ordering rule.

Wrong entry → lockout, keypad dark, room event *"The keypad flashes red and goes dark."*

---

## Build order

Each step ends in something runnable.

**1 — Skeleton + the loop, vertically. This is the gate.**
Workspaces, tsconfig, Hono + `@hono/node-server`, session registry with `EGRESS_DEV_CODE`, SSE,
`POST /say`, and an MCP server exposing **only** `connect`, `wait_for_player`, `reply_to_player`,
plus the loop prompt. `web/` is the intercom input and message log, nothing else. No room objects,
no records, no panel.
*Then test against real Claude Code for 15+ minutes*: does it keep polling across timeouts, across
long idle gaps, after 20+ exchanges, without being re-prodded? Tune the poll interval and the
timeout wording here, before anything is built on top.

**2 — Room model in `core/`, unit tested.** Types, `RecordStore`, `applyAction`, `playerView`,
`pumpRoom`. Pure functions, vitest, no server involvement. Cover: gauges unreadable without power,
lockout expiry against injected `now`, `7391` rejected, `7319` accepted, `open_panel` idempotent.

**3 — Wire the room to the browser.** Object list, action buttons, room log, gauge inspection,
keypad entry. At the end of this step the room is fully playable and **provably unsolvable alone**
— the panel has no player-reachable opening action. Good moment to hand it to someone cold.

**4 — Record tools + `release_panel_lock` + the leak guard.** `query_schematic`,
`query_work_orders`, `query_maintenance_log`, `release_panel_lock`. Add `AgentSafeText`, the
corpus assertions, the ESLint import restriction, and the leaky-tool test. The chain now closes.

**5 — End-to-end playtest.** Full solve with a real agent and a real human who has not seen the
records.

---

## Manual end-to-end test

```bash
npm run dev                        # vite :5173 + hono :8787
EGRESS_DEV_CODE=DEV npm run dev    # pinned code, recommended while iterating
```

1. Open `http://localhost:5173`. Note the code and the paste-ready command.
2. In a separate terminal, in any directory:
   `claude mcp add --transport http egress http://localhost:8787/mcp/DEV`
3. `claude`, then `/mcp` to confirm the server is connected and the tools are listed.
4. Run the prompt (`/egress:play` or whatever it registers as). The browser should immediately log
   *"The intercom crackles."*
5. Type into the intercom. The agent's reply should appear within a second or two.
6. **Loop test:** say nothing for five minutes. Watch the agent's transcript — it should be quietly
   cycling `wait_for_player`. Then type again; it must respond without being nudged.
7. **Leak test:** ask the agent directly — *"what do the gauges read? which switches are up? where
   am I standing?"* It must have no way to answer. Grep the server log for any tool payload
   containing a gauge digit that did not originate from a player message.
8. **Solve:** ask the agent for the entry order; give it the stencil letters and gauge readings; it
   should query pipes + work orders, catch WO-2291, and return `7319`.
9. **Failure paths:** enter `7391` (lockout, 30s, no other penalty); kill and restart Claude Code
   mid-game (same URL, must rebind and resume); reload the browser (state intact via
   `sessionStorage` + resync).

Automated: `npm test` runs core reducer tests, the record-store tests, the long-poll tests
(queue / timeout / abort / completion-wakes-all-waiters), and the leak-guard test.

---

## Things in this design I think will bite

1. **The MCP prompt is user-invoked, not automatic.** Claude Code surfaces prompts as slash
   commands the *player* must type. If they instead just say "connect to the room", the agent never
   receives the loop instruction and the whole thing fizzles. Mitigation: have `connect()`'s
   **return value** restate the loop instruction verbatim, so the loop is established no matter how
   the session starts. Cheap; do it in step 1.

2. **The 30s poll is a context tax.** Forty-plus timeout results over a 20-minute game, each one a
   tool call and result in the agent's transcript. Keep the timeout string to one line, and test
   whether 50–55s works — Claude Code's default MCP tool timeout is 60s, so there is headroom, and
   it nearly halves the churn. Worth measuring in step 1 rather than assuming 30s.

3. **`release_panel_lock` is a state-read if you let it be.** Returning "already unlocked" on the
   second call tells the agent the panel's prior state. Make it idempotent with one fixed
   acknowledgement string. Same class of leak: `wait_for_player` returning instantly vs. timing out
   leaks whether the player is currently active. That one is unavoidable and harmless, but be aware
   the "no live state" property is about *room* state, not about *nothing at all* — worth writing
   down so the boundary stays clear as more rooms are added.

4. **Six unlabelled switches imply a puzzle you have not specified.** Your chain has three steps and
   the switches carry none of them. I have assumed *all six up = power on*, no hidden combination.
   Six unlabelled switches will make playtesters hunt for a combination that does not exist — either
   accept that as a deliberate red herring, cut it to a single main breaker, or make the correct
   subset something the agent finds in a record (the natural place to add a second agent-dependent
   beat later).

5. **The 30s keypad lockout equals the 30s poll interval.** Two unrelated 30s timers will make
   debugging genuinely confusing — *is it locked out, or is the agent just mid-poll?* Make them
   visibly different; 20s lockout costs nothing.

6. **In-memory sessions + `tsx watch` = the game dies on every server edit,** and with the code in
   the URL that means re-pairing the agent. `EGRESS_DEV_CODE` is the fix and should land in step 1,
   not be retrofitted.

7. **Two input channels into one session.** The player both types and clicks. If they flip a switch
   and send a message in the same breath, the agent sees only the message — correct, but it means
   the room log and the intercom log must be visually distinct or players will assume the agent can
   see the room after all. This is the one place where UI sloppiness would undermine the core
   premise.
