import pg from 'pg';
import { nanoid } from 'nanoid';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Provide a Postgres connection string (e.g. postgres://user:pass@host:5432/dbname).'
  );
}

// Render's managed Postgres requires SSL. Allow opting out for local dev via PGSSL=disable.
const useSsl = (process.env.PGSSL ?? 'require') !== 'disable';

export const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

export type QueryResultRow = Record<string, unknown>;

export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params as never);
}

export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// SQLite-compatible timestamp literal: "YYYY-MM-DD HH:MM:SS" in UTC.
// Keeps the wire format stable for the existing client.
export const NOW_SQL = `to_char((now() at time zone 'utc'), 'YYYY-MM-DD HH24:MI:SS')`;

export type WorkstreamRow = {
  id: string;
  name: string;
  color: string;
  position: number;
  is_misc: number;
  notes: string;
  created_at: string;
};

export type TaskRow = {
  id: string;
  workstream_id: string;
  title: string;
  notes: string;
  due_date: string | null;
  status: 'not_started' | 'in_progress' | 'blocked' | 'done';
  position: number;
  today_flag: number;
  today_position: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  subtasks: string | unknown[];
};

export type Subtask = { id: string; title: string; done: boolean };

export function serializeTask(row: TaskRow) {
  let subtasks: Subtask[] = [];
  const raw = row.subtasks;
  if (Array.isArray(raw)) {
    subtasks = raw as Subtask[];
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) subtasks = parsed;
    } catch {
      /* ignore */
    }
  }
  return { ...row, subtasks };
}

export async function initDb() {
  // Base schema. Booleans are kept as INT 0/1 to match the existing client wire format.
  await q(`
    CREATE TABLE IF NOT EXISTS workstreams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_misc INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ${NOW_SQL}
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      workstream_id TEXT NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started','in_progress','blocked','done')),
      position INTEGER NOT NULL,
      today_flag INTEGER NOT NULL DEFAULT 0,
      today_position INTEGER,
      completed_at TEXT,
      deleted_at TEXT,
      subtasks TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT ${NOW_SQL},
      updated_at TEXT NOT NULL DEFAULT ${NOW_SQL}
    );
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_tasks_workstream ON tasks(workstream_id, position);`);
  await q(`CREATE INDEX IF NOT EXISTS idx_tasks_today ON tasks(today_flag, today_position);`);

  // Forward-compatible column additions (in case an older deployment ran first).
  await q(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TEXT;`);
  await q(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtasks TEXT NOT NULL DEFAULT '[]';`);
  await q(`ALTER TABLE workstreams ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';`);

  // Seed Misc workstream once.
  const misc = await q<{ id: string }>(`SELECT id FROM workstreams WHERE is_misc = 1 LIMIT 1`);
  if (misc.rows.length === 0) {
    await q(
      `INSERT INTO workstreams (id, name, color, position, is_misc) VALUES ($1, 'Misc', '#9CA3AF', 0, 1)`,
      [nanoid()]
    );
  }
}
