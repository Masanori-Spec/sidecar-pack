import http from "node:http";
import { readFile, stat, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2);
const get = (key, fallback) => {
  const i = args.indexOf(key);
  return i < 0 ? fallback : args[i + 1];
};
const root = await realpath(
  resolve(get("--root", fileURLToPath(new URL("../", import.meta.url)))),
);
const port = Number(get("--port", "4173"));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};
const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const path = resolve(
      root,
      `.${pathname === "/" ? "/web/index.html" : pathname}`,
    );
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const actual = await realpath(path);
    if (actual !== root && !actual.startsWith(`${root}${sep}`)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const info = await stat(actual);
    if (!info.isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const body = await readFile(actual);
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Sidecar Pack: http://127.0.0.1:${port}/web/index.html`),
);
