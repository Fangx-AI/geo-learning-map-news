import test,{after,beforeEach} from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify from "fastify";
import { config } from "@aihot/backend/config";
import { sql,closeDb } from "@aihot/backend/db";
import { feedbackSourceHash } from "@aihot/backend/operations/feedback";
import { passwordLogin,sessionPrincipal,SESSION_COOKIE } from "@aihot/backend/admin/auth";
import { loadGeoPublicItems } from "@aihot/backend/publication/geo-public";
import { loadGeoTranslations,loadGeoTranslationStatus } from "@aihot/backend/publication/geo-translations";
import { loadGeoOverviewInput } from "@aihot/backend/publication/geo-overview";
import geoModule from "../server.ts";
import { submitTranslationCorrection,reviewTranslationCorrection,readTranslationCorrection,listTranslationCorrections,CorrectionRejected,type CorrectionInput } from "../backend/translation-corrections.ts";
import { translatePublicBatch,translationHash } from "../backend/translate-public.ts";

after(closeDb);
beforeEach(async()=>{await sql`DELETE FROM geo_public_items`;await sql`DELETE FROM geo_public_source_status`;await sql`DELETE FROM feedback_bans`;});
const client={ip:"127.0.0.2",userAgent:"Firefox"};
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
async function fixture(name="correction",summary:string|null="We tested 100 AI search queries."):Promise<CorrectionInput> {
  const id=hash(name);
  await sql`INSERT INTO geo_public_source_status (source_id,source_name,source_url) VALUES (${name},'Correction test','https://example.com')`;
  await sql`INSERT INTO geo_public_items (id,canonical_id,title,summary,language,url,source_id,source_name,source_url)
    VALUES (${id},${id},'AI search citation experiment',${summary},'en',${'https://example.com/'+name},${name},'Correction test','https://example.com')`;
  return {itemId:id,original:{title:'AI search citation experiment',summary,language:'en'},proposed:{title:'AI 搜索引用实测',summary:summary?'我们测试了 100 条 AI 搜索查询。':null},note:'术语修订'};
}
async function machine(input:CorrectionInput) {
  await sql`INSERT INTO geo_public_translations(item_id,content_hash,title_original,summary_original,language_original,title_zh,summary_zh,status,provider,updated_at)
    VALUES (${input.itemId},${translationHash({id:input.itemId,...input.original})},${input.original.title},${input.original.summary},${input.original.language},'AI 搜索引用实验',${input.original.summary?'我们测试了100条AI搜索查询。':null},'done','fixture','2026-01-01T00:00:00Z')`;
}
const errorCode=(code:string)=>(error:unknown)=>error instanceof CorrectionRejected&&error.code===code;

test("pending corrections stay private; preview, apply, supersede and reject are version-bound",async()=>{
  const input=await fixture();await machine(input);
  const before=await loadGeoTranslationStatus();
  const suggestion=await submitTranslationCorrection(input,client);
  assert.equal((await loadGeoTranslations([input.itemId]))[0].translation?.provider,'fixture');
  assert.equal((await listTranslationCorrections()).length,1);
  const preview=await reviewTranslationCorrection(suggestion.id,'apply',{reviewer:'test-editor'});
  assert.equal(preview.write,false);assert.equal(preview.url,'https://example.com/correction');
  assert.equal((await readTranslationCorrection(suggestion.id))?.status,'pending');
  await reviewTranslationCorrection(suggestion.id,'apply',{write:true,reviewer:'test-editor'});
  const feed=await loadGeoPublicItems({q:'引用实测'});
  assert.equal(feed.items.length,1);assert.equal(feed.items[0].translation?.provider,'geo-reviewed-v1');
  const overview=await loadGeoOverviewInput();
  assert.equal(overview.items.find(item=>item.id===input.itemId)?.translation?.title,input.proposed.title);
  const batch=(await loadGeoTranslations([input.itemId]))[0];
  assert.deepEqual(batch.translation,{...input.proposed,language:'zh',provider:'geo-reviewed-v1'});
  assert.deepEqual({title:batch.title,summary:batch.summary,language:batch.language},input.original);
  const status=await loadGeoTranslationStatus();
  assert.ok(status.updatedAt!>before.updatedAt!);assert.equal(status.pending,0);
  for(const key of ['note','source_hash','reviewed_by','fingerprint']) assert.ok(!JSON.stringify(feed).includes(`"${key}"`));
  const second=await submitTranslationCorrection({...input,proposed:{...input.proposed,title:'AI 搜索引用：实测记录'}},{...client,ip:'127.0.0.3'});
  await reviewTranslationCorrection(second.id,'apply',{write:true,reviewer:'editor-two'});
  assert.equal((await readTranslationCorrection(suggestion.id))?.status,'superseded');
  const third=await submitTranslationCorrection({...input,proposed:{...input.proposed,title:'不准确的建议'}},{...client,ip:'127.0.0.4'});
  await reviewTranslationCorrection(third.id,'reject',{write:true,reviewer:'test-editor',note:'与原文不符'});
  assert.equal((await readTranslationCorrection(third.id))?.status,'rejected');
  assert.equal((await loadGeoTranslations([input.itemId]))[0].translation?.title,'AI 搜索引用：实测记录');
  await assert.rejects(reviewTranslationCorrection(third.id,'apply',{write:true,reviewer:'test-editor'}),errorCode('already_reviewed'));
  await sql`UPDATE geo_public_source_status SET enabled=false`;
  assert.equal((await loadGeoTranslations([input.itemId])).length,0);
  assert.equal((await loadGeoTranslationStatus()).total,0);
});

test("an in-flight machine translation cannot replace a reviewed correction; revised originals invalidate it",async()=>{
  const input=await fixture('in-flight');
  const suggestion=await submitTranslationCorrection(input,client);
  const result=await translatePublicBatch({translate:async()=>{
    await reviewTranslationCorrection(suggestion.id,'apply',{write:true,reviewer:'test-editor'});
    return {title:'后台机翻标题',summary:'后台机翻摘要',provider:'fixture'};
  }});
  assert.equal(result.translated,1);
  assert.equal((await loadGeoTranslations([input.itemId]))[0].translation?.title,input.proposed.title);
  await sql`UPDATE geo_public_translations SET status='error' WHERE item_id=${input.itemId}`;
  const corrected=await loadGeoTranslationStatus();assert.equal(corrected.retrying,0);assert.equal(corrected.pending,0);
  await sql`UPDATE geo_public_items SET summary='We retested 200 AI search queries.' WHERE id=${input.itemId}`;
  assert.equal((await loadGeoTranslations([input.itemId]))[0].translation,null);
  assert.equal((await loadGeoTranslationStatus()).pending,1);
  await assert.rejects(submitTranslationCorrection({...input,proposed:{...input.proposed,title:'另一版中文标题'}},client),errorCode('source_changed'));
  assert.equal((await translatePublicBatch({translate:async()=>({title:'新摘要对应标题',summary:'我们重新测试了200条AI搜索查询。',provider:'fixture'})})).translated,1);
  assert.equal((await loadGeoTranslations([input.itemId]))[0].translation?.title,'新摘要对应标题');
});

test("review refuses stale or disabled sources and percentage changes, accepts encoded source percentages",async()=>{
  const input=await fixture('stale-review');
  const suggestion=await submitTranslationCorrection(input,client);
  await sql`UPDATE geo_public_items SET language='fr' WHERE id=${input.itemId}`;
  await assert.rejects(reviewTranslationCorrection(suggestion.id,'apply',{write:true,reviewer:'editor'}),errorCode('source_changed'));
  assert.equal((await readTranslationCorrection(suggestion.id))?.status,'pending');
  await reviewTranslationCorrection(suggestion.id,'reject',{write:true,reviewer:'editor',note:'原文版本已变化'});
  const input2=await fixture('percentage','AI search traffic increased 25&#37;.');
  const bad=await submitTranslationCorrection({...input2,proposed:{...input2.proposed,summary:'AI 搜索流量增长了 35%。'}},client);
  await assert.rejects(reviewTranslationCorrection(bad.id,'apply',{write:true,reviewer:'editor'}),errorCode('invalid_translation'));
  const good=await submitTranslationCorrection({...input2,proposed:{...input2.proposed,summary:'AI 搜索流量增长了 25%。'}},client);
  await reviewTranslationCorrection(good.id,'apply',{write:true,reviewer:'editor'});
  assert.equal((await loadGeoTranslations([input2.itemId]))[0].translation?.summary,'AI 搜索流量增长了 25%。');
  const disabled=await submitTranslationCorrection({...input2,proposed:{title:'AI 搜索流量研究',summary:'AI 搜索流量增长了 25%。'}},{...client,ip:'other'});
  await sql`UPDATE geo_public_source_status SET enabled=false WHERE source_id='percentage'`;
  await assert.rejects(reviewTranslationCorrection(disabled.id,'apply',{write:true,reviewer:'editor'}),errorCode('source_changed'));
});

test("same-origin HTTP submission validates payloads, deduplicates, rate-limits and exposes no review API",async()=>{
  const input=await fixture('http');await machine(input);
  const app=Fastify();geoModule.http!(app);
  const origin=new URL(config.siteUrl).origin;
  const post=(payload:unknown,headers:Record<string,string>={origin})=>app.inject({method:'POST',url:'/api/geo/translation-corrections',payload:payload as object,headers});
  try {
    assert.equal((await post(input,{})).statusCode,403);
    assert.equal((await post(input,{origin:'https://unrelated.example'})).statusCode,403);
    assert.equal((await post(input,{origin,'sec-fetch-site':'cross-site'})).statusCode,403);
    assert.equal((await post({...input,proposed:{...input.proposed,title:'中'.repeat(2001)}})).statusCode,422);
    assert.equal((await post({...input,original:{...input.original,title:'outdated'}})).statusCode,409);
    assert.equal((await post({...input,proposed:{title:'AI 搜索引用实验',summary:'我们测试了100条AI搜索查询。'}})).statusCode,422);
    const first=await post(input);assert.equal(first.statusCode,201);assert.equal(first.headers['cache-control'],'no-store');
    const duplicate=await post(input);assert.equal(duplicate.statusCode,200);assert.deepEqual(duplicate.json(),first.json());
    for(let i=1;i<5;i++) assert.equal((await post({...input,proposed:{...input.proposed,title:`标题修订${i}`}})).statusCode,201);
    const limited=await post({...input,proposed:{...input.proposed,title:'第六次不同修订'}});
    assert.equal(limited.statusCode,429);assert.equal(limited.headers['retry-after'],'60');
    assert.equal((await app.inject({url:'/api/geo/translation-corrections'})).statusCode,404);
    assert.equal((await app.inject({url:'/api/geo/translation-corrections/'+first.json().id})).statusCode,404);
    const source=feedbackSourceHash('banned','Firefox');
    await sql`INSERT INTO feedback_bans (source_hash,reason) VALUES (${source},'test')`;
    await assert.rejects(submitTranslationCorrection(input,{ip:'banned',userAgent:'Firefox'}),errorCode('forbidden'));
  } finally {await app.close();}
});

test("concurrent duplicate submissions create one suggestion and null summaries cannot acquire invented content",async()=>{
  const input=await fixture('duplicate',null);
  const [a,b]=await Promise.all([submitTranslationCorrection(input,client),submitTranslationCorrection(input,client)]);
  assert.equal(a.id,b.id);assert.equal(Number(a.duplicate)+Number(b.duplicate),1);
  assert.equal((await listTranslationCorrections()).length,1);
  await assert.rejects(submitTranslationCorrection({...input,proposed:{...input.proposed,summary:'额外编写的摘要'}},client),errorCode('invalid_translation'));
  await assert.rejects(submitTranslationCorrection({...input,note:'x'.repeat(501)},client),errorCode('invalid_request'));
  await assert.rejects(reviewTranslationCorrection(a.id,'reject',{write:true,reviewer:'editor'}),errorCode('invalid_request'));
});

test("administrator review requires a live session and CSRF token and records the actual actor",async()=>{
  const input=await fixture('admin');await machine(input);
  const suggestion=await submitTranslationCorrection(input,client);
  const app=Fastify();geoModule.http!(app);
  const original={password:config.adminPassword,dev:config.devAdmin};
  config.adminPassword='correction-test-password';config.devAdmin=null;
  const url=`/api/admin/geo/translation-corrections/${suggestion.id}/review`;
  try {
    assert.equal((await app.inject({url:'/api/admin/geo/translation-corrections'})).statusCode,401);
    assert.equal((await app.inject({method:'POST',url,payload:{action:'apply'}})).statusCode,401);
    const {token}=await passwordLogin(config.adminPassword,'/admin','fixture');
    const cookie=`${SESSION_COOKIE}=${token}`;
    const principal=await sessionPrincipal(cookie);assert.ok(principal);
    const headers={cookie,'x-csrf-token':principal.csrf};
    const list=await app.inject({url:'/api/admin/geo/translation-corrections',headers});
    assert.equal(list.statusCode,200);assert.equal(list.json().rows[0].id,suggestion.id);
    assert.equal(list.json().rows[0].machine_title_zh,'AI 搜索引用实验');
    assert.ok(!Object.hasOwn(list.json().rows[0],'source_hash'));
    assert.equal(await geoModule.admin!.counts!.geoCorrections(),1);
    assert.equal((await app.inject({method:'POST',url,headers:{cookie},payload:{action:'apply'}})).statusCode,403);
    const invalid=await app.inject({method:'POST',url,headers,payload:{action:'reject'}});
    assert.equal(invalid.statusCode,422);assert.equal(invalid.json().code,'invalid_request');
    const applied=await app.inject({method:'POST',url,headers,payload:{action:'apply',note:'已对照原文'}});
    assert.equal(applied.statusCode,200);assert.equal(applied.json().status,'applied');
    assert.equal((await readTranslationCorrection(suggestion.id))?.reviewed_by,principal.name);
    assert.equal(await geoModule.admin!.counts!.geoCorrections(),0);
    const [audit]=await sql`SELECT actor,action FROM audit_log WHERE subject=${'geo-correction:'+suggestion.id}`;
    assert.equal(audit.actor,'admin:'+principal.userId);assert.equal(audit.action,'geo.translation.apply');
    assert.equal((await app.inject({method:'POST',url,headers,payload:{action:'apply'}})).statusCode,409);
  } finally {config.adminPassword=original.password;config.devAdmin=original.dev;await app.close();}
});
