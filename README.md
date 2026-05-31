# Channeled

A focused, opinionated task manager built around **color-coded workstreams** and a daily **"Work on Today"** panel. Sign in with Google, organize tasks into workspaces and workstreams, drag things around, and keep your day uncluttered. Live at <https://channeled.onrender.com>.

## What it is

Channeled is a personal productivity app I built because most todo apps either force you into rigid projects or let everything turn into one giant list. Channeled splits the difference:

- A **workspace** is a top-level container (e.g. "Personal", "Work"). You can have many; switch between them from the dropdown in the header.
- A **workstream** is a color-coded lane within a workspace (e.g. "Side Project", "Errands", "Reading"). It's the unit of visual grouping.
- A **task** lives in a workstream. Tasks can have subtasks, due dates, and rich markdown notes.
- The **Today** panel is pinned at the top of every view — drag any task into it to commit to working on it today.

Everything is per-user: once you sign in with Google, your workspaces, workstreams, and tasks are private to your account.

### Highlights
- Sign in with Google (Passport + OAuth 2.0); sessions persisted in Postgres
- Multiple workspaces per user with a dropdown switcher
- Color-coded workstreams with drag-and-drop reordering (via [@dnd-kit](https://dndkit.com/))
- "Today" panel, completed/trash sections, quick-add modal (press `N`)
- Subtasks, due dates, rich markdown notes (react-markdown)
- Light/dark theme
- Responsive — works on phones over your LAN in dev, and on mobile browsers in prod

## How it works

### Architecture
```
┌──────────────────┐      same-origin in prod       ┌──────────────────┐
│  client (React)  │ ───────────────────────────────│  server (Express)│
│  Vite + TS       │   /api/* (cookie auth)         │   Express + TS   │
│  TanStack Query  │                                │   Passport       │
│  Zustand         │                                │   pg (Postgres)  │
│  @dnd-kit        │                                └────────┬─────────┘
└──────────────────┘                                         │
                                                             ▼
                                                  ┌──────────────────┐
                                                  │   PostgreSQL 16  │
                                                  │   users          │
                                                  │   workspaces     │
                                                  │   workstreams    │
                                                  │   tasks          │
                                                  │   session        │
                                                  └──────────────────┘
```

- **Client** is a Vite + React + TypeScript SPA. State management is split: server data lives in TanStack Query, transient UI state lives in Zustand.
- **Server** is Express + TypeScript. Auth is handled by Passport with the Google OAuth 2.0 strategy. Sessions are stored in Postgres via `connect-pg-simple`, with a 30-day rolling cookie (`channeled.sid`, `httpOnly`, `sameSite: 'lax'`, `secure` in prod).
- **Database** is a single PostgreSQL instance. Tables are created automatically on first boot — no migration tool. Foreign keys cascade from `users` → `workspaces` → `workstreams` → `tasks`.
- **In dev**, the Vite dev server proxies `/api/*` to the Express server on port 5174 so everything stays same-origin and cookies "just work."
- **In prod**, the Express server serves the built client from `client/dist`, so the entire app is one origin and the session cookie is straightforward.

### Repo layout
```
client/        React + Vite SPA
  src/
    components/    UI (TopBar, TaskCard, LoginScreen, UserMenu, …)
    state/         TanStack Query hooks + Zustand store
    api.ts         fetch wrapper with credentials: 'include'
server/        Express API + Postgres glue
  src/
    auth.ts        Passport / Google OAuth + session middleware
    db.ts          Connection pool, schema bootstrap, user/workspace helpers
    routes/        workspaces, workstreams, tasks
    index.ts       Express app wiring
render.yaml    Render Blueprint (web service + free Postgres)
DEPLOY.md      Step-by-step deployment guide
```

## Run it locally

### 1. Prereqs
- Node 20+
- PostgreSQL 16 (Windows: `winget install --id PostgreSQL.PostgreSQL.16 -e`; macOS: `brew install postgresql@16`)
- A Google OAuth client — see [DEPLOY.md §7](DEPLOY.md#7-google-sign-in-oauth) for the 5-minute setup. You'll need to add `http://localhost:5173` as an authorized JS origin and `http://localhost:5174/api/auth/google/callback` as an authorized redirect URI.

### 2. Create the database
```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE channeled;"
```
(On macOS/Linux: `createdb channeled`.)

### 3. Configure environment
Copy [server/.env.example](server/.env.example) to `server/.env` and fill in the values:

```env
DATABASE_URL=postgres://postgres:<your-password>@localhost:5432/channeled
PGSSL=disable
PORT=5174

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=<run: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
BASE_URL=http://localhost:5174
CLIENT_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
```

> `server/.env` is gitignored. Never commit it.

### 4. Install & run
```powershell
npm run install:all
npm run dev
```
- Client: <http://localhost:5173>
- Server: <http://localhost:5174>

Tables are created automatically on first boot. Click **Sign in with Google** to create your account and a starter "Personal" workspace.

### Accessing from your phone (dev)
Vite binds to your LAN. Look for the `Network:` URL in the dev output (e.g. `http://10.0.0.214:5173/`) and open it on a device on the same Wi-Fi. If the page loads but API calls fail, allow Node through Windows Firewall on private networks (PowerShell as Administrator):
```powershell
New-NetFirewallRule -DisplayName "Vite dev 5173" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Node dev 5174" -Direction Inbound -LocalPort 5174 -Protocol TCP -Action Allow -Profile Private
```

## Deployment (Render)

The repo includes a [render.yaml](render.yaml) Blueprint that provisions a free web service + free Postgres in one click. Full walkthrough: [DEPLOY.md](DEPLOY.md).

### How it's wired
- **Web service**: `npm run render-build` (installs all workspaces + builds client/server) → `npm start` (runs the Express server, which also serves `client/dist`).
- **Database**: Render-managed Postgres 16. `DATABASE_URL` is injected automatically via `fromDatabase` in [render.yaml](render.yaml).
- **Sessions**: `SESSION_SECRET` is auto-generated by Render (`generateValue: true`) on first deploy.
- **OAuth**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are declared with `sync: false` — you set them once in the Render dashboard's Environment tab. The same Google client can serve both dev and prod by adding both origins/redirect URIs in Google Cloud Console.
- **Same-origin in prod**: `BASE_URL` and the served client share the host (`https://channeled.onrender.com`), so the session cookie works without any CORS gymnastics.
- **Health check**: Render polls `/api/health` for readiness.

### First-time deploy checklist
1. Push the repo to GitHub.
2. In Render, **New → Blueprint** → point at the repo. It creates the web service + database from [render.yaml](render.yaml).
3. In Google Cloud Console, add your Render URL as an authorized JS origin and `<your-url>/api/auth/google/callback` as an authorized redirect URI.
4. In Render dashboard → service → **Environment**, set:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `BACKFILL_USER_EMAIL` (optional — only if you have pre-existing workspaces to claim on first login; delete after)
5. Wait for deploy, then sign in.

### Subsequent deploys
Push to `main` → Render auto-deploys.

## Tech stack
- **Frontend**: React 18, TypeScript, Vite, TanStack Query, Zustand, @dnd-kit, react-markdown
- **Backend**: Express, TypeScript, Passport (google-oauth20), express-session, connect-pg-simple, `pg`
- **Database**: PostgreSQL 16
- **Hosting**: Render Web Service + Render Postgres

## License
Personal project. No license file — all rights reserved.
