# Hello World UI

A minimal hello-world page backed by SQLite. The server appends the current
timestamp to the database every 15 seconds, and the UI lists every row.

## Files

- `server.js` — dependency-free Node server: static files, the 15s tick writer, and the JSON API
- `public/index.html` / `styles.css` / `app.js` — the UI (polls the API every 5s)
- `Dockerfile` — `node:24-alpine` image; the database lives on the `/data` volume
- `docker-compose.yaml` — deployment definition (named volume, healthcheck, Coolify domain variable)

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
docker compose up --build
```

Then open http://localhost:3000. The named volume keeps the database across
container restarts.

Or without compose:

```bash
docker build -t hello-world-ui .
docker run --rm -p 3000:3000 -v hello-world-data:/data hello-world-ui
```

Drop `-v` there if you want a throwaway database.

## Deploying on Coolify

Use the **Docker Compose** build pack and point it at `docker-compose.yaml`.
It already declares everything Coolify needs:

- `SERVICE_FQDN_APP_3000` — Coolify generates a domain on the first deploy and
  routes it to port 3000. Override it under *Environment Variables* to use your
  own domain.
- `sqlite-data:/data` — a named volume, so the database survives redeploys.
  Coolify prefixes it with the resource UUID and lists it read-only under
  *Configuration → Persistent Storage*; change the mount in the compose file,
  not in the UI.
- A healthcheck on `/api/health`, so Coolify only marks the container healthy
  once the server is actually answering.

No `networks:` block is needed — Coolify creates a shared network for the stack.

### If you deploy with the Dockerfile build pack instead

The Dockerfile deliberately has **no `VOLUME` instruction**: that would create a
throwaway anonymous volume on every deploy and silently lose the database. Add
the mount yourself under *Configuration → Persistent Storage*:

| field            | value        |
| ---------------- | ------------ |
| Name             | `sqlite-data` |
| Source           | *(leave empty — this makes it a named volume)* |
| Destination path | `/data`      |

Set *Ports Exposes* to `3000`.

### Troubleshooting: the database is empty after every redeploy

This means `/data` is not on a persistent mount, so it lives in the container
filesystem and is thrown away with the old container.

The image sets `REQUIRE_PERSISTENT_DB=true`, so a container in this state
**refuses to start** rather than quietly collecting data it is about to lose —
the deployment fails visibly with:

```
Refusing to start: /data is not on a mounted volume - it is part of the
container filesystem, so the database is discarded on every redeploy.
```

A healthy deployment logs this instead:

```
database: /data/app.db (existing)
rows at startup: 412
persistence: /data is on the mount /data
```

`newly created` on a redeploy confirms the mount is missing. The fix depends on
the build pack:

- **Dockerfile build pack** (the default when a repo has a `Dockerfile`) —
  `docker-compose.yaml` is ignored entirely, so no volume is mounted. Add one
  under *Configuration → Persistent Storage*: Name `sqlite-data`, **Source
  empty**, Destination `/data`. Then redeploy.
- **Docker Compose build pack** — confirm Coolify is actually using
  `docker-compose.yaml`, and that the volume was not removed. When deleting or
  recreating the resource, Coolify asks about volumes; choosing *Delete Volumes*
  wipes the database.

You can also check persistence over HTTP — `GET /api/health` reports it:

```json
{ "status": "ok",
  "database": { "path": "/data/app.db", "persistent": true,
                "mountPoint": "/data", "rows": 412 } }
```

`persistent: false` means the mount is missing. To verify a redeploy really
held, compare `rows` before and after: the count must carry over, and the log
must say `(existing)`.

To confirm on the host:

```bash
docker volume ls | grep sqlite-data
docker inspect <container> --format '{{json .Mounts}}' | jq
```

`Mounts` must contain a `/data` entry. If it is empty, the container has no
volume regardless of what the compose file says.

### Permissions

The container runs as the non-root `node` user (uid 1000). A **named volume** is
seeded with the image's ownership of `/data`, so it just works. A **host bind
mount** is not — it arrives owned by root and every write fails. If you mount a
host path, hand it to the container user first:

```bash
chown -R 1000:1000 /path/on/host
```

The server checks this at startup and exits with that instruction rather than
failing on the first insert.

### Deleting the resource

Coolify asks whether to remove volumes. Choose **Keep Volumes** unless you
really want the database gone.

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
| `REQUIRE_PERSISTENT_DB` | `true` in the image | refuse to start when the database directory is not a mounted volume |

`REQUIRE_PERSISTENT_DB` is set to `true` in the `Dockerfile` so deployments fail
loudly instead of losing data; it is unset when you run `npm start` locally, so
a plain `./data` directory only warns. Set it to `false` to run a container
deliberately without persistence.

The database runs in WAL mode with a 5s busy timeout, so an unclean container
stop is far less likely to leave it damaged. That means `app.db` is accompanied
by `app.db-wal` and `app.db-shm` in the volume; back up all three, or copy the
database with `sqlite3 app.db ".backup out.db"`.
