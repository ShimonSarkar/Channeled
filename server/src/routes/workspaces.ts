import { Router } from 'express';
import { nanoid } from 'nanoid';
import {
  q,
  withTx,
  ensureMiscForWorkspace,
  type UserRow,
  type WorkspaceRow,
} from '../db.js';
import { createWorkspaceSchema, updateWorkspaceSchema, reorderSchema } from '../schema.js';

export const workspacesRouter = Router();

function userId(req: { user?: UserRow }): string {
  return (req.user as UserRow).id;
}

workspacesRouter.get('/', async (req, res, next) => {
  try {
    const rows = (
      await q<WorkspaceRow>(
        'SELECT * FROM workspaces WHERE user_id = $1 ORDER BY position ASC',
        [userId(req)]
      )
    ).rows;
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

workspacesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const uid = userId(req);
    const maxRow = (
      await q<{ m: number }>(
        'SELECT COALESCE(MAX(position), -1) as m FROM workspaces WHERE user_id = $1',
        [uid]
      )
    ).rows[0];
    const id = nanoid();
    await q(
      'INSERT INTO workspaces (id, name, position, user_id) VALUES ($1, $2, $3, $4)',
      [id, parsed.data.name, maxRow.m + 1, uid]
    );
    // Every workspace gets its own Misc workstream by default.
    await ensureMiscForWorkspace(id);
    const row = (await q<WorkspaceRow>('SELECT * FROM workspaces WHERE id = $1', [id])).rows[0];
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

workspacesRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = (
      await q<WorkspaceRow>(
        'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
        [req.params.id, userId(req)]
      )
    ).rows[0];
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const name = parsed.data.name ?? existing.name;
    await q('UPDATE workspaces SET name = $1 WHERE id = $2', [name, req.params.id]);
    const row = (
      await q<WorkspaceRow>('SELECT * FROM workspaces WHERE id = $1', [req.params.id])
    ).rows[0];
    res.json(row);
  } catch (err) {
    next(err);
  }
});

workspacesRouter.delete('/:id', async (req, res, next) => {
  try {
    const uid = userId(req);
    const existing = (
      await q<WorkspaceRow>(
        'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
        [req.params.id, uid]
      )
    ).rows[0];
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const count = (
      await q<{ c: string }>(
        'SELECT COUNT(*)::text as c FROM workspaces WHERE user_id = $1',
        [uid]
      )
    ).rows[0];
    if (Number(count?.c ?? 0) <= 1) {
      return res.status(400).json({ error: 'cannot_delete_last_workspace' });
    }
    await q('DELETE FROM workspaces WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

workspacesRouter.post('/reorder', async (req, res, next) => {
  try {
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const uid = userId(req);
    await withTx(async (client) => {
      for (let i = 0; i < parsed.data.orderedIds.length; i++) {
        // user_id condition prevents reordering another user's workspaces.
        await client.query(
          'UPDATE workspaces SET position = $1 WHERE id = $2 AND user_id = $3',
          [i, parsed.data.orderedIds[i], uid]
        );
      }
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
