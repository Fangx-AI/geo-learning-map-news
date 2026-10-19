// Workspace-local, resumable downloads of the official offline translation model and runtime.
import { existsSync, createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../../..");
const data = path.join(root, ".data/translation");
const MODEL = {
  url: "https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/a0c709d9fac510f2c807aa3af52872340dc37a4a/Hy-MT2-1.8B-Q4_K_M.gguf",
  size: 1133080448,
  sha256: "dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699",
};
const RUNTIME = {
  url: "https://github.com/ggml-org/llama.cpp/releases/download/b11696/llama-b11696-bin-win-cpu-x64.zip",
  size: 19575690,
  sha256: "1e7c47dff58467540d53e6cf302d83951bcb165afb252c2952ed3872190fc60d",
};

async function hash(file: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const part of createReadStream(file)) digest.update(part);
  return digest.digest("hex");
}

async function valid(file: string, item: { size: number; sha256: string }): Promise<boolean> {
  return existsSync(file) && (await stat(file)).size === item.size && await hash(file) === item.sha256;
}

async function download(file: string, item: { url: string; size: number; sha256: string }): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  if (await valid(file, item)) { console.log(`${path.basename(file)} already verified.`); return; }
  const partial = `${file}.part`;
  if (!(await valid(partial, item))) {
    const initial = existsSync(partial) ? (await stat(partial)).size : 0;
    const started = Date.now();
    const log = createWriteStream(`${file}.download.log`, { flags: "a" });
    const args = ["--location", "--fail", "--retry", "4", "--retry-delay", "2", "--connect-timeout", "30", "--max-time", "1800", "--continue-at", "-", "--output", partial];
    if (process.env.EGRESS_PROXY_URL) args.push("--proxy", process.env.EGRESS_PROXY_URL);
    args.push(item.url);
    console.log(`Downloading ${path.basename(file)} (${(item.size / 1024 ** 2).toFixed(1)} MiB; resume ${(initial / 1024 ** 2).toFixed(1)} MiB)…`);
    const timer = setInterval(() => {
      void stat(partial).then(info => console.log(`${path.basename(file)}: ${(100 * info.size / item.size).toFixed(1)}%, ${((info.size - initial) / Math.max(1, (Date.now() - started) / 1000) / 1024 ** 2).toFixed(2)} MiB/s`)).catch(() => {});
    }, 30_000);
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.platform === "win32" ? "curl.exe" : "curl", args, { cwd: root, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
        child.stderr.pipe(log);
        child.once("error", reject);
        child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Download exited ${code}; rerun to resume: ${path.basename(file)}`)));
      });
    } finally { clearInterval(timer); log.end(); }
  }
  if (!(await valid(partial, item))) throw new Error(`SHA-256 or size mismatch: ${path.basename(file)}; partial download retained`);
  await rename(partial, file);
  console.log(`${path.basename(file)} verified.`);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help")) {
    console.log("node --env-file=.env modules/geo-directory/scripts/setup-translation.ts\nDownloads official Tencent Hy-MT2-1.8B Q4_K_M and a pinned llama.cpp Windows CPU runtime into .data/translation. Resumes partial files and verifies SHA-256. Requires curl. No API key or model account required.");
    return;
  }
  if (args.length) throw new Error("Unknown option; use --help");
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("This installer packages Windows x64. On Linux install the official llama.cpp CPU binary at .data/translation/runtime/llama-server and place the verified model at .data/translation/models/model.gguf.");
  await mkdir(data, { recursive: true });
  const model = path.join(data, "models/model.gguf");
  const archive = path.join(data, "downloads/llama-b11696-bin-win-cpu-x64.zip");
  await Promise.all([download(model, MODEL), download(archive, RUNTIME)]);
  const runtime = path.join(data, "runtime");
  await mkdir(runtime, { recursive: true });
  let installedRuntime = false;
  try {
    const previous = JSON.parse(await readFile(path.join(data, "models.json"), "utf8"));
    installedRuntime = previous.runtime?.sha256 === RUNTIME.sha256 && existsSync(path.join(runtime, "llama-server.exe"));
  } catch { /* First installation, or an incomplete setup with no manifest yet. */ }
  // Fixed workspace paths are passed as separate process arguments; the archive
  // is verified against the official release's SHA-256 before extraction. Do
  // not overwrite an already installed runtime: Windows may be running it.
  if (!installedRuntime) await new Promise<void>((resolve, reject) => {
    const script = "param([string]$Archive,[string]$Destination) Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force";
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", `& { ${script} }`, archive, runtime], { cwd: root, windowsHide: true, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Runtime extraction exited ${code}`)));
  });
  if (!existsSync(path.join(runtime, "llama-server.exe"))) throw new Error("Downloaded runtime did not contain llama-server.exe");
  await writeFile(path.join(data, "models.json"), JSON.stringify({ provider: "hunyuan-mt2", model: { ...MODEL, file: model }, runtime: { ...RUNTIME, directory: runtime }, installedAt: new Date().toISOString() }, null, 2) + "\n");
  console.log("Offline translation installed and verified. The translation worker starts the local runtime when needed.");
}

if (import.meta.main) {
  try { await main(); } catch (error) { console.error(error instanceof Error ? error.message : "Offline translation setup failed"); process.exitCode = 1; }
}
