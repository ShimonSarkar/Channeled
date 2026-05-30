# Deploying Channeled to Render

This deploys the whole app as a single Render **Web Service** (Node) that:

- serves the Express API at `/api/*`
- serves the built React client (Vite) as static files
- talks to a managed **Render Postgres** database via `DATABASE_URL`

Everything is wired up by [`render.yaml`](render.yaml) — a "Blueprint" that creates the web service + database in one click.

---

## 1. One-time prerequisites

1. A Render account: <https://dashboard.render.com>
2. Your repo on GitHub (already done): `ShimonSarkar/Channeled`
3. Render needs access to that repo. The first deploy will prompt you to install the Render GitHub app.

---

## 2. Deploy with the Blueprint

1. Go to <https://dashboard.render.com/blueprints> → **New Blueprint Instance**.
2. Pick the `Channeled` repo and the `main` branch.
3. Render reads `render.yaml` and shows two resources:
   - **Web Service**: `channeled` (Node, free plan)
   - **Postgres**: `channeled-db` (free plan, PG 16)
4. Click **Apply**. Render will:
   - Provision the database (takes ~1 min).
   - Inject `DATABASE_URL` into the web service.
   - Run `npm run render-build` (installs deps + builds server and client).
   - Start the service with `npm start` (which runs the compiled server, which serves the built client).
5. When the deploy finishes, open the URL shown on the service page (e.g. `https://channeled.onrender.com`).

> Health check: `GET /api/health` should return `{"ok":true}`.

---

## 3. How the build is wired

- `render.yaml`
  - `buildCommand: npm run render-build` → installs root + server + client deps, then runs `npm run build` (compiles server TS to `server/dist`, builds client to `client/dist`).
  - `startCommand: npm start` → `node server/dist/index.js`.
  - `DATABASE_URL` is sourced from the managed Postgres connection string.
- `server/src/index.ts`
  - Initializes the schema on boot (`initDb()` — `CREATE TABLE IF NOT EXISTS …`).
  - Serves `client/dist` statically and falls back to `index.html` for any non-`/api/*` route.
- `server/src/db.ts`
  - Uses `pg.Pool` with `ssl: { rejectUnauthorized: false }` (Render Postgres requires SSL).
  - Set `PGSSL=disable` to turn SSL off for local Postgres.

The client always calls relative `/api/*` URLs, so it works in dev (Vite proxy → `localhost:5174`) and in prod (same origin as the API). No client config needed.

---

## 4. Running locally against Postgres

You no longer have a local SQLite file. To run locally you need a Postgres URL:

```powershell
# 1. Spin up a quick Postgres (Docker)
docker run --name channeled-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16

# 2. In another terminal, point the server at it
cd server
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5432/postgres"
$env:PGSSL = "disable"
npm run dev
```

Or run both server + client from the repo root:

```powershell
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5432/postgres"
$env:PGSSL = "disable"
npm run dev
```

See [.env.example](.env.example) for the full list of env vars.

---

## 5. Updating the deployment

Render auto-deploys on every push to `main`. To trigger a manual deploy:

- Dashboard → service → **Manual Deploy → Deploy latest commit**.

Schema migrations happen automatically on boot (`initDb()` runs `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS`). For destructive migrations, write a one-off SQL script and run it from the Render Postgres **Shell** tab.

---

## 6. Gotchas

- **Free Postgres expires after 90 days** on Render's free tier — back up before then (`pg_dump` from the Shell tab) or upgrade.
- **Free Web Service cold starts**: the service sleeps after 15 min of inactivity; first request after that takes ~30 s.
- **`DATABASE_URL` is required** — the server throws on boot if it's missing. This is intentional so a misconfigured deploy fails loudly instead of silently writing to ephemeral SQLite.
- **SSL**: Render Postgres only accepts SSL connections. The pool sets `rejectUnauthorized: false` so self-signed certs work out of the box.
