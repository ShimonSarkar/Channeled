import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db, type WorkstreamRow } from '../db.js';
import { createWorkstreamSchema, updateWorkstreamSchema, reorderSchema } from '../schema.js';

export const workstreamsRouter = Router();

workstreamsRouter.post('/', (req, res) => {
  const parsed = createWorkstreamSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const maxPos = (db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM workstreams').get() as { m: number }).m;
  const id = nanoid();
  db.prepare(
    'INSERT INTO workstreams (id, name, color, position, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(id, parsed.data.name, parsed.data.color, maxPos + 1, parsed.data.notes ?? '');
  const row = db.prepare('SELECT * FROM workstreams WHERE id = ?').get(id);
  res.status(201).json(row);
});

workstreamsRouter.patch('/:id', (req, res) => {
  const parsed = updateWorkstreamSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = db.prepare('SELECT * FROM workstreams WHERE id = ?').get(req.params.id) as WorkstreamRow | undefined;
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const name = parsed.data.name ?? existing.name;
  const color = parsed.data.color ?? existing.color;
  const notes = parsed.data.notes ?? existing.notes;
  db.prepare('UPDATE workstreams SET name = ?, color = ?, notes = ? WHERE id = ?').run(name, color, notes, req.params.id);
  res.json(db.prepare('SELECT * FROM workstreams WHERE id = ?').get(req.params.id));
});

workstreamsRouter.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM workstreams WHERE id = ?').get(req.params.id) as WorkstreamRow | undefined;
  if (!existing) return res.status(404).json({ error: 'not_found' });
  if (existing.is_misc) return res.status(400).json({ error: 'cannot_delete_misc' });
  db.prepare('DELETE FROM workstreams WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

workstreamsRouter.post('/reorder', (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const update = db.prepare('UPDATE workstreams SET position = ? WHERE id = ?');
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((id, i) => update.run(i, id));
  });
  tx(parsed.data.orderedIds);
  res.status(204).end();
});
