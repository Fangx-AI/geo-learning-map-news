// One-shot local recovery. Existing services are identified and reused, never stopped or replaced.
import { existsSync, closeSync, openSync } from "node:fs";
import { mkdir, appendFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import postgres from "postgres";
import { SITE } from "@aihot/site";
import { acquireLocalProcessLock, localProcessRunning, watchProcessScope } from "./local-process-lock.ts";

export class LocalRecoveryError extends Error {}

export interface LocalSettings { root: string; databaseUrl: string; apiUrl: string; webUrl: string; collect: boolean; siteName: string }
export interface ServiceProbe { ready: boolean; occupied: boolean; detail: string }
export interface LocalStatus { database: ServiceProbe; api: ServiceProbe; web: ServiceProbe; collector: ServiceProbe }
type Service = "database" | "api" | "web" | "collector";

export function localSettings(env: NodeJS.ProcessEnv = process.env, root = path.resolve(import.meta.dirname, "..")): LocalSettings {
  const databaseUrl = env.DATABASE_URL ?? "";
  let database: URL;
  try { database = new URL(databaseUrl); } catch { throw new LocalRecoveryError("缺少有效 DATABASE_URL；请先配置本机 .env。"); }
  if (!/^postgres(?:ql)?:$/.test(database.protocol) || database.hostname !== "127.0.0.1" || database.port !== "55432") throw new LocalRecoveryError("恢复入口只管理 127.0.0.1:55432 本机数据库。");
  const port = (input: string | undefined, fallback: number) => {
    const value = input === undefined || input === "" ? fallback : Number(input);
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new LocalRecoveryError("本机服务端口无效。");
    return value;
  };
  if ([env.API_HOST, env.WEB_HOST].some(host => host && host !== "127.0.0.1" && host !== "localhost")) throw new LocalRecoveryError("恢复入口只启动监听本机的 API 和网页。");
  const apiUrl = `http://127.0.0.1:${port(env.API_PORT, 3001)}`;
  const webUrl = `http://127.0.0.1:${port(env.WEB_PORT, 3000)}`;
  if (apiUrl === webUrl || [apiUrl, webUrl].some(url => new URL(url).port === database.port)) throw new LocalRecoveryError("数据库、API 和网页必须使用不同端口。");
  if (env.API_BASE_URL) {
    let upstream: URL; try { upstream = new URL(env.API_BASE_URL); } catch { throw new LocalRecoveryError("API_BASE_URL 无效。"); }
    if (!["127.0.0.1", "localhost"].includes(upstream.hostname) || upstream.protocol !== "http:" || upstream.port !== new URL(apiUrl).port || upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== "/") throw new LocalRecoveryError("API_BASE_URL 必须指向配置的本机 API 端口。");
  }
  return { root, databaseUrl, apiUrl, webUrl, collect: env.PUBLIC_FEED_COLLECT_ENABLED === "true", siteName: SITE.name };
}

export function localChildEnvironment(settings: LocalSettings, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...env, DATABASE_URL: settings.databaseUrl, API_HOST: "127.0.0.1", WEB_HOST: "127.0.0.1", API_BASE_URL: settings.apiUrl,
    PUBLIC_FEED_COLLECT_ENABLED: String(settings.collect), COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false", INDEXNOW_SUBMIT_ENABLED: "false" };
  for (const key of Object.keys(result)) if (/^FEISHU_.*_ENABLED$/.test(key)) result[key] = "false";
  result.FEISHU_CONTENT_PUSH_ENABLED = "false"; result.FEISHU_INTERNAL_ENABLED = "false";
  return result;
}

async function portOpen(url: string): Promise<boolean> {
  const target = new URL(url);
  return new Promise(resolve => {
    const socket = createConnection({ host: target.hostname, port: Number(target.port) });
    const finish = (open: boolean) => { socket.destroy(); resolve(open); };
    socket.once("connect", () => finish(true)); socket.once("error", () => finish(false)); socket.setTimeout(1000, () => finish(false));
  });
}

async function get(url: string): Promise<Response> { return fetch(url, { signal: AbortSignal.timeout(4000), redirect: "error", headers: { "cache-control": "no-cache" } }); }

export async function probeHttp(url: string, kind: "api" | "web", siteName: string): Promise<ServiceProbe> {
  if (!await portOpen(url)) return { ready: false, occupied: false, detail: "未运行" };
  try {
    const [health, schema, status] = await Promise.all([get(url + "/api/health"), get(url + "/openapi-v1.json"), get(url + "/api/geo/collection-status")]);
    if (!health.ok || !schema.ok || !status.ok) throw new LocalRecoveryError();
    const [h, s, c] = await Promise.all([health.json(), schema.json(), status.json()]);
    if (h.ok !== true || h.db !== "ok" || s.info?.title !== `${siteName} Public API` || !Array.isArray(c.sources) || typeof c.collector?.state !== "string") throw new LocalRecoveryError();
    if (kind === "web") {
      const page = await get(url + "/atlas"), html = await page.text();
      if (!page.ok || !page.headers.get("content-type")?.includes("text/html") || !/<title>[^<]*GEO[^<]*<\/title>/.test(html) || !html.includes(siteName)) throw new LocalRecoveryError();
    }
    return { ready: true, occupied: true, detail: "已识别本站，复用" };
  } catch { return { ready: false, occupied: true, detail: "端口已占用，但本站身份或健康检查未通过；保留现有进程" }; }
}

function databaseClient(settings: LocalSettings) { return postgres(settings.databaseUrl, { max: 1, connect_timeout: 3, idle_timeout: 0, max_lifetime: 0, onnotice: () => {}, connection: { statement_timeout: 4000 } }); }

async function probeDatabase(settings: LocalSettings): Promise<ServiceProbe> {
  if (!await portOpen(settings.databaseUrl)) return { ready: false, occupied: false, detail: "未运行" };
  const db = databaseClient(settings);
  try { await db`SELECT 1`; return { ready: true, occupied: true, detail: "已连接配置数据库，复用" }; }
  catch (error) {
    const starting = error && typeof error === "object" && "code" in error && error.code === "57P03";
    return { ready: false, occupied: true, detail: starting ? "数据库正在启动恢复，保留进程并等待；不要重复启动" : "数据库端口已占用但连接失败；请检查本机数据库和 .env" };
  }
  finally { await db.end({ timeout: 1 }); }
}

async function probeCollector(settings: LocalSettings): Promise<ServiceProbe> {
  const supervisor = await localProcessRunning(watchProcessScope(settings.root, settings.databaseUrl));
  const db = databaseClient(settings);
  try {
    const [row] = await db<{ held: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
      WHERE l.locktype='advisory' AND l.granted AND a.datname=current_database() AND l.classid=hashtext('geo-public-collector')::oid AND l.objid=hashtext('watch')::oid AND l.objsubid=2) AS held`;
    if (row.held) return { ready: true, occupied: true, detail: "采集 watch 锁存在，复用" };
    if (supervisor) return { ready: true, occupied: true, detail: "守护入口已运行，等待自动重试" };
    return { ready: false, occupied: false, detail: settings.collect ? "未运行" : "公开采集开关关闭" };
  } catch { return { ready: false, occupied: supervisor, detail: "无法核验采集锁，请先恢复数据库" }; }
  finally { await db.end({ timeout: 1 }); }
}

export async function probeLocal(settings: LocalSettings): Promise<LocalStatus> {
  const [database, api, web] = await Promise.all([probeDatabase(settings), probeHttp(settings.apiUrl, "api", settings.siteName), probeHttp(settings.webUrl, "web", settings.siteName)]);
  const collector = database.ready ? await probeCollector(settings) : { ready: false, occupied: false, detail: "等待数据库" };
  return { database, api, web, collector };
}

interface RecoveryActions {
  probe(): Promise<LocalStatus>;
  launch(service: Service): Promise<void>;
  migrate(): Promise<void>;
  build(): Promise<void>;
  hasBuild(): boolean;
  wait(service: Service): Promise<void>;
  report(message: string): void;
}

/** Decisions are testable without starting services or querying the user's database. */
export async function recoverLocal(settings: LocalSettings, actions: RecoveryActions, rebuild = false): Promise<LocalStatus> {
  let status = await actions.probe();
  if (rebuild && status.web.occupied) throw new LocalRecoveryError("网页端口正在使用，拒绝重建以免旧 SSR 与新 assets 混用。请先自行停止网页服务，再执行 --rebuild。");
  if (!status.database.ready) {
    if (status.database.occupied) throw new LocalRecoveryError(status.database.detail);
    await actions.launch("database"); await actions.wait("database"); status = await actions.probe();
  }
  if (!status.api.ready && status.api.occupied) throw new LocalRecoveryError(status.api.detail);
  if (!status.api.ready || settings.collect && !status.collector.ready) await actions.migrate();
  if (!status.api.ready) { await actions.launch("api"); await actions.wait("api"); }
  status = await actions.probe();
  if (!status.web.ready && status.web.occupied) throw new LocalRecoveryError(status.web.detail);
  if (rebuild || !status.web.ready && !actions.hasBuild()) {
    if (status.web.occupied) throw new LocalRecoveryError("网页仍在运行，不能覆盖其构建资源。");
    await actions.build();
  }
  if (!status.web.ready) { await actions.launch("web"); await actions.wait("web"); }
  status = await actions.probe();
  if (settings.collect && !status.collector.ready) { await actions.launch("collector"); await actions.wait("collector"); }
  else if (!settings.collect) actions.report("PUBLIC_FEED_COLLECT_ENABLED 未开启，保留现有设置。");
  return actions.probe();
}

async function runtimeActions(settings: LocalSettings): Promise<RecoveryActions> {
  const logs = path.join(settings.root, ".data/local-services");
  await mkdir(logs, { recursive: true });
  const env = localChildEnvironment(settings);
  const launch = async (name: string, args: string[], background: boolean, cwd = settings.root) => {
    const log = path.join(logs, `${name}-${Date.now()}.log`), fd = openSync(log, "a", 0o600);
    const child = spawn(process.execPath, args, { cwd, env, detached: background, windowsHide: true, stdio: ["ignore", fd, fd] });
    try { await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); }); }
    finally { closeSync(fd); }
    if (background) {
      child.unref(); await appendFile(path.join(logs, "launches.jsonl"), JSON.stringify({ service: name, pid: child.pid, startedAt: new Date().toISOString(), log }) + "\n", { mode: 0o600 });
      console.log(`${name} 已启动，PID ${child.pid}；日志：${log}`);
    } else {
      console.log(`${name} 执行中；日志：${log}`);
      const code = await new Promise<number | null>(resolve => {
        const deadline = setTimeout(() => { child.kill("SIGTERM"); resolve(null); }, name === "build" ? 180_000 : 120_000);
        child.once("exit", code => { clearTimeout(deadline); resolve(code); });
      });
      if (code !== 0) throw new LocalRecoveryError(`${name} 未完成，请检查本机日志：${log}`);
    }
  };
  return {
    probe: () => probeLocal(settings), report: console.log,
    hasBuild: () => existsSync(path.join(settings.root, "apps/web/build/server/index.js")),
    migrate: () => launch("migrate", [path.join(settings.root, "scripts/migrate.ts")], false),
    build: () => launch("build", [path.join(settings.root, "node_modules/@react-router/dev/bin.js"), "build"], false, path.join(settings.root, "apps/web")),
    launch: async service => {
      const files = { database: "scripts/local-db.mjs", api: "apps/api/src/main.ts", web: "apps/web/server.ts", collector: "modules/geo-directory/scripts/watch-public.ts" };
      if (service === "database" && (!existsSync(path.join(settings.root, ".data/postgres/PG_VERSION")) || !existsSync(path.join(settings.root, ".data/runtime/node_modules/embedded-postgres/dist/index.js")))) throw new LocalRecoveryError("本机数据库目录或运行库不存在；请先按 README 完成初始化。本入口不会新建或覆盖数据库目录。");
      await launch(service, [path.join(settings.root, files[service])], true);
    },
    wait: async service => {
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) { if ((await probeLocal(settings))[service].ready) return; await delay(1000); }
      throw new LocalRecoveryError(`${service} 启动后 60 秒内未通过核验；保留其他服务，请检查 .data/local-services 日志后重试。`);
    },
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help")) { console.log("node --env-file=.env scripts/geo-local.ts start|status [--rebuild]\n只管理本机服务；start 复用现有服务、补启动缺失项。--rebuild 仅在网页未运行时可用。没有开机任务，也不自动停止任何服务。"); return; }
  if (!["start", "status"].includes(args[0]) || args.slice(1).some(arg => arg !== "--rebuild") || args[0] === "status" && args.includes("--rebuild")) throw new LocalRecoveryError("使用 start 或 status；仅 start 支持 --rebuild。");
  const settings = localSettings();
  const release = args[0] === "start" ? await acquireLocalProcessLock(`start:${path.resolve(settings.root).toLowerCase()}`) : null;
  if (args[0] === "start" && !release) throw new LocalRecoveryError("另一个本机恢复命令正在执行，请等待后再检查 status。");
  try {
    const status = args[0] === "start" ? await recoverLocal(settings, await runtimeActions(settings), args.includes("--rebuild")) : await probeLocal(settings);
    for (const [name, state] of Object.entries(status)) console.log(`${name}: ${state.ready ? "可用" : "待处理"} · ${state.detail}`);
    console.log(`网页：${settings.webUrl}/all`);
    if (!status.database.ready || !status.api.ready || !status.web.ready || settings.collect && !status.collector.ready) process.exitCode = 1;
  } finally { await release?.(); }
}

if (import.meta.main) main().catch(error => { console.error(error instanceof LocalRecoveryError ? error.message : "本机恢复未完成，请核对配置、服务端口和 .data/local-services 日志；现有服务未被停止。"); process.exitCode = 1; });
