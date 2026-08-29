# Hello World UI

A minimal hello-world page backed by SQLite. The server appends the current
timestamp to the database every 15 seconds, and the UI lists every row.

## Files

- `server.js` — dependency-free Node server: static files, the 15s tick writer, and the JSON API
- `public/index.html` / `styles.css` / `app.js` — the UI (polls the API every 5s)
- `Dockerfile` — `node:24-alpine` image; the database lives on the `/data` volume

## Data

Table `ticks`:

| column        | type    | notes                          |
| ------------- | ------- | ------------------------------ |
| `id`          | INTEGER | primary key, autoincrement     |
| `recorded_at` | TEXT    | ISO-8601 UTC timestamp         |

## API

- `GET /api/ticks?limit=100` — `{ intervalMs, total, ticks: [{ id, recorded_at }] }` (newest first, limit 1–500, default 50)
- `GET /api/health` — `{ status: "ok" }`

## Run with Docker

```bash
docker build -t hello-world-ui .
docker run --rm -p 3000:3000 -v hello-world-data:/data hello-world-ui
```

Then open http://localhost:3000. The named volume keeps the database across
container restarts; drop `-v` if you want a throwaway database.

## Run locally

Requires Node 24+, where the built-in `node:sqlite` module is available
without an experimental warning. It also runs on Node 22.13+, which logs
an `ExperimentalWarning` for SQLite on startup.

```bash
npm start
```

## Configuration

| variable           | default          | purpose                        |
| ------------------ | ---------------- | ------------------------------ |
| `PORT`             | `3000`           | HTTP port                      |
| `DB_PATH`          | `./data/app.db`  | SQLite file location           |
| `TICK_INTERVAL_MS` | `15000`          | how often a row is written     |
