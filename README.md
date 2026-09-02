# Channeled

A focused, opinionated task manager built around **color-coded workstreams** and a daily **"Work on Today"** panel. Sign in with Google, organize tasks into workspaces and workstreams, drag things around, and keep your day uncluttered.

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
- Responsive — works on phones over your local network

## How it works

### Architecture
```
┌──────────────────┐        local Vite proxy        ┌──────────────────┐
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
- **Locally**, the Vite dev server proxies `/api/*` to the Express server on port 47822 so everything stays same-origin and cookies "just work."
- For a local compiled build, the Express server serves the client from `client/dist`.

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
```

## Run it locally

### 1. Prereqs
- Node 20+
- PostgreSQL 16 (Windows: `winget install --id PostgreSQL.PostgreSQL.16 -e`; macOS: `brew install postgresql@16`)
- A Google OAuth client configured as a **Web application** with:
  - Authorized JavaScript origin: `http://localhost:47821`
  - Authorized redirect URI: `http://localhost:47822/api/auth/google/callback`

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
PORT=47822

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=<run: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
BASE_URL=http://localhost:47822
CLIENT_URL=http://localhost:47821
CORS_ORIGINS=http://localhost:47821
```

> `server/.env` is gitignored. Never commit it.

### 4. Install & run
```powershell
npm run install:all
npm run dev
```
- Client: <http://localhost:47821>
- Server: <http://localhost:47822>

Tables are created automatically on first boot. Click **Sign in with Google** to create your account and a starter "Personal" workspace.

### Accessing from your phone (dev)
Vite binds to your LAN. Look for the `Network:` URL in the dev output (e.g. `http://10.0.0.214:47821/`) and open it on a device on the same Wi-Fi. If the page loads but API calls fail, allow Node through Windows Firewall on private networks (PowerShell as Administrator):
```powershell
New-NetFirewallRule -DisplayName "Vite dev 47821" -Direction Inbound -LocalPort 47821 -Protocol TCP -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Node dev 47822" -Direction Inbound -LocalPort 47822 -Protocol TCP -Action Allow -Profile Private
```

## Tech stack
- **Frontend**: React 18, TypeScript, Vite, TanStack Query, Zustand, @dnd-kit, react-markdown
- **Backend**: Express, TypeScript, Passport (google-oauth20), express-session, connect-pg-simple, `pg`
- **Database**: PostgreSQL 16

## License
Personal project. No license file — all rights reserved.
