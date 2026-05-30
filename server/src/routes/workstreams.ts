import { Router } from 'express';
import { nanoid } from 'nanoid';
import { q, withTx, type UserRow, type WorkstreamRow } from '../db.js';
import { createWorkstreamSchema, updateWorkstreamSchema, reorderSchema } from '../schema.js';

export const workstreamsRouter = Router();

function userId(req: { user?: UserRow }): string {
  return (req.user as UserRow).id;
}

/**
 * Load a workstream by id only if it belongs to a workspace owned by `uid`.
 * Returns null otherwise (caller responds 404 to avoid leaking existence).
 */
async function loadOwnedWorkstream(id: string, uid: string): Promise<WorkstreamRow | null> {
  const row = (
    await q<WorkstreamRow>(
      `SELECT ws.*
       FROM workstreams ws
       JOIN workspaces w ON w.id = ws.workspace_id
       WHERE ws.id = $1 AND w.user_id = $2`,
      [id, uid]
    )
  ).rows[0];
  return row ?? null;
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

workstreamsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createWorkstreamSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const uid = userId(req);
    // Resolve target workspace (explicit, or first by position for this user).
    let workspaceId = parsed.data.workspaceId;
    if (!workspaceId) {
      const ws = (
        await q<{ id: string }>(
          `SELECT id FROM workspaces WHERE user_id = $1 ORDER BY position ASC LIMIT 1`,
          [uid]
        )
      ).rows[0];
      if (!ws) return res.status(400).json({ error: 'no_workspace' });
      workspaceId = ws.id;
    } else if (!(await workspaceBelongsToUser(workspaceId, uid))) {
      return res.status(400).json({ error: 'invalid_workspace' });
    }

    const maxRow = (
      await q<{ m: number }>(
        'SELECT COALESCE(MAX(position), -1) as m FROM workstreams WHERE workspace_id = $1',
        [workspaceId]
      )
    ).rows[0];
    const id = nanoid();
    await q(
      'INSERT INTO workstreams (id, workspace_id, name, color, position, notes) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, workspaceId, parsed.data.name, parsed.data.color, maxRow.m + 1, parsed.data.notes ?? '']
    );
    const row = (await q('SELECT * FROM workstreams WHERE id = $1', [id])).rows[0];
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

workstreamsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateWorkstreamSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await loadOwnedWorkstream(req.params.id, userId(req));
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const name = parsed.data.name ?? existing.name;
    const color = parsed.data.color ?? existing.color;
    const notes = parsed.data.notes ?? existing.notes;
    await q('UPDATE workstreams SET name = $1, color = $2, notes = $3 WHERE id = $4', [
      name,
      color,
      notes,
      req.params.id,
    ]);
    const row = (await q('SELECT * FROM workstreams WHERE id = $1', [req.params.id])).rows[0];
    res.json(row);
  } catch (err) {
    next(err);
  }
});

workstreamsRouter.delete('/:id', async (req, res, next) => {
  try {
    const existing = await loadOwnedWorkstream(req.params.id, userId(req));
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (existing.is_misc) return res.status(400).json({ error: 'cannot_delete_misc' });
    await q('DELETE FROM workstreams WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

workstreamsRouter.post('/reorder', async (req, res, next) => {
  try {
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const uid = userId(req);
    await withTx(async (client) => {
      for (let i = 0; i < parsed.data.orderedIds.length; i++) {
        // JOIN + user_id ensures we only touch this user's workstreams.
        await client.query(
          `UPDATE workstreams SET position = $1
           WHERE id = $2
             AND workspace_id IN (SELECT id FROM workspaces WHERE user_id = $3)`,
          [i, parsed.data.orderedIds[i], uid]
        );
      }
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
