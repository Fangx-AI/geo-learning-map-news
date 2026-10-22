// Local service supervision. No model calls, content generation or process killing.
import { spawn } from "node:child_process";
import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { acquireLocalProcessLock } from "./local-process-lock.ts";

const root = path.resolve(import.meta.dirname, "..");
const release = await acquireLocalProcessLock(`service-watch:${root.toLowerCase()}`);
if (!release) { console.log("本机服务守护已运行，复用现有进程。"); process.exit(0); }
const dir = path.join(root, ".data/local-services");
await mkdir(dir, { recursive: true });
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopping = true; });
let previous = "";
try {
  while (!stopping) {
    // Reload .env on each recovery attempt; never keep a stale database port.
    const env = { ...process.env };
    for (const key of ["DATABASE_URL", "API_PORT", "WEB_PORT", "API_BASE_URL", "API_HOST", "WEB_HOST", "SITE_URL", "PUBLIC_FEED_COLLECT_ENABLED"]) delete env[key];
    const child = spawn(process.execPath, ["--env-file=.env", "scripts/geo-local.ts", "start"], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => { output = (output + String(chunk)).slice(-8000); });
    child.stderr.on("data", chunk => { output = (output + String(chunk)).slice(-8000); });
    const code = await new Promise<number | null>(resolve => { child.once("error", () => resolve(null)); child.once("exit", resolve); });
    const state = code === 0 ? "healthy" : "blocked";
    const status = { checkedAt: new Date().toISOString(), pid: process.pid, state, retryAfterSeconds: code === 0 ? 30 : 300, detail: output.trim() };
    await writeFile(path.join(dir, "supervisor-status.tmp"), JSON.stringify(status, null, 2));
    await rename(path.join(dir, "supervisor-status.tmp"), path.join(dir, "supervisor-status.json"));
    if (state !== previous) { console.log(`${status.checkedAt} ${state}\n${status.detail}`); previous = state; }
    // A foreign occupied port is reported, not killed or automatically reassigned.
    for (let seconds = 0; !stopping && seconds < status.retryAfterSeconds; seconds++) await delay(1000);
  }
} finally { await release(); }
