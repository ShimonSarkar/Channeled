import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureUserHasWorkspace,
  initDb,
  q,
  serializeTask,
  type TaskRow,
  type UserRow,
  type WorkspaceRow,
} from './db.js';
import { workstreamsRouter } from './routes/workstreams.js';
import { tasksRouter } from './routes/tasks.js';
import { workspacesRouter } from './routes/workspaces.js';
import {
  authRouter,
  buildSessionMiddleware,
  configurePassport,
  requireAuth,
} from './auth.js';

const app = express();
// In dev the client (5173) and server (5174) live on the same host but different
// ports, so credentialed cross-origin requests need explicit origin + credentials.
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

// Behind Render's proxy, secure cookies need this so express trusts X-Forwarded-Proto.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(buildSessionMiddleware());
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);

app.get('/api/state', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as UserRow;
    // Ensure the user always has at least one workspace (with Misc).
    await ensureUserHasWorkspace(user.id);

    const workspaces = (
      await q<WorkspaceRow>(
        'SELECT * FROM workspaces WHERE user_id = $1 ORDER BY position ASC',
        [user.id]
      )
    ).rows;
    if (workspaces.length === 0) {
      return res.json({ workspaces: [], currentWorkspaceId: null, workstreams: [], tasks: [] });
    }

    const requested = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : null;
    const current =
      (requested && workspaces.find((w) => w.id === requested)) || workspaces[0];

    const workstreams = (
      await q(
        'SELECT * FROM workstreams WHERE workspace_id = $1 ORDER BY position ASC',
        [current.id]
      )
    ).rows;
    const tasks = (
      await q<TaskRow>(
        `SELECT t.* FROM tasks t
         JOIN workstreams w ON w.id = t.workstream_id
         WHERE w.workspace_id = $1
         ORDER BY t.position ASC`,
        [current.id]
      )
    ).rows.map(serializeTask);

    res.json({ workspaces, currentWorkspaceId: current.id, workstreams, tasks });
  } catch (err) {
    next(err);
  }
});

app.use('/api/workspaces', requireAuth, workspacesRouter);
app.use('/api/workstreams', requireAuth, workstreamsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);

// Serve the built client (single Render Web Service hosting API + static UI).
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist =
  process.env.CLIENT_DIST ?? resolve(__dirname, '../../client/dist');

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback for any non-API route.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(resolve(clientDist, 'index.html'));
  });
} else {
  console.warn(
    `[server] client build not found at ${clientDist} — API-only mode (run "npm --prefix client run build" to enable static serving).`
  );
}

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
);

const port = Number(process.env.PORT ?? 5174);

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`[server] listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('[server] failed to initialize database', err);
    process.exit(1);
  });
