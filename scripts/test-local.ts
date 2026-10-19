// Local test entry: reuse only the database connection from .env, never the application's
// credentials, proxy, model presets or disabled development valves. Each run gets a fresh DB.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { parseEnv } from "node:util";
import postgres from "postgres";

const root = path.resolve(import.meta.dirname, "..");
const systemKeys = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "LANG", "LC_ALL", "TERM", "NO_COLOR", "FORCE_COLOR"]);

export function testEnvironment(envText: string, system: NodeJS.ProcessEnv = process.env, standalone = false): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(system)) if (systemKeys.has(key.toUpperCase())) env[key] = value;
  let database: URL;
  try { database = new URL(standalone ? "postgres://unreachable@127.0.0.1:1/standalone_test" : parseEnv(envText).DATABASE_URL ?? ""); }
  catch { throw new Error(".env 中缺少有效的 DATABASE_URL；未运行测试。"); }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname)) throw new Error("本机测试入口只接受本机 PostgreSQL；未运行测试。");
  database.pathname = standalone ? "/standalone_test" : `/geo_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}_test`;
  Object.assign(env, {
    DATABASE_URL: database.toString(), AIHOT_CREDENTIALS_DIR: "/nonexistent-test-credentials",
    MODEL_CALLS_ENABLED: "true", COLLECT_ENABLED: "true", PUBLIC_FEED_COLLECT_ENABLED: "false", PUBLIC_TRANSLATION_ENABLED: "false",
    FEISHU_CONTENT_PUSH_ENABLED: "false", FEISHU_INTERNAL_ENABLED: "false", INDEXNOW_SUBMIT_ENABLED: "false",
    SESSION_SECRET: "test-session-secret-0123456789", IMG_PROXY_SIGN_SECRET: "test-img-secret-0123456789", LOG_LEVEL: "error",
  });
  return env;
}

export function testArguments(args: string[]) {
  const standalone = args.includes("--standalone");
  const concurrency = args.find(arg => arg.startsWith("--concurrency="))?.slice(14) ?? "4";
  if (!/^[1-6]$/.test(concurrency)) throw new Error("--concurrency 必须是 1 至 6。");
  const files = args.filter(arg => arg !== "--standalone" && !arg.startsWith("--concurrency="));
  if (files.some(file => !/^(tests\/|modules\/[a-z0-9*_-]+\/tests\/)[a-z0-9*_.-]+\.test\.ts$/i.test(file))) throw new Error("只接受 tests/ 或 modules/*/tests/ 下的测试路径或通配符。");
  if (standalone && files.some(file => !file.endsWith(".standalone.test.ts"))) throw new Error("--standalone 只运行 .standalone.test.ts 文件。");
  return { standalone, nodeArgs: [
    ...(standalone ? ["--import", "./tests/standalone.ts"] : ["--test-global-setup=tests/databases.ts", "--import", "./tests/databases.ts"]),
    "--test", `--test-concurrency=${concurrency}`, "--test-timeout=120000",
    ...(files.length ? files : standalone ? ["tests/*.standalone.test.ts", "modules/*/tests/*.standalone.test.ts"] : ["tests/*.test.ts", "modules/*/tests/*.test.ts"]),
  ] };
}

export function redactTestOutput(line: string, databaseUrl: string): string {
  const connection = new URL(databaseUrl);
  const secrets = [databaseUrl, connection.password, decodeURIComponent(connection.password)].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const secret of secrets) line = line.replaceAll(secret, "[redacted]");
  return line;
}

export interface TestCleanupClient {
  listDatabases(template: string, copyPattern: string): Promise<string[]>;
  hasConnections(name: string): Promise<boolean>;
  dropDatabase(name: string): Promise<void>;
  close(): Promise<void>;
}
export interface TestCleanupResult {
  dropped: string[];
  retained: Array<{ name: string; reason: string }>;
  error?: string;
}

function cleanupFailure(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return /^[A-Z0-9_]{1,24}$/.test(code) ? `数据库清理失败（${code}）` : "数据库清理失败";
}

function cleanupClient(databaseUrl: string): TestCleanupClient {
  const admin = new URL(databaseUrl);
  admin.pathname = "/postgres";
  const db = postgres(admin.href, { max: 1, prepare: false, connect_timeout: 5, idle_timeout: 5, onnotice: () => {},
    connection: { application_name: "geo-test-local-cleanup", statement_timeout: 5000, lock_timeout: 1000 } });
  return {
    listDatabases: async (template, copyPattern) => (await db<{ datname: string }[]>`SELECT datname FROM pg_database WHERE datname = ${template} OR datname ~ ${copyPattern}`).map(row => row.datname),
    hasConnections: async name => (await db`SELECT 1 FROM pg_stat_activity WHERE datname = ${name} LIMIT 1`).length > 0,
    // No FORCE: a connection appearing after the check must make DROP fail, never be killed.
    dropDatabase: async name => { await db`DROP DATABASE IF EXISTS ${db(name)}`; },
    close: () => db.end({ timeout: 2 }),
  };
}

/** Only the random template generated by this invocation and its exact worker names are owned. */
export async function cleanupTestDatabases(databaseUrl: string, expectedTemplate: string, connect = cleanupClient): Promise<TestCleanupResult> {
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || url.search || url.hash || url.pathname !== `/${expectedTemplate}` || !/^geo_[a-z0-9]{8,10}_[a-f0-9]{12}_test$/.test(expectedTemplate)) {
    throw new Error("拒绝清理：仅允许本轮生成的本机随机测试数据库。");
  }
  const copyPattern = `^${expectedTemplate}_f[1-9][0-9]{0,9}_[a-f0-9]{8}_test$`;
  const copies = new RegExp(copyPattern);
  const result: TestCleanupResult = { dropped: [], retained: [] };
  let client: TestCleanupClient | undefined;
  try {
    client = connect(databaseUrl);
    const names = [...new Set(await client.listDatabases(expectedTemplate, copyPattern))]
      .filter(name => name === expectedTemplate || copies.test(name))
      .sort((a, b) => a === expectedTemplate ? 1 : b === expectedTemplate ? -1 : a.localeCompare(b));
    for (const name of names) {
      if (name === expectedTemplate && result.retained.length) {
        result.retained.push({ name, reason: "本轮副本尚未全部清理" });
        continue;
      }
      try {
        if (await client.hasConnections(name)) result.retained.push({ name, reason: "仍有数据库连接，未执行删除" });
        else { await client.dropDatabase(name); result.dropped.push(name); }
      } catch (error) { result.retained.push({ name, reason: cleanupFailure(error) }); }
    }
  } catch (error) { result.error = cleanupFailure(error); }
  finally {
    try { await client?.close(); }
    catch (error) { result.error ??= cleanupFailure(error); }
  }
  return result;
}

export function exitAfterCleanup(testCode: number, cleanup: TestCleanupResult): number {
  return testCode || (cleanup.error || cleanup.retained.length ? 1 : 0);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help")) {
    console.log("node scripts/test-local.ts [--standalone] [--concurrency=1..6] [tests/example.test.ts ...]\n默认运行完整后端测试；仅读 .env 的本机数据库连接，新建随机 *_test 数据库。测试仅使用本地假服务，应用凭据与代理不继承。");
    return;
  }
  const { standalone, nodeArgs } = testArguments(args);
  let envText = "";
  if (!standalone) {
    try { envText = readFileSync(path.join(root, ".env"), "utf8"); }
    catch { throw new Error("缺少本机 .env；先完成 README 的本机初始化。"); }
  }
  const env = testEnvironment(envText, process.env, standalone);
  console.log(`独立测试数据库：${new URL(env.DATABASE_URL!).pathname.slice(1)}；模型/采集仅由测试连接本地假服务，公开采集与推送关闭。`);
  let testCode = 1;
  try {
    const child = spawn(process.execPath, nodeArgs, { cwd: root, env, windowsHide: true, stdio: ["inherit", "pipe", "pipe"] });
    // Some failing CLI tests include their command in diagnostics. Redact the sole inherited
    // credential before forwarding complete lines, including when a chunk splits a password.
    const output = [createInterface({ input: child.stdout }), createInterface({ input: child.stderr })];
    output.forEach((lines, index) => lines.on("line", line => (index ? process.stderr : process.stdout).write(redactTestOutput(line, env.DATABASE_URL!) + "\n")));
    testCode = await new Promise<number>(resolve => {
      child.once("error", () => console.error("无法启动测试进程。"));
      child.once("close", code => resolve(code ?? 1));
    });
  } finally {
    process.exitCode = testCode;
    if (!standalone) {
      let cleanup: TestCleanupResult;
      try { cleanup = await cleanupTestDatabases(env.DATABASE_URL!, new URL(env.DATABASE_URL!).pathname.slice(1)); }
      catch { cleanup = { dropped: [], retained: [], error: "清理范围验证未通过，未连接数据库" }; }
      console.log(`本轮测试库清理：删除 ${cleanup.dropped.length}，保留 ${cleanup.retained.length}；测试退出码 ${testCode}。`);
      for (const item of cleanup.retained) console.error(`${item.name}：${item.reason}`);
      if (cleanup.error) console.error(`${cleanup.error}；本轮测试库可能仍有遗留，未扩大清理范围。`);
      process.exitCode = exitAfterCleanup(testCode, cleanup);
    }
  }
}

if (import.meta.main) main().catch(error => { console.error(error instanceof Error ? error.message : "本机测试未完成。"); process.exitCode = 1; });
