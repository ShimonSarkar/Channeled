import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../data/todo.db');
if (!existsSync(dirname(dbPath))) mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS workstreams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    position INTEGER NOT NULL,
    is_misc INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_workstream ON tasks(workstream_id, position);
  CREATE INDEX IF NOT EXISTS idx_tasks_today ON tasks(today_flag, today_position);
`);

// Lightweight migration: add deleted_at if missing
const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
if (!taskCols.some((c) => c.name === 'deleted_at')) {
  db.exec(`ALTER TABLE tasks ADD COLUMN deleted_at TEXT`);
}
if (!taskCols.some((c) => c.name === 'subtasks')) {
  db.exec(`ALTER TABLE tasks ADD COLUMN subtasks TEXT NOT NULL DEFAULT '[]'`);
}

// Lightweight migration: add notes column to workstreams if missing
const wsCols = db.prepare("PRAGMA table_info(workstreams)").all() as { name: string }[];
if (!wsCols.some((c) => c.name === 'notes')) {
  db.exec(`ALTER TABLE workstreams ADD COLUMN notes TEXT NOT NULL DEFAULT ''`);
}

// Seed Misc workstream once
const miscRow = db.prepare("SELECT id FROM workstreams WHERE is_misc = 1").get() as { id: string } | undefined;
if (!miscRow) {
  db.prepare(
    `INSERT INTO workstreams (id, name, color, position, is_misc) VALUES (?, 'Misc', '#9CA3AF', 0, 1)`
  ).run(nanoid());
}

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
  subtasks: string;
};

export type Subtask = { id: string; title: string; done: boolean };

export function serializeTask(row: TaskRow) {
  let subtasks: Subtask[] = [];
  try {
    const parsed = JSON.parse(row.subtasks ?? '[]');
    if (Array.isArray(parsed)) subtasks = parsed;
  } catch { /* ignore */ }
  return { ...row, subtasks };
}
