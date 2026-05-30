import { Router } from 'express';
import { nanoid } from 'nanoid';
import { q, withTx, type WorkstreamRow } from '../db.js';
import { createWorkstreamSchema, updateWorkstreamSchema, reorderSchema } from '../schema.js';

export const workstreamsRouter = Router();

workstreamsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createWorkstreamSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const maxRow = (
      await q<{ m: number }>('SELECT COALESCE(MAX(position), -1) as m FROM workstreams')
    ).rows[0];
    const id = nanoid();
    await q(
      'INSERT INTO workstreams (id, name, color, position, notes) VALUES ($1, $2, $3, $4, $5)',
      [id, parsed.data.name, parsed.data.color, maxRow.m + 1, parsed.data.notes ?? '']
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

    const existing = (
      await q<WorkstreamRow>('SELECT * FROM workstreams WHERE id = $1', [req.params.id])
    ).rows[0];
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
    const existing = (
      await q<WorkstreamRow>('SELECT * FROM workstreams WHERE id = $1', [req.params.id])
    ).rows[0];
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

    await withTx(async (client) => {
      for (let i = 0; i < parsed.data.orderedIds.length; i++) {
        await client.query('UPDATE workstreams SET position = $1 WHERE id = $2', [
          i,
          parsed.data.orderedIds[i],
        ]);
      }
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
