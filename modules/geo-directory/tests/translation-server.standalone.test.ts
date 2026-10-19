import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const guardian = fileURLToPath(new URL("../scripts/translation-server.ts", import.meta.url));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function gone(pid: number) {
  const deadline = Date.now() + 6000;
  while (alive(pid) && Date.now() < deadline) await delay(50);
  assert.equal(alive(pid), false, "model process must not outlive its parent");
}
test("closing the worker pipe releases its native model child", async () => {
  const child = spawn(process.execPath, [guardian, process.execPath, "-e", "setInterval(()=>{},1000)"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const [line] = await once(child.stdout, "data");
  const { pid } = JSON.parse(String(line));
  assert.equal(alive(pid), true);
  child.stdin.end();
  await gone(pid);
});
test("an abruptly terminated worker cannot leave the model running", async () => {
  const code = `const {spawn}=require('node:child_process'); const p=spawn(process.execPath,${JSON.stringify([guardian, process.execPath, "-e", "setInterval(()=>{},1000)"])},{windowsHide:true,stdio:['pipe','pipe','ignore']}); p.stdout.pipe(process.stdout);`;
  const parent = spawn(process.execPath, ["-e", code], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  const [line] = await once(parent.stdout, "data");
  const { pid } = JSON.parse(String(line));
  assert.equal(alive(pid), true);
  parent.kill("SIGKILL");
  await gone(pid);
});
