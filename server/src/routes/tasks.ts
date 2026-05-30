import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db, serializeTask, type TaskRow } from '../db.js';
import { createTaskSchema, updateTaskSchema, reorderTasksSchema } from '../schema.js';

export const tasksRouter = Router();

function loadTask(id: string) {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  return row ? serializeTask(row) : undefined;
}

function getMiscId(): string {
  const row = db.prepare('SELECT id FROM workstreams WHERE is_misc = 1').get() as { id: string };
  return row.id;
}

function nextWorkstreamPosition(workstreamId: string): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(position), -1) as m FROM tasks WHERE workstream_id = ?')
    .get(workstreamId) as { m: number };
  return row.m + 1;
}

function nextTodayPosition(): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(today_position), -1) as m FROM tasks WHERE today_flag = 1')
    .get() as { m: number };
  return row.m + 1;
}

tasksRouter.post('/', (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const workstreamId = parsed.data.workstreamId ?? getMiscId();
  const ws = db.prepare('SELECT id FROM workstreams WHERE id = ?').get(workstreamId);
  if (!ws) return res.status(400).json({ error: 'invalid_workstream' });

  const id = nanoid();
  const position = nextWorkstreamPosition(workstreamId);
  const today = parsed.data.today ? 1 : 0;
  const todayPosition = today ? nextTodayPosition() : null;
  const status = parsed.data.status ?? 'not_started';
  const completedAt = status === 'done' ? new Date().toISOString() : null;

  db.prepare(
    `INSERT INTO tasks (id, workstream_id, title, notes, due_date, status, position, today_flag, today_position, completed_at, subtasks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    workstreamId,
    parsed.data.title,
    parsed.data.notes ?? '',
    parsed.data.dueDate ?? null,
    status,
    position,
    today,
    todayPosition,
    completedAt,
    JSON.stringify(parsed.data.subtasks ?? [])
  );
  res.status(201).json(loadTask(id));
});

tasksRouter.patch('/:id', (req, res) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as TaskRow | undefined;
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const next = {
    workstream_id: parsed.data.workstreamId ?? existing.workstream_id,
    title: parsed.data.title ?? existing.title,
    notes: parsed.data.notes ?? existing.notes,
    due_date: parsed.data.dueDate === undefined ? existing.due_date : parsed.data.dueDate,
    status: parsed.data.status ?? existing.status,
    today_flag: parsed.data.today === undefined ? existing.today_flag : parsed.data.today ? 1 : 0,
    today_position: existing.today_position,
    completed_at: existing.completed_at,
  };

  if (parsed.data.workstreamId && parsed.data.workstreamId !== existing.workstream_id) {
    const ws = db.prepare('SELECT id FROM workstreams WHERE id = ?').get(parsed.data.workstreamId);
    if (!ws) return res.status(400).json({ error: 'invalid_workstream' });
  }

  // If today toggled
  if (parsed.data.today !== undefined) {
    if (parsed.data.today && !existing.today_flag) {
      next.today_position = nextTodayPosition();
    } else if (!parsed.data.today && existing.today_flag) {
      next.today_position = null;
    }
  }

  // If status changed — status is now just a label, never auto-completes a task.
  // Completion is controlled exclusively by the `completed` flag.
  if (parsed.data.completed !== undefined) {
    if (parsed.data.completed) {
      next.completed_at = new Date().toISOString();
      next.status = 'done';
      // remove from today when completed
      next.today_flag = 0;
      next.today_position = null;
    } else {
      next.completed_at = null;
      // when un-completing, reset a 'done' label back to 'not_started'
      if (next.status === 'done') next.status = 'not_started';
    }
  }

  // If workstream changed, recompute position at the end of new workstream
  let newPosition = existing.position;
  if (parsed.data.workstreamId && parsed.data.workstreamId !== existing.workstream_id) {
    newPosition = nextWorkstreamPosition(parsed.data.workstreamId);
  }

  db.prepare(
    `UPDATE tasks SET workstream_id = ?, title = ?, notes = ?, due_date = ?, status = ?,
      position = ?, today_flag = ?, today_position = ?, completed_at = ?, subtasks = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    next.workstream_id,
    next.title,
    next.notes,
    next.due_date,
    next.status,
    newPosition,
    next.today_flag,
    next.today_position,
    next.completed_at,
    parsed.data.subtasks !== undefined ? JSON.stringify(parsed.data.subtasks) : existing.subtasks,
    req.params.id
  );
  res.json(loadTask(req.params.id));
});

tasksRouter.delete('/:id', (req, res) => {
  // Soft delete: move to trash and clear today flag
  const existing = db.prepare('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  db.prepare(
    `UPDATE tasks SET deleted_at = datetime('now'), today_flag = 0, today_position = NULL WHERE id = ?`
  ).run(req.params.id);
  res.status(204).end();
});

tasksRouter.post('/:id/restore', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NOT NULL').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  // Restore to end of its workstream
  const t = existing as { workstream_id: string };
  const pos = nextWorkstreamPosition(t.workstream_id);
  db.prepare('UPDATE tasks SET deleted_at = NULL, position = ? WHERE id = ?').run(pos, req.params.id);
  res.json(loadTask(req.params.id));
});

tasksRouter.delete('/:id/permanent', (req, res) => {
  const r = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

tasksRouter.post('/trash/empty', (_req, res) => {
  db.prepare('DELETE FROM tasks WHERE deleted_at IS NOT NULL').run();
  res.status(204).end();
});

tasksRouter.post('/reorder', (req, res) => {
  const parsed = reorderTasksSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.scope === 'workstream') {
    if (parsed.data.workstreamId) {
      const ws = db.prepare('SELECT id FROM workstreams WHERE id = ?').get(parsed.data.workstreamId);
      if (!ws) return res.status(400).json({ error: 'invalid_workstream' });
      const wsId = parsed.data.workstreamId;
      const update = db.prepare('UPDATE tasks SET position = ?, workstream_id = ? WHERE id = ?');
      const tx = db.transaction((ids: string[]) => ids.forEach((id, i) => update.run(i, wsId, id)));
      tx(parsed.data.orderedIds);
    } else {
      const update = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
      const tx = db.transaction((ids: string[]) => ids.forEach((id, i) => update.run(i, id)));
      tx(parsed.data.orderedIds);
    }
  } else {
    const update = db.prepare('UPDATE tasks SET today_position = ?, today_flag = 1 WHERE id = ?');
    const tx = db.transaction((ids: string[]) => ids.forEach((id, i) => update.run(i, id)));
    tx(parsed.data.orderedIds);
  }
  res.status(204).end();
});
