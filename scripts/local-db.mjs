// Optional Windows-friendly development database. Production still uses docker-compose.yml.
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connection = new URL(process.env.DATABASE_URL);
const databasePort = Number(connection.port);
if (!/^postgres(?:ql)?:$/.test(connection.protocol) || connection.hostname !== "127.0.0.1" || !Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) throw new Error("本地数据库脚本只用于 127.0.0.1 的非特权端口；请检查 DATABASE_URL。");
const databaseDir = path.join(root, ".data/postgres");
// Existing Windows clusters must outlive the launcher. embedded-postgres attaches
// exit hooks that use taskkill /f /t, causing crash recovery when its wrapper exits.
// pg_ctl owns terminal detachment; do not install wrapper shutdown hooks here.
if (process.platform === "win32" && existsSync(path.join(databaseDir, "PG_VERSION"))) {
  const pgCtl = path.join(root, ".data/runtime/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe");
  const run = promisify(execFile);
  try {
    await run(pgCtl, ["status", "-D", databaseDir], { windowsHide: true });
    console.log("本机 PostgreSQL 已运行，保留现有进程。");
  } catch (error) {
    // pg_ctl status=3 means no server; other errors must not trigger another start.
    if (error.code !== 3) throw error;
    const logs = path.join(root, ".data/local-services");
    await mkdir(logs, { recursive: true });
    const log = path.join(logs, `postgres-native-${Date.now()}.log`);
    await run(pgCtl, ["start", "-D", databaseDir, "-l", log, "-o", `-h 127.0.0.1 -p ${databasePort}`, "-W"], { windowsHide: true });
    console.log(`已请求后台启动原数据库；就绪状态需另行核验。日志：${log}`);
  }
  process.exit(0);
}
const { default: EmbeddedPostgres } = await import("../.data/runtime/node_modules/embedded-postgres/dist/index.js");
// Preserve startup/recovery diagnostics instead of leaving an empty service log.
const privateValues = [process.env.DATABASE_URL, connection.password, decodeURIComponent(connection.password)].filter(Boolean).sort((a, b) => b.length - a.length);
const logDatabase = (message) => {
  let text = message instanceof Error ? message.message : String(message);
  for (const value of privateValues) text = text.replaceAll(value, "[redacted]");
  console.error(text.trimEnd());
};
const database = new EmbeddedPostgres({
  databaseDir, user: decodeURIComponent(connection.username), password: decodeURIComponent(connection.password),
  port: databasePort, persistent: true, authMethod: "scram-sha-256",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: logDatabase, onError: logDatabase,
});
if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await database.initialise();
await database.start();
const client = database.getPgClient("postgres", "127.0.0.1");
await client.connect();
const name = decodeURIComponent(connection.pathname.slice(1));
if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("数据库名只能含小写字母、数字和下划线。");
if (!(await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name])).rowCount) await database.createDatabase(name);
await client.end();
console.log(`GEO 本地 PostgreSQL 已启动：127.0.0.1:${databasePort}/${name}`);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
  if (stopping) return;
  stopping = true;
  await database.stop();
  process.exit(0);
});
setInterval(() => {}, 60_000);
