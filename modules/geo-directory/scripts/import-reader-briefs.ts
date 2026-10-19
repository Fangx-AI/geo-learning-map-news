import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sql, closeDb } from "@aihot/backend/db";
import { readerBriefImportSchema, readerBriefInputHash, saveReaderBrief } from "../backend/reader-brief.ts";

// Review files stay in .data/. This command never publishes their supporting evidence or source text.
const args = process.argv.slice(2);
const write = args.includes("--write");
const files = args.filter(arg => arg !== "--write");
try {
  if (files.length !== 1 || files[0]!.startsWith("--")) throw new Error("Usage: node --env-file=.env modules/geo-directory/scripts/import-reader-briefs.ts <reviewed.json> [--write]");
  const raw: unknown = JSON.parse(await readFile(resolve(files[0]!), "utf8"));
  if (!Array.isArray(raw)) throw new Error("Expected an array of reviewed reader briefs");
  const rows = raw.map(value => readerBriefImportSchema.parse(value));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("Duplicate item IDs in review file");
  let saved = 0;
  for (const row of rows) {
    if (write) {
      const result = await saveReaderBrief({ ...row, provenance: "reviewed" });
      if (result.saved) saved++;
      else process.exitCode = 1;
      console.log(JSON.stringify({ id: row.id, ...result }));
    } else {
      const [item] = await sql<{ url: string; title: string; summary: string | null }[]>`SELECT i.url,i.title,i.summary FROM geo_public_items i
        JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled WHERE i.id=${row.id}`;
      const valid = Boolean(item && item.url === row.sourceUrl && readerBriefInputHash(item) === row.inputHash);
      if (!valid) process.exitCode = 1;
      console.log(JSON.stringify({ id: row.id, valid, write: false }));
    }
  }
  console.log(JSON.stringify({ checked: rows.length, saved, write }));
} finally { await closeDb(); }
