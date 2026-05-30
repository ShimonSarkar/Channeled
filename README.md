# Channeled

A focused task manager organized by color-coded **workstreams**, with a "Work on Today" panel pinned at the top and multi-workspace support. Mobile-friendly UI, deployable to Render with a managed Postgres database.

## Stack
- **Client**: Vite + React + TypeScript, @dnd-kit, TanStack Query, Zustand, react-markdown
- **Server**: Express + TypeScript + PostgreSQL (`pg`)
- **Hosting**: Render Web Service + Render Postgres (see [DEPLOY.md](DEPLOY.md))

## Features
- Multiple workspaces with a dropdown switcher; each owns its own workstreams and tasks
- **Sign in with Google** — every user gets their own private workspaces, workstreams, and tasks
- Color-coded workstreams, drag-and-drop reordering, subtasks, due dates, rich notes
- "Today" panel for the day's focus, completed/trash sections, quick-add modal (press `N`)
- Light/dark theme
- Responsive layout — works on phones via your LAN

## Getting started (local)

### 1. Install Postgres
Install PostgreSQL 16 natively (Windows: `winget install --id PostgreSQL.PostgreSQL.16 -e`). During the installer, choose a password for the `postgres` superuser and keep port `5432`.

Create the database:
```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE channeled;"
```

### 2. Configure environment
Create `server/.env` (already gitignored):
```env
DATABASE_URL=postgres://postgres:<your-password>@localhost:5432/channeled
PGSSL=disable
PORT=5174

# Google OAuth — create at https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
BASE_URL=http://localhost:5174
CLIENT_URL=http://localhost:5173
```
See [.env.example](.env.example) for the full list. Full OAuth setup walkthrough lives in [DEPLOY.md](DEPLOY.md#7-google-sign-in-oauth).

### 3. Install & run
```powershell
npm run install:all
npm run dev
```
- Client: <http://localhost:5173>
- Server: <http://localhost:5174>

Tables are created automatically on first boot, along with a starter "Personal" workspace.

## Accessing from your phone
Vite already binds to your LAN. After `npm run dev`, look for the `Network:` URL in the client output (e.g. `http://10.0.0.214:5173/`) and open it on a device on the same Wi-Fi.

If the page loads but API calls fail, allow Node through Windows Firewall on private networks (run PowerShell as Administrator):
```powershell
New-NetFirewallRule -DisplayName "Vite dev 5173" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Node dev 5174" -Direction Inbound -LocalPort 5174 -Protocol TCP -Action Allow -Profile Private
```

## Deploying
See [DEPLOY.md](DEPLOY.md). The repo includes a `render.yaml` Blueprint that provisions a Web Service + free Postgres in one click.

## Layout
- `client/` — React app
- `server/` — Express API + Postgres
- `render.yaml` — Render Blueprint
- `DEPLOY.md` — deployment guide
