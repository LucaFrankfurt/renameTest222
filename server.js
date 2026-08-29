"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "app.db");
const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS) || 15_000;
const PUBLIC_DIR = path.join(__dirname, "public");
// Set in the Dockerfile, so containers refuse to run without a real volume
// while `npm start` on a laptop still works against ./data.
const REQUIRE_PERSISTENT_DB = process.env.REQUIRE_PERSISTENT_DB === "true";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ico": "image/x-icon",
};

const DB_DIR = path.dirname(DB_PATH);

// On a fresh named volume Docker copies the image's ownership of /data, so the
// non-root user can write. A host bind mount does not: it arrives owned by root
// and every write fails. Say so clearly instead of crashing on the first insert.
try {
  fs.mkdirSync(DB_DIR, { recursive: true });
  fs.accessSync(DB_DIR, fs.constants.W_OK);
} catch (error) {
  console.error(
    `Cannot write to the database directory ${DB_DIR}: ${error.message}\n` +
      "If this is a bind-mounted host directory, give it to the container user:\n" +
      "  chown -R 1000:1000 <host directory>\n" +
      "A Docker named volume (the default in docker-compose.yaml) needs no such step.",
  );
  process.exit(1);
}

// Persistence lives or dies on whether DB_DIR sits on a mounted volume. If it
// is just the container's own filesystem, every redeploy starts from an empty
// database - say so loudly at boot instead of letting it be discovered later.
function mountPointFor(dir) {
  let mounts;
  try {
    mounts = fs.readFileSync("/proc/self/mountinfo", "utf8");
  } catch {
    return null; // Not Linux, or /proc unavailable: skip the check.
  }

  const target = path.resolve(dir);
  let best = null;
  for (const line of mounts.split("\n")) {
    // mountinfo field 5 is the mount point within the container.
    const point = line.split(" ")[4];
    if (!point || point === "/") continue;
    if (target === point || target.startsWith(point + "/")) {
      if (!best || point.length > best.length) best = point;
    }
  }
  return best;
}

const existedBefore = fs.existsSync(DB_PATH);
const mountPoint = mountPointFor(DB_DIR);

const NO_MOUNT_MESSAGE =
  `${DB_DIR} is not on a mounted volume - it is part of the container ` +
  "filesystem, so the database is discarded on every redeploy.\n" +
  "  Docker Compose: mount a named volume at /data (see docker-compose.yaml).\n" +
  "  Coolify with the Dockerfile build pack: Configuration -> Persistent Storage,\n" +
  "  Name sqlite-data, Source empty, Destination /data, then redeploy.\n" +
  "  To run without persistence anyway, set REQUIRE_PERSISTENT_DB=false.";

// Refusing to boot turns silent data loss into a visibly failed deployment.
if (!mountPoint && REQUIRE_PERSISTENT_DB) {
  console.error(`Refusing to start: ${NO_MOUNT_MESSAGE}`);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

// WAL survives an unclean container stop better than the rollback journal, and
// busy_timeout keeps concurrent readers from failing outright while a write commits.
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS ticks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL
  );
`);

const insertTick = db.prepare("INSERT INTO ticks (recorded_at) VALUES (?)");
const selectTicks = db.prepare(
  "SELECT id, recorded_at FROM ticks ORDER BY id DESC LIMIT ?",
);
const countTicks = db.prepare("SELECT COUNT(*) AS total FROM ticks");

function recordTick() {
  const now = new Date().toISOString();
  insertTick.run(now);
  console.log(`tick recorded: ${now}`);
}

recordTick();
const ticker = setInterval(recordTick, TICK_INTERVAL_MS);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function sendStatic(res, urlPath) {
  const relative = urlPath === "/" ? "index.html" : urlPath.slice(1);
  const filePath = path.join(PUBLIC_DIR, relative);

  // Keep path traversal (../) from escaping the public directory.
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (url.pathname === "/api/ticks") {
    const requested = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), 500)
      : 50;
    sendJson(res, 200, {
      intervalMs: TICK_INTERVAL_MS,
      total: countTicks.get().total,
      ticks: selectTicks.all(limit),
    });
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(res, 200, {
      status: "ok",
      database: {
        path: DB_PATH,
        persistent: mountPoint !== null,
        mountPoint,
        rows: countTicks.get().total,
      },
    });
    return;
  }

  sendStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`listening on http://0.0.0.0:${PORT}`);
  console.log(`database: ${DB_PATH} (${existedBefore ? "existing" : "newly created"})`);
  console.log(`rows at startup: ${countTicks.get().total}`);

  if (mountPoint) {
    console.log(`persistence: ${DB_DIR} is on the mount ${mountPoint}`);
  } else {
    console.warn(`WARNING: ${NO_MOUNT_MESSAGE}`);
  }
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  clearInterval(ticker);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
