import test,{after} from "node:test";
import assert from "node:assert/strict";
import {sql,closeDb} from "@aihot/backend/db";
import {auditCachedTranslations} from "../backend/audit-translations.ts";
import {repairCachedTranslations} from "../backend/repair-translations.ts";
import {translationHash} from "../backend/translate-public.ts";
import {GEO_TRANSLATION_VERSION} from "../../../industry/translation.ts";
after(closeDb);

test("audit is read-only, version-matched and separates reviewed overlays; repair skips reviewed corrections and disabled sources",async()=>{
 const title="Google June 2026 Spam Update",summary="Google search update details.";
 for(const name of ["machine","reviewed","disabled","stale","incomplete","edited"]){
  const id=`audit-${name}`;await sql`INSERT INTO geo_public_source_status(source_id,source_name,source_url,enabled) VALUES(${id},${name},'https://example.com',${name!=="disabled"})`;
  await sql`INSERT INTO geo_public_items(id,title,summary,language,url,source_id,source_name,source_url,summary_version,published_at)
    VALUES(${id},${title},${summary},'en',${'https://example.com/'+name},${id},${name},'https://example.com',1,'2026-01-02T00:00:00Z')`;
  await sql`INSERT INTO geo_public_translations(item_id,content_hash,title_original,summary_original,language_original,title_zh,summary_zh,status,provider,updated_at)
    VALUES(${id},${translationHash({id,title,summary,language:'en'})},${name==='stale'?'Previous title':title},${summary},'en','Google 2026年6月垃圾邮件更新',${name==='incomplete'?null:'Google 搜索更新详情。'},'done',${name==='edited'?'geo-edited-v2':'bing'},'2026-10-17T00:00:00.123456Z')`;
 }
 await sql`INSERT INTO geo_translation_corrections(item_id,title_original,summary_original,language_original,title_zh,summary_zh,source_hash,fingerprint,status,reviewed_at)
   VALUES('audit-reviewed',${title},${summary},'en','Google 2026年6月垃圾内容更新','Google 搜索更新详情。','fixture','fixture','applied',now())`;
 const report=await auditCachedTranslations();assert.equal(report.totals.examined,3);assert.equal(report.totals.reviewedOverlays,1);assert.equal(report.totals.repairableUnreviewed,1);assert.equal(report.totals.hashMismatches,0);
 const overlay=report.records.find(row=>row.itemId==='audit-reviewed')!;assert.ok(overlay.machineFindings.some(f=>f.action==='cache-repair'));assert.equal(overlay.visibleFindings.length,0);
 assert.equal((await sql`SELECT title_zh FROM geo_public_translations WHERE item_id='audit-machine'`)[0].title_zh,'Google 2026年6月垃圾邮件更新');
 const preview=await repairCachedTranslations();assert.equal(preview.reviewed,2);assert.equal(preview.normalized,1);
 const written=await repairCachedTranslations({write:true});assert.equal(written.reviewed,2);assert.equal(written.normalized,1);assert.equal(written.stale,0,'timestamp CAS must retain PostgreSQL microseconds');
 const [fixed]=await sql`SELECT t.title_zh,t.provider,i.title,i.summary,i.url,i.published_at FROM geo_public_translations t JOIN geo_public_items i ON i.id=t.item_id WHERE t.item_id='audit-machine'`;
 assert.equal(fixed.title_zh,'Google 2026年6月垃圾内容更新');assert.equal(fixed.provider,GEO_TRANSLATION_VERSION);assert.equal(fixed.title,title);assert.equal(fixed.summary,summary);assert.equal(fixed.url,'https://example.com/machine');assert.equal(fixed.published_at.toISOString(),'2026-01-02T00:00:00.000Z');
 for(const id of ['audit-reviewed','audit-disabled','audit-edited'])assert.equal((await sql`SELECT title_zh FROM geo_public_translations WHERE item_id=${id}`)[0].title_zh,'Google 2026年6月垃圾邮件更新');
 assert.equal((await repairCachedTranslations({write:true})).normalized,0);
});
