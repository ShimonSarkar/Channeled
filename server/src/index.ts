import express from 'express';
import cors from 'cors';
import { db, serializeTask, type TaskRow } from './db.js';
import { workstreamsRouter } from './routes/workstreams.js';
import { tasksRouter } from './routes/tasks.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/state', (_req, res) => {
  const workstreams = db.prepare('SELECT * FROM workstreams ORDER BY position ASC').all();
  const tasks = (db.prepare('SELECT * FROM tasks ORDER BY position ASC').all() as TaskRow[]).map(serializeTask);
  res.json({ workstreams, tasks });
});

app.use('/api/workstreams', workstreamsRouter);
app.use('/api/tasks', tasksRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

const port = Number(process.env.PORT ?? 5174);
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
