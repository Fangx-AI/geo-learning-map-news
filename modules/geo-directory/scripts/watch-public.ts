// Local supervisor: restart the collector after a database lease loss or unexpected exit.
// The child owns the database watch lock; another supervisor cannot run a competing cycle.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { acquireLocalProcessLock, watchProcessScope } from "../../../scripts/local-process-lock.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const releaseProcess = await acquireLocalProcessLock(watchProcessScope(root, process.env.DATABASE_URL ?? "postgres://127.0.0.1:5432/aihot"));
if (!releaseProcess) { console.log("此项目的公开采集守护已在运行，复用现有进程。"); process.exit(0); }

const stop = new AbortController();
let child: ReturnType<typeof spawn> | null = null;
const onStop = () => { stop.abort(); child?.kill("SIGTERM"); };
process.once("SIGINT", onStop); process.once("SIGTERM", onStop);
try {
  while (!stop.signal.aborted) {
    const code = await new Promise<number | null>((resolve, reject) => {
      child = spawn(process.execPath, [fileURLToPath(new URL("./collect-public.ts", import.meta.url)), "--watch", ...process.argv.slice(2)], { stdio: "inherit", windowsHide: true, env: process.env });
      child.once("error", reject); child.once("exit", resolve);
    });
    child = null;
    if (stop.signal.aborted) break;
    console.log(`公开采集进程结束（${code ?? "signal"}），5 分钟后重新启动。`);
    try { await delay(300_000, undefined, { signal: stop.signal }); } catch { if (!stop.signal.aborted) throw new Error("采集守护等待失败"); }
  }
} finally { process.removeListener("SIGINT", onStop); process.removeListener("SIGTERM", onStop); await releaseProcess(); }
