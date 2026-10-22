import { readFile, writeFile, mkdir, readdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { closeDb } from "@aihot/backend/db";
import { editionsFromThread, mergeEditionThreads, parseEdition, saveEdition } from "../modules/geo-directory/backend/editions.ts";
import { acquireLocalProcessLock } from "./local-process-lock.ts";

// Input is a private export of complete assistant messages, never a truncated thread preview.
const [file, sourceUrl] = process.argv.slice(2);
if (!file || !sourceUrl) throw new Error("Usage: node --env-file=.env scripts/import-geo-editions.ts messages.json source-url");
const dir = path.resolve(".data/daily-sync");
await mkdir(dir, { recursive: true });
const release = await acquireLocalProcessLock(`daily-sync:${dir.toLowerCase()}`);
if (!release) throw new Error("Another daily import is running");
try {
  const raw = await readFile(file, "utf8");
  const messages: unknown = JSON.parse(raw);
  if (Array.isArray(messages) && messages.length > 366) throw new Error("Too many reports");
  let result;
  if (Array.isArray(messages)) result = { editions: messages.map(m => parseEdition(m, sourceUrl)), pending: [], unframed: [], gaps: [] };
  else {
    mergeEditionThreads([messages]); // Validate source before archiving any input.
    const archive = path.join(dir, "snapshots");
    await mkdir(archive, { recursive: true });
    const hash = createHash("sha256").update(raw).digest("hex");
    await writeFile(path.join(archive, hash + ".json"), raw, { flag: "wx" }).catch(e => { if (e.code !== "EEXIST") throw e; });
    const files = (await readdir(archive)).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort();
    const snapshots = await Promise.all(files.map(name => readFile(path.join(archive, name), "utf8").then(JSON.parse)));
    result = editionsFromThread(mergeEditionThreads(snapshots), sourceUrl);
  }
  const { editions } = result;
  const published: { id: string; status: string }[] = [];
  for (const edition of editions) published.push({ id: edition.id, status: await saveEdition(edition) });
  // Missing parts need no database connection or unchanged-failure retries.
  // Unframed IDs are diagnostic only; they are never silently converted into complete editions.
  const summary = { checkedAt: new Date().toISOString(), complete: editions.length, published, pending: result.pending, gaps: result.gaps, unframed: result.unframed };
  await writeFile(path.join(dir, "import-status.tmp"), JSON.stringify(summary, null, 2));
  await rename(path.join(dir, "import-status.tmp"), path.join(dir, "import-status.json"));
  console.log(JSON.stringify(summary));
} finally { await closeDb(); await release(); }
