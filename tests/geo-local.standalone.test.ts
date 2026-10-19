import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { localSettings, localChildEnvironment, probeHttp, recoverLocal, type LocalSettings, type LocalStatus } from "../scripts/geo-local.ts";
import { acquireLocalProcessLock, localProcessRunning, watchProcessScope } from "../scripts/local-process-lock.ts";

const settings: LocalSettings = { root: path.resolve(import.meta.dirname, ".."), databaseUrl: "postgres://local@127.0.0.1:55432/local_test", apiUrl: "http://127.0.0.1:3001", webUrl: "http://127.0.0.1:3000", collect: true, siteName: "GEO 学习地图" };
const ready = () => ({ ready: true, occupied: true, detail: "existing" });
const missing = () => ({ ready: false, occupied: false, detail: "missing" });
const allReady = (): LocalStatus => ({ database: ready(), api: ready(), web: ready(), collector: ready() });

test("local recovery refuses remote or conflicting destinations and disables paid/outbound actions in its children", () => {
  const env = { DATABASE_URL: settings.databaseUrl, PUBLIC_FEED_COLLECT_ENABLED: "true", COLLECT_ENABLED: "true", MODEL_CALLS_ENABLED: "true", FEISHU_INTERNAL_ENABLED: "true", FEISHU_FUTURE_ENABLED: "true", INDEXNOW_SUBMIT_ENABLED: "true" };
  const config = localSettings(env);
  const child = localChildEnvironment(config, env);
  for (const key of ["COLLECT_ENABLED", "MODEL_CALLS_ENABLED", "FEISHU_INTERNAL_ENABLED", "FEISHU_FUTURE_ENABLED", "INDEXNOW_SUBMIT_ENABLED"]) assert.equal(child[key], "false");
  assert.equal(child.PUBLIC_FEED_COLLECT_ENABLED, "true");
  assert.equal(env.MODEL_CALLS_ENABLED, "true", "the user's configuration is not rewritten");
  assert.throws(() => localSettings({ ...env, DATABASE_URL: "postgres://example.com/database" }), /本机数据库/);
  assert.throws(() => localSettings({ ...env, API_BASE_URL: "https://remote.example/" }), /本机 API/);
  assert.throws(() => localSettings({ ...env, API_PORT: "3000" }), /不同端口/);
});

test("warm recovery is idempotent and rebuilding cannot overwrite assets used by an existing web process", async () => {
  const calls: string[] = [];
  const actions = { probe: async () => allReady(), launch: async () => { calls.push("launch"); }, migrate: async () => { calls.push("migrate"); }, build: async () => { calls.push("build"); }, hasBuild: () => true, wait: async () => {}, report: () => {} };
  await recoverLocal(settings, actions);
  assert.deepEqual(calls, []);
  await assert.rejects(recoverLocal(settings, actions, true), /拒绝重建/);
  assert.deepEqual(calls, [], "no migration, build, launch or replacement occurs on the rejected path");
});

test("recovery starts only missing components in dependency order and refuses a foreign occupied API port", async () => {
  const state = { database: ready(), api: missing(), web: missing(), collector: missing() };
  const calls: string[] = [];
  const actions = { probe: async () => state, launch: async (service: keyof LocalStatus) => { calls.push(service); state[service] = ready(); }, migrate: async () => { calls.push("migrate"); }, build: async () => { calls.push("build"); }, hasBuild: () => false, wait: async () => {}, report: () => {} };
  await recoverLocal(settings, actions);
  assert.deepEqual(calls, ["migrate", "api", "build", "web", "collector"]);
  await recoverLocal(settings, actions);
  assert.equal(calls.length, 5, "a second invocation reuses the recovered services");
  state.api = { ready: false, occupied: true, detail: "foreign process" };
  await assert.rejects(recoverLocal(settings, actions), /foreign process/);
  assert.equal(calls.length, 5);
});

test("service probes require GEO API identity and a matching HTML page, not just a generic healthy port", async () => {
  let identified = false, html = false;
  const server = createServer((req, res) => {
    if (req.url === "/atlas") { res.setHeader("content-type", "text/html"); res.end(html ? `<title>GEO 信源 · ${settings.siteName}</title>` : "another app"); return; }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(req.url === "/api/health" ? { ok: true, db: "ok" } : req.url === "/openapi-v1.json" ? { info: { title: identified ? `${settings.siteName} Public API` : "other app" } } : { sources: [], collector: { state: "waiting" } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  try {
    assert.deepEqual(await probeHttp(url, "api", settings.siteName), { ready: false, occupied: true, detail: "端口已占用，但本站身份或健康检查未通过；保留现有进程" });
    identified = true;
    assert.equal((await probeHttp(url, "api", settings.siteName)).ready, true);
    assert.equal((await probeHttp(url, "web", settings.siteName)).ready, false);
    html = true;
    assert.equal((await probeHttp(url, "web", settings.siteName)).ready, true);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("OS process lock rejects a second owner and is reusable after release", async () => {
  const scope = "test:" + randomUUID();
  const release = await acquireLocalProcessLock(scope);
  assert.ok(release);
  try { assert.equal(await localProcessRunning(scope), true); assert.equal(await acquireLocalProcessLock(scope), null); }
  finally { await release(); }
  assert.equal(await localProcessRunning(scope), false);
  const next = await acquireLocalProcessLock(scope); assert.ok(next); await next();
});

test("a duplicate watch supervisor exits before starting a database-backed collector", async () => {
  const databaseUrl = `postgres://unreachable@127.0.0.1:1/${randomUUID()}_test`;
  const release = await acquireLocalProcessLock(watchProcessScope(settings.root, databaseUrl));
  assert.ok(release);
  try {
    const child = spawn(process.execPath, [path.join(settings.root, "modules/geo-directory/scripts/watch-public.ts")], { env: { ...process.env, DATABASE_URL: databaseUrl }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", chunk => { output += String(chunk); }); child.stderr.on("data", chunk => { output += String(chunk); });
    const [code] = await once(child, "exit");
    assert.equal(code, 0); assert.match(output, /复用现有进程/); assert.doesNotMatch(output, /5 分钟后重新启动/);
  } finally { await release(); }
});
