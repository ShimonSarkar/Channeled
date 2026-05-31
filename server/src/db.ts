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
export const NOW_SQL = `to_char((now() at time zone 'utc'), 'YYYY-MM-DD HH24:MI:SS')`;

export type WorkspaceRow = {
  id: string;
  name: string;
  position: number;
  user_id: string | null;
  created_at: string;
};

export type UserRow = {
  id: string;
  google_id: string;
  email: string;
  name: string;
  picture: string;
  created_at: string;
};

export type WorkstreamRow = {
  id: string;
  workspace_id: string;
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

/** Create a Misc workstream inside a workspace. Returns its id. */
export async function ensureMiscForWorkspace(workspaceId: string): Promise<string> {
  const existing = (
    await q<{ id: string }>(
      `SELECT id FROM workstreams WHERE workspace_id = $1 AND is_misc = 1 LIMIT 1`,
      [workspaceId]
    )
  ).rows[0];
  if (existing) return existing.id;

  const id = nanoid();
  await q(
    `INSERT INTO workstreams (id, workspace_id, name, color, position, is_misc)
     VALUES ($1, $2, 'Misc', '#9CA3AF', 0, 1)`,
    [id, workspaceId]
  );
  return id;
}

export async function initDb() {
  // ---- session (express-session via connect-pg-simple) ----
  // We create this explicitly instead of relying on connect-pg-simple's
  // `createTableIfMissing` because that option silently fails to provision
  // the table in some environments, causing every login to round-trip back
  // to the sign-in screen (passport.session() can never persist the user).
  await q(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid"    varchar      NOT NULL COLLATE "default",
      "sess"   json         NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    );
  `);
  await q(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);

  // ---- users ----
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      picture TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ${NOW_SQL}
    );
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

  // ---- workspaces ----
  await q(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      user_id TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW_SQL}
    );
  `);
  await q(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS user_id TEXT;`);
  await q(`CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id, position);`);
  // Add FK only if it isn't already present.
  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_user_id_fkey'
      ) THEN
        ALTER TABLE workspaces
          ADD CONSTRAINT workspaces_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);

  // ---- workstreams ----
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

  // ---- tasks ----
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

  // Forward-compatible columns (in case an older schema was created first).
  await q(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TEXT;`);
  await q(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtasks TEXT NOT NULL DEFAULT '[]';`);
  await q(`ALTER TABLE workstreams ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';`);

  // ---- migration: add workspace_id to workstreams + backfill ----
  await q(`ALTER TABLE workstreams ADD COLUMN IF NOT EXISTS workspace_id TEXT;`);
  await q(
    `CREATE INDEX IF NOT EXISTS idx_workstreams_workspace ON workstreams(workspace_id, position);`
  );

  // If any workstreams are missing a workspace_id, create / pick a default workspace
  // and backfill them. This handles upgrades from the pre-workspaces schema.
  const orphanCount = (
    await q<{ c: string }>(`SELECT COUNT(*)::text as c FROM workstreams WHERE workspace_id IS NULL`)
  ).rows[0];
  if (Number(orphanCount?.c ?? 0) > 0) {
    let defaultWs = (
      await q<{ id: string }>(`SELECT id FROM workspaces ORDER BY position ASC LIMIT 1`)
    ).rows[0];
    if (!defaultWs) {
      const id = nanoid();
      await q(`INSERT INTO workspaces (id, name, position) VALUES ($1, 'Personal', 0)`, [id]);
      defaultWs = { id };
    }
    await q(`UPDATE workstreams SET workspace_id = $1 WHERE workspace_id IS NULL`, [defaultWs.id]);
  }

  // Now enforce NOT NULL + FK on workspace_id (idempotent on Postgres).
  await q(`ALTER TABLE workstreams ALTER COLUMN workspace_id SET NOT NULL;`);
  // Add FK only if it isn't already present.
  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'workstreams_workspace_id_fkey'
      ) THEN
        ALTER TABLE workstreams
          ADD CONSTRAINT workstreams_workspace_id_fkey
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);

  // ---- seed: per-user seeding happens in ensureUserHasWorkspace on first /api/state. ----
}

/**
 * Ensure the given user has at least one workspace (with a Misc workstream).
 * Returns the user's first workspace id by position.
 */
export async function ensureUserHasWorkspace(userId: string): Promise<string> {
  let first = (
    await q<{ id: string }>(
      `SELECT id FROM workspaces WHERE user_id = $1 ORDER BY position ASC LIMIT 1`,
      [userId]
    )
  ).rows[0];
  if (!first) {
    const id = nanoid();
    await q(
      `INSERT INTO workspaces (id, name, position, user_id) VALUES ($1, 'Personal', 0, $2)`,
      [id, userId]
    );
    first = { id };
  }
  await ensureMiscForWorkspace(first.id);
  return first.id;
}

/**
 * One-time backfill: assign all workspaces with NULL user_id to the given user.
 * Used when a designated email logs in for the first time so existing data is preserved.
 */
export async function backfillOrphanWorkspaces(userId: string): Promise<number> {
  const result = await q(
    `UPDATE workspaces SET user_id = $1 WHERE user_id IS NULL`,
    [userId]
  );
  return result.rowCount ?? 0;
}

export async function findOrCreateUserByGoogle(profile: {
  googleId: string;
  email: string;
  name: string;
  picture: string;
}): Promise<UserRow> {
  const existing = (
    await q<UserRow>(`SELECT * FROM users WHERE google_id = $1`, [profile.googleId])
  ).rows[0];
  if (existing) {
    // Refresh email/name/picture in case it changed.
    if (
      existing.email !== profile.email ||
      existing.name !== profile.name ||
      existing.picture !== profile.picture
    ) {
      await q(
        `UPDATE users SET email = $1, name = $2, picture = $3 WHERE id = $4`,
        [profile.email, profile.name, profile.picture, existing.id]
      );
      return { ...existing, email: profile.email, name: profile.name, picture: profile.picture };
    }
    return existing;
  }
  const id = nanoid();
  await q(
    `INSERT INTO users (id, google_id, email, name, picture) VALUES ($1, $2, $3, $4, $5)`,
    [id, profile.googleId, profile.email, profile.name, profile.picture]
  );
  const created = (await q<UserRow>(`SELECT * FROM users WHERE id = $1`, [id])).rows[0];
  return created;
}
