import { closeDb } from "@aihot/backend/db";
import { listTranslationCorrections,readTranslationCorrection,reviewTranslationCorrection } from "../backend/translation-corrections.ts";

export async function main(args=process.argv.slice(2)) {
  if(!args.length||args.includes('--help')) {
    console.log('Usage: node --env-file=.env modules/geo-directory/scripts/review-corrections.ts list [pending|applied|rejected|superseded|all]\n  show ID\n  apply ID [--write] [--note "review note"]\n  reject ID --note "reason" [--write]\nApply/reject default to a read-only preview. Review source and proposal with show first. No network or model requests.');return;
  }
  const [command,arg,...flags]=args;
  if(command==='list'&&!flags.length){console.log(JSON.stringify(await listTranslationCorrections(arg),null,2));return;}
  const id=Number(arg);
  if(!Number.isSafeInteger(id)||id<1) throw new Error('Provide a positive correction ID');
  if(command==='show'&&!flags.length){console.log(JSON.stringify(await readTranslationCorrection(id),null,2));return;}
  if(command!=='apply'&&command!=='reject') throw new Error('Use list, show, apply or reject');
  let write=false,note:string|undefined;
  for(let i=0;i<flags.length;i++) {
    if(flags[i]==='--write'&&!write) write=true;
    else if(flags[i]==='--note'&&note===undefined&&flags[i+1]) note=flags[++i];
    else throw new Error('Use --write and/or --note "reason"');
  }
  console.log(JSON.stringify(await reviewTranslationCorrection(id,command,{write,note,reviewer:process.env.USERNAME||process.env.USER||'local-reviewer'}),null,2));
}
if(import.meta.main){try{await main();}catch(error){console.error(error instanceof Error?error.message:'Correction review failed');process.exitCode=1;}finally{await closeDb();}}
