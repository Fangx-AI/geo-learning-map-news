import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {closeDb} from "@aihot/backend/db";
import {auditCachedTranslations} from "../backend/audit-translations.ts";

export async function main(args=process.argv.slice(2)){
  if(args.includes("--help")){console.log("Read-only audit of all current translations from enabled sources. No translation/network requests.\nnode --env-file=.env modules/geo-directory/scripts/audit-translations.ts [--out .data/translation-audit.json]\nReport contains source-version-bound original text, machine output, reviewed overlays and advisory findings. No --write option.");return;}
  if(args.length&&(args.length!==2||args[0]!=="--out"||!args[1]))throw new Error("Use --out path.json or --help; this command never writes to the database");
  const target=path.resolve(args[1]??".data/translation-audit.json");
  const report=await auditCachedTranslations();await mkdir(path.dirname(target),{recursive:true});await writeFile(target,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({path:target,readOnly:true,glossaryVersion:report.glossaryVersion,...report.totals}));
}
if(import.meta.main){try{await main();}catch(error){console.error(error instanceof Error?error.message:"Translation audit failed");process.exitCode=1;}finally{await closeDb();}}
