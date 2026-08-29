"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "app.db");
const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS) || 15_000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ico": "image/x-icon",
};

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
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
    sendJson(res, 200, { status: "ok" });
    return;
  }

  sendStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`listening on http://0.0.0.0:${PORT} (db: ${DB_PATH})`);
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
