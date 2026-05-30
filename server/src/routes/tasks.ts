import { Router } from 'express';
import { nanoid } from 'nanoid';
import {
  q,
  withTx,
  serializeTask,
  ensureMiscForWorkspace,
  NOW_SQL,
  type TaskRow,
  type UserRow,
} from '../db.js';
import { createTaskSchema, updateTaskSchema, reorderTasksSchema } from '../schema.js';

export const tasksRouter = Router();

function userId(req: { user?: UserRow }): string {
  return (req.user as UserRow).id;
}

/**
 * Load a task by id only if it belongs (transitively) to the given user.
 * Joins via workstream → workspace.user_id so cross-user access is impossible.
 */
async function loadOwnedTaskRow(id: string, uid: string): Promise<TaskRow | null> {
  const row = (
    await q<TaskRow>(
      `SELECT t.*
       FROM tasks t
       JOIN workstreams ws ON ws.id = t.workstream_id
       JOIN workspaces w ON w.id = ws.workspace_id
       WHERE t.id = $1 AND w.user_id = $2`,
      [id, uid]
    )
  ).rows[0];
  return row ?? null;
}

async function loadOwnedTask(id: string, uid: string) {
  const row = await loadOwnedTaskRow(id, uid);
  return row ? serializeTask(row) : undefined;
}

async function workstreamBelongsToUser(workstreamId: string, uid: string): Promise<boolean> {
  const row = (
    await q<{ id: string }>(
      `SELECT ws.id FROM workstreams ws
       JOIN workspaces w ON w.id = ws.workspace_id
       WHERE ws.id = $1 AND w.user_id = $2`,
      [workstreamId, uid]
    )
  ).rows[0];
  return !!row;
}

async function workspaceBelongsToUser(workspaceId: string, uid: string): Promise<boolean> {
  const row = (
    await q<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = $1 AND user_id = $2`,
      [workspaceId, uid]
    )
  ).rows[0];
  return !!row;
}

/**
 * Resolve the Misc workstream to drop a task into when no workstream is supplied.
 * Always scoped to the current user.
 */
async function resolveMiscForCreate(
  workspaceId: string | undefined,
  uid: string
): Promise<string | null> {
  if (workspaceId) {
    if (!(await workspaceBelongsToUser(workspaceId, uid))) return null;
    return ensureMiscForWorkspace(workspaceId);
  }
  const first = (
    await q<{ id: string }>(
      'SELECT id FROM workspaces WHERE user_id = $1 ORDER BY position ASC LIMIT 1',
      [uid]
    )
  ).rows[0];
  if (!first) return null;
  return ensureMiscForWorkspace(first.id);
}

async function nextWorkstreamPosition(workstreamId: string): Promise<number> {
  const row = (
    await q<{ m: number }>(
      'SELECT COALESCE(MAX(position), -1) as m FROM tasks WHERE workstream_id = $1',
      [workstreamId]
    )
  ).rows[0];
  return row.m + 1;
}

/** Today list is per-user; only count this user's tasks. */
async function nextTodayPosition(uid: string): Promise<number> {
  const row = (
    await q<{ m: number }>(
      `SELECT COALESCE(MAX(t.today_position), -1) as m
       FROM tasks t
       JOIN workstreams ws ON ws.id = t.workstream_id
       JOIN workspaces w ON w.id = ws.workspace_id
       WHERE t.today_flag = 1 AND w.user_id = $1`,
      [uid]
    )
  ).rows[0];
  return row.m + 1;
}

tasksRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const uid = userId(req);
    let workstreamId = parsed.data.workstreamId;
    if (!workstreamId) {
      const misc = await resolveMiscForCreate(parsed.data.workspaceId, uid);
      if (!misc) return res.status(400).json({ error: 'invalid_workspace' });
      workstreamId = misc;
    } else if (!(await workstreamBelongsToUser(workstreamId, uid))) {
      return res.status(400).json({ error: 'invalid_workstream' });
    }

    const id = nanoid();
    const position = await nextWorkstreamPosition(workstreamId);
    const today = parsed.data.today ? 1 : 0;
    const todayPosition = today ? await nextTodayPosition(uid) : null;
    const status = parsed.data.status ?? 'not_started';
    const completedAt = status === 'done' ? new Date().toISOString() : null;

    await q(
      `INSERT INTO tasks (id, workstream_id, title, notes, due_date, status, position, today_flag, today_position, completed_at, subtasks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
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
        JSON.stringify(parsed.data.subtasks ?? []),
      ]
    );
    res.status(201).json(await loadOwnedTask(id, uid));
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const uid = userId(req);
    const existing = await loadOwnedTaskRow(req.params.id, uid);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const next_ = {
      workstream_id: parsed.data.workstreamId ?? existing.workstream_id,
      title: parsed.data.title ?? existing.title,
      notes: parsed.data.notes ?? existing.notes,
      due_date: parsed.data.dueDate === undefined ? existing.due_date : parsed.data.dueDate,
      status: parsed.data.status ?? existing.status,
      today_flag:
        parsed.data.today === undefined ? existing.today_flag : parsed.data.today ? 1 : 0,
      today_position: existing.today_position,
      completed_at: existing.completed_at,
    };

    if (parsed.data.workstreamId && parsed.data.workstreamId !== existing.workstream_id) {
      if (!(await workstreamBelongsToUser(parsed.data.workstreamId, uid))) {
        return res.status(400).json({ error: 'invalid_workstream' });
      }
    }

    // If today toggled
    if (parsed.data.today !== undefined) {
      if (parsed.data.today && !existing.today_flag) {
        next_.today_position = await nextTodayPosition(uid);
      } else if (!parsed.data.today && existing.today_flag) {
        next_.today_position = null;
      }
    }

    // Status is just a label; completion is controlled exclusively by `completed`.
    if (parsed.data.completed !== undefined) {
      if (parsed.data.completed) {
        next_.completed_at = new Date().toISOString();
        next_.status = 'done';
        next_.today_flag = 0;
        next_.today_position = null;
      } else {
        next_.completed_at = null;
        if (next_.status === 'done') next_.status = 'not_started';
      }
    }

    // If workstream changed, recompute position at the end of new workstream.
    let newPosition = existing.position;
    if (parsed.data.workstreamId && parsed.data.workstreamId !== existing.workstream_id) {
      newPosition = await nextWorkstreamPosition(parsed.data.workstreamId);
    }

    const subtasksValue =
      parsed.data.subtasks !== undefined
        ? JSON.stringify(parsed.data.subtasks)
        : typeof existing.subtasks === 'string'
        ? existing.subtasks
        : JSON.stringify(existing.subtasks ?? []);

    await q(
      `UPDATE tasks SET workstream_id = $1, title = $2, notes = $3, due_date = $4, status = $5,
        position = $6, today_flag = $7, today_position = $8, completed_at = $9, subtasks = $10,
        updated_at = ${NOW_SQL}
       WHERE id = $11`,
      [
        next_.workstream_id,
        next_.title,
        next_.notes,
        next_.due_date,
        next_.status,
        newPosition,
        next_.today_flag,
        next_.today_position,
        next_.completed_at,
        subtasksValue,
        req.params.id,
      ]
    );
    res.json(await loadOwnedTask(req.params.id, uid));
  } catch (err) {
    next(err);
  }
});

tasksRouter.delete('/:id', async (req, res, next) => {
  try {
    const uid = userId(req);
    const existing = await loadOwnedTaskRow(req.params.id, uid);
    if (!existing || existing.deleted_at) return res.status(404).json({ error: 'not_found' });
    await q(
      `UPDATE tasks SET deleted_at = ${NOW_SQL}, today_flag = 0, today_position = NULL WHERE id = $1`,
      [req.params.id]
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

tasksRouter.post('/:id/restore', async (req, res, next) => {
  try {
    const uid = userId(req);
    const existing = await loadOwnedTaskRow(req.params.id, uid);
    if (!existing || !existing.deleted_at) return res.status(404).json({ error: 'not_found' });
    const pos = await nextWorkstreamPosition(existing.workstream_id);
    await q('UPDATE tasks SET deleted_at = NULL, position = $1 WHERE id = $2', [
      pos,
      req.params.id,
    ]);
    res.json(await loadOwnedTask(req.params.id, uid));
  } catch (err) {
    next(err);
  }
});

tasksRouter.delete('/:id/permanent', async (req, res, next) => {
  try {
    const uid = userId(req);
    const existing = await loadOwnedTaskRow(req.params.id, uid);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    await q('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

tasksRouter.post('/trash/empty', async (req, res, next) => {
  try {
    const uid = userId(req);
    // Only empty trash belonging to the calling user.
    await q(
      `DELETE FROM tasks
       WHERE deleted_at IS NOT NULL
         AND workstream_id IN (
           SELECT ws.id FROM workstreams ws
           JOIN workspaces w ON w.id = ws.workspace_id
           WHERE w.user_id = $1
         )`,
      [uid]
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

tasksRouter.post('/reorder', async (req, res, next) => {
  try {
    const parsed = reorderTasksSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const uid = userId(req);
    // Filter the ordered list to only ids the user owns. This both prevents
    // tampering and avoids ownership errors leaking via 4xx.
    const owned = new Set(
      (
        await q<{ id: string }>(
          `SELECT t.id FROM tasks t
           JOIN workstreams ws ON ws.id = t.workstream_id
           JOIN workspaces w ON w.id = ws.workspace_id
           WHERE w.user_id = $1 AND t.id = ANY($2::text[])`,
          [uid, parsed.data.orderedIds]
        )
      ).rows.map((r) => r.id)
    );
    const orderedIds = parsed.data.orderedIds.filter((id) => owned.has(id));

    if (parsed.data.scope === 'workstream') {
      if (parsed.data.workstreamId) {
        if (!(await workstreamBelongsToUser(parsed.data.workstreamId, uid))) {
          return res.status(400).json({ error: 'invalid_workstream' });
        }
        const wsId = parsed.data.workstreamId;
        await withTx(async (client) => {
          for (let i = 0; i < orderedIds.length; i++) {
            await client.query(
              'UPDATE tasks SET position = $1, workstream_id = $2 WHERE id = $3',
              [i, wsId, orderedIds[i]]
            );
          }
        });
      } else {
        await withTx(async (client) => {
          for (let i = 0; i < orderedIds.length; i++) {
            await client.query('UPDATE tasks SET position = $1 WHERE id = $2', [
              i,
              orderedIds[i],
            ]);
          }
        });
      }
    } else {
      await withTx(async (client) => {
        for (let i = 0; i < orderedIds.length; i++) {
          await client.query(
            'UPDATE tasks SET today_position = $1, today_flag = 1 WHERE id = $2',
            [i, orderedIds[i]]
          );
        }
      });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
