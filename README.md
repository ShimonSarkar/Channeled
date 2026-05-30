# Channeled

Local-first task manager organized by color-coded workstreams, with a "Work on Today" panel pinned at the top.

## Stack
- **Client**: Vite + React + TypeScript, @dnd-kit, TanStack Query, Zustand, react-markdown.
- **Server**: Express + TypeScript + better-sqlite3 (file at `server/data/todo.db`).

## Getting started
```powershell
npm run install:all
npm run dev
```
- Client: http://localhost:5173
- Server: http://localhost:5174

## Layout
- `client/` — React app
- `server/` — Express API + SQLite
