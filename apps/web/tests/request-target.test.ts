// Failure cases: an origin-form // path is read as a URL authority and throws a 500; an unknown
// double-slash path becomes a different host's root; HEAD or single-fetch data follows another rule.
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { after, before, test } from "node:test";
import { geoOverview } from "./geo-fixtures.ts";
import { startWebServer, type WebServer } from "./web-server.ts";

let web: WebServer;
const upstreamPaths: string[] = [];
const overview = geoOverview();
const api = createServer((req, res) => {
  upstreamPaths.push(req.url ?? "");
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
  if (new URL(req.url!, "http://api.local").pathname === "/api/geo/overview") return res.end(JSON.stringify(overview));
  res.writeHead(404);
  res.end("{}");
});

before(async () => { web = await startWebServer(api); });
after(() => web.stop());

function raw(path: string, method: "GET" | "HEAD") {
  return new Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: web.port, path, method }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

test("origin-form slashes keep the router's homepage and unknown-route semantics", async () => {
  for (const method of ["GET", "HEAD"] as const) {
    const home = await raw("/", method);
    assert.equal(home.status, 200, web.logs());
    if (method === "GET") assert.match(home.body, /GEO 阅读精选/);
    else assert.equal(home.body, "");
    for (const path of ["//", "////", "//?category=platform-updates"]) {
      const res = await raw(path, method);
      assert.equal(res.status, 200, `${method} ${path}: ${web.logs()}`);
      assert.equal(res.headers["content-type"], home.headers["content-type"]);
      assert.match(res.headers["cache-control"] ?? "", /^public, max-age=\d+, s-maxage=\d+, must-revalidate$/);
      if (method === "HEAD") assert.equal(res.body, "");
      else assert.match(res.body, /GEO 阅读精选/);
    }
    for (const path of ["/unknown-page", "//unknown-page", "//evil.invalid/unknown-page", "//unknown-page.data?token=private"]) {
      const res = await raw(path, method);
      assert.equal(res.status, 404, `${method} ${path}: ${web.logs()}`);
      assert.equal(res.headers["cache-control"], "private, no-store");
      if (method === "HEAD") assert.equal(res.body, "");
    }
  }
  assert.equal(web.logs(), "");
  assert.ok(upstreamPaths.some((path) => new URL(path, "http://api.local").pathname === "/api/geo/overview"));
  assert.ok(upstreamPaths.every((path) => ["/api/site/meta", "/api/geo/overview"].includes(new URL(path, "http://api.local").pathname)),
    `only the GEO overview and shell metadata are requested: ${upstreamPaths.join(", ")}`);
});
