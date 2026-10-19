// Keep the model lifetime tied to the worker's stdin pipe, including an abrupt Windows termination.
// Killing a Node parent on Windows does not otherwise terminate its native child processes.
import { spawn } from "node:child_process";

const [binary, ...args] = process.argv.slice(2);
if (!binary) throw new Error("Missing translation runtime");
const child = spawn(binary, args, { windowsHide: true, stdio: ["ignore", "ignore", "inherit"] });
const stop = () => { child.kill(); };
process.stdin.resume();
process.stdin.once("end", stop); process.stdin.once("error", stop);
process.once("SIGINT", stop); process.once("SIGTERM", stop);
process.once("exit", stop);
child.once("spawn", () => { process.stdout.write(JSON.stringify({ pid: child.pid }) + "\n"); });
child.once("error", () => process.exit(1));
child.once("exit", code => process.exit(code ?? 0));
