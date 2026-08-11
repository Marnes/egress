import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const roomStateSchema = z.object({
  lightsOn: z.boolean(),
  panelLocked: z.boolean(),
  switches: z.array(z.boolean()),
  powerOn: z.boolean(),
  gaugeWashStarted: z.boolean().default(false),
  doorOpen: z.boolean(),
  valveOpen: z.boolean(),
  pumpRunning: z.boolean(),
  pumpWindowUntil: z.number().nullable().default(null),
  sumpMm: z.number(),
  pumpingSince: z.number().nullable()
});

const storedSessionSchema = z.object({
  schemaVersion: z.literal(1),
  roomId: z.literal('pump-room'),
  state: roomStateSchema,
  playerQueue: z.array(
    z.union([
      z.string(),
      z.object({ kind: z.literal('player'), text: z.string() }),
      z.object({ kind: z.literal('choice'), choiceId: z.string(), optionId: z.string() }),
      z.object({ kind: z.literal('power_on_alert') })
    ])
  ),
  playerMessages: z.array(z.string()),
  roomLog: z.array(z.string()),
  intercomLog: z.array(
    z.object({
      from: z.enum(['player', 'agent']),
      text: z.string(),
      choice: z
        .object({
          id: z.string(),
          options: z.array(z.object({ id: z.string(), label: z.string() })),
          selectedOptionId: z.string().nullable()
        })
        .optional()
    })
  ),
  agentSeen: z.boolean(),
  completed: z.boolean()
});

export type StoredSession = z.infer<typeof storedSessionSchema>;

let database: DatabaseSync | undefined;

function databasePath(): string {
  if (process.env.EGRESS_DB_PATH === ':memory:') return ':memory:';
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return ':memory:';
  return resolve(process.env.EGRESS_DB_PATH ?? 'egress.sqlite');
}

function db(): DatabaseSync {
  if (database) return database;

  const path = databasePath();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  database = new DatabaseSync(path);
  database.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') database.exec('PRAGMA journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      snapshot TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  return database;
}

export function loadStoredSession(sessionId: string): StoredSession | undefined {
  const row = db().prepare('SELECT snapshot FROM sessions WHERE id = ?').get(sessionId) as
    | { snapshot: string }
    | undefined;
  if (!row) return undefined;
  return storedSessionSchema.parse(JSON.parse(row.snapshot));
}

export function saveStoredSession(sessionId: string, snapshot: StoredSession): void {
  const now = Date.now();
  db()
    .prepare(`
      INSERT INTO sessions (id, snapshot, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        snapshot = excluded.snapshot,
        updated_at = excluded.updated_at
    `)
    .run(sessionId, JSON.stringify(snapshot), now, now);
}

export function clearStoredSessions(): void {
  db().exec('DELETE FROM sessions');
}
