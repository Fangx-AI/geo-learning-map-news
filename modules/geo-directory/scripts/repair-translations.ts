import { readFile } from "node:fs/promises";
import { z } from "zod";
import { closeDb } from "@aihot/backend/db";
import { repairCachedTranslations } from "../backend/repair-translations.ts";
import { acquireCollectorLock } from "../backend/collector-runtime.ts";

const referenceSchema=z.object({
  itemId:z.string().regex(/^[a-f0-9]{64}$/),contentHash:z.string().regex(/^[a-f0-9]{64}$/),
  originalTitle:z.string().min(1).max(20000),originalSummary:z.string().max(20000).nullable(),originalLanguage:z.string().min(1).max(35),
  referenceTitle:z.string().max(20000),referenceSummary:z.string().max(20000).nullable(),publishable:z.boolean(),
});

export async function main(args=process.argv.slice(2)) {
  if (args.includes('--help')) {console.log('node --env-file=.env modules/geo-directory/scripts/repair-translations.ts [--write] [--references path.jsonl]\nDefault is a read-only preview. Pause the collector before --write; writes require its translation lease. No translation network requests.');return;}
  const write=args.includes('--write');
  const rest=args.filter(arg=>arg!=='--write');
  if (rest.length && (rest.length!==2 || rest[0]!=='--references')) throw new Error('Use --write and/or --references path.jsonl');
  const references=rest.length ? (await readFile(rest[1],'utf8')).split(/\r?\n/).filter(line=>line.trim()).map(line=>referenceSchema.parse(JSON.parse(line))) : [];
  const release=write ? await acquireCollectorLock('translation') : null;
  try {console.log(JSON.stringify({write,...await repairCachedTranslations({write,references})}));}
  finally {await release?.();}
}
if(import.meta.main){try{await main();}catch(error){console.error(error instanceof Error?error.message:'Translation repair failed');process.exitCode=1;}finally{await closeDb();}}
