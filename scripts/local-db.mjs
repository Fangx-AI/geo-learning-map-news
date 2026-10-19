// Optional Windows-friendly development database. Production still uses docker-compose.yml.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { default: EmbeddedPostgres } = await import("../.data/runtime/node_modules/embedded-postgres/dist/index.js");
const connection = new URL(process.env.DATABASE_URL);
if (connection.hostname !== "127.0.0.1" || connection.port !== "55432") throw new Error("本地数据库脚本只用于 127.0.0.1:55432；请检查 DATABASE_URL。");
// Preserve startup/recovery diagnostics instead of leaving an empty service log.
const privateValues = [process.env.DATABASE_URL, connection.password, decodeURIComponent(connection.password)].filter(Boolean).sort((a, b) => b.length - a.length);
const logDatabase = (message) => {
  let text = message instanceof Error ? message.message : String(message);
  for (const value of privateValues) text = text.replaceAll(value, "[redacted]");
  console.error(text.trimEnd());
};
const databaseDir = path.join(root, ".data/postgres");
const database = new EmbeddedPostgres({
  databaseDir, user: decodeURIComponent(connection.username), password: decodeURIComponent(connection.password),
  port: 55432, persistent: true, authMethod: "scram-sha-256",
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
console.log(`GEO 本地 PostgreSQL 已启动：127.0.0.1:55432/${name}`);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
  if (stopping) return;
  stopping = true;
  await database.stop();
  process.exit(0);
});
setInterval(() => {}, 60_000);
