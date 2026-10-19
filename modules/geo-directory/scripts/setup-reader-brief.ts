// One pinned, resumable local instruction model; never modifies existing model directories.
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { READER_MODEL_ARTIFACT } from "../backend/reader-brief-artifact.ts";

const root = path.resolve(import.meta.dirname, "../../..");
export const READER_MODEL = READER_MODEL_ARTIFACT;

async function verified(file: string): Promise<boolean> {
  if (!existsSync(file) || (await stat(file)).size !== READER_MODEL.size) return false;
  const hash = createHash("sha256");
  for await (const part of createReadStream(file)) hash.update(part);
  return hash.digest("hex") === READER_MODEL.sha256;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help")) {
    console.log("node --env-file=.env modules/geo-directory/scripts/setup-reader-brief.ts\nDownloads a pinned Qwen3.5-4B community Q4_K_M GGUF (2.74 GB), with resume and SHA-256 validation. PUBLIC_READER_BRIEF_MODEL_PATH overrides .data/reader-brief/model.gguf. Reuses the existing llama runtime. Does not enable generation or change services.");
    return;
  }
  if (args.length) throw new Error("Unknown option; use --help");
  const file = path.resolve(process.env.PUBLIC_READER_BRIEF_MODEL_PATH || path.join(root, ".data/reader-brief/model.gguf"));
  const runtime = path.resolve(process.env.PUBLIC_READER_BRIEF_RUNTIME_PATH || path.join(root, ".data/translation/runtime", process.platform === "win32" ? "llama-server.exe" : "llama-server"));
  if (!existsSync(runtime)) throw new Error("Existing llama-server runtime is missing; no runtime is installed or replaced by this script");
  const data = path.join(root, ".data/reader-brief");
  await mkdir(data, { recursive: true });
  await mkdir(path.dirname(file), { recursive: true });
  if (existsSync(file) && !(await verified(file))) throw new Error("Existing model is not the pinned model; choose a new path rather than replacing it");
  if (!existsSync(file)) {
    const partial = `${file}.part`;
    const initial = existsSync(partial) ? (await stat(partial)).size : 0;
    if (initial > READER_MODEL.size) throw new Error("Partial model exceeds expected size; choose a new path; existing data preserved");
    if (!(await verified(partial))) {
      const started = Date.now();
      const log = createWriteStream(path.join(data, "download.log"), { flags: "a" });
      const args = ["--location", "--fail", "--retry", "3", "--retry-delay", "5", "--connect-timeout", "30", "--max-time", "3600", "--continue-at", "-", "--output", partial];
      if (process.env.EGRESS_PROXY_URL) args.push("--proxy", process.env.EGRESS_PROXY_URL);
      args.push(READER_MODEL.url);
      console.log(`Downloading ${READER_MODEL.name}: ${(READER_MODEL.size / 1024 ** 3).toFixed(2)} GiB; resume ${(initial / 1024 ** 2).toFixed(1)} MiB.`);
      const timer = setInterval(() => { void stat(partial).then(info => console.log(`Model ${(100 * info.size / READER_MODEL.size).toFixed(1)}%; ${((info.size-initial)/Math.max(1,(Date.now()-started)/1000)/1024**2).toFixed(2)} MiB/s`)).catch(() => {}); }, 30_000);
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(process.platform === "win32" ? "curl.exe" : "curl", args, { cwd: root, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
          child.stderr.pipe(log);
          const stop = () => { child.kill(); };
          const cleanup = () => { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); };
          process.once("SIGINT", stop); process.once("SIGTERM", stop);
          child.once("error", () => { cleanup(); reject(new Error("Could not start curl; no model files were removed")); });
          child.once("exit", code => { cleanup(); code === 0 ? resolve() : reject(new Error(`Download exited ${code}; rerun to resume the partial file`)); });
        });
      } finally { clearInterval(timer); log.end(); }
    }
    if (!(await verified(partial))) throw new Error("Model SHA-256 or size mismatch; partial file preserved, no model enabled");
    await rename(partial, file);
  }
  await writeFile(path.join(data, "model-manifest.json"), JSON.stringify({ ...READER_MODEL, file, runtime, verifiedAt: new Date().toISOString() }, null, 2) + "\n");
  console.log("Reader brief model verified. Automatic generation remains controlled by PUBLIC_READER_BRIEFS_ENABLED.");
}

if (import.meta.main) {
  try { await main(); } catch (error) { console.error(error instanceof Error ? error.message : "Reader model setup failed"); process.exitCode = 1; }
}
