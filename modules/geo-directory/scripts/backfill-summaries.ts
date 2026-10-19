import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { closeDb } from "@aihot/backend/db";
import { planSummaryBackfill, applySummaryBackfill } from "../backend/backfill-summaries.ts";

export async function main(args = process.argv.slice(2)) {
  if (args.includes("--help")) { console.log("Default: read-only source refresh and JSON plan.\nnode --env-file=.env modules/geo-directory/scripts/backfill-summaries.ts [--source id] [--limit 100] [--metadata-limit 5] [--post-limit 10] [--out output/summary-plan.json]\nApply an already reviewed plan, without more network requests:\nnode --env-file=.env modules/geo-directory/scripts/backfill-summaries.ts --apply output/summary-plan.json"); return; }
  const allowed = new Set(["--source", "--limit", "--out", "--metadata-limit", "--post-limit", "--apply"]);
  const options = new Map<string,string>();
  for (let i=0;i<args.length;i+=2) { if (!allowed.has(args[i]) || !args[i+1] || options.has(args[i])) throw new Error("Invalid summary backfill arguments; use --help"); options.set(args[i],args[i+1]); }
  if (options.has("--apply")) { if (options.size!==1) throw new Error("--apply takes only a reviewed plan path"); console.log(JSON.stringify(await applySummaryBackfill(JSON.parse(await readFile(options.get("--apply")!,"utf8"))))); return; }
  const integer = (name:string, fallback:number, max:number) => { const value=Number(options.get(name)??fallback); if (!Number.isInteger(value)||value<0||value>max) throw new Error(`Invalid ${name}`); return value; };
  const plan = await planSummaryBackfill({ sourceId: options.get("--source"), limit: integer("--limit",100,500), metadataLimit: integer("--metadata-limit",5,10), postLimit: integer("--post-limit",10,20) });
  const target = path.resolve(options.get("--out")??"output/summary-plan.json");
  await mkdir(path.dirname(target),{recursive:true}); await writeFile(target,JSON.stringify(plan,null,2)+"\n");
  console.log(JSON.stringify({ mode:"dry-run",path:target,examined:plan.examined,planned:plan.entries.length,textChanged:plan.entries.filter(entry=>entry.before.summary!==entry.after.summary).length,outcomes:plan.outcomes }));
}
if (import.meta.main) { try { await main(); } catch(error) { console.error(error instanceof Error?error.message:"Summary backfill failed");process.exitCode=1; } finally { await closeDb(); } }
