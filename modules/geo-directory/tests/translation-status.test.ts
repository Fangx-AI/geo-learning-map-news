import test, { after } from "node:test";
import assert from "node:assert/strict";
import { sql, closeDb } from "@aihot/backend/db";
import { loadGeoTranslationStatus, loadGeoTranslations } from "../../../packages/backend/src/publication/geo-translations.ts";
import { acquireCollectorLock } from "../backend/collector-runtime.ts";

after(closeDb);
test("progress counts visible foreign originals, rejects stale translations, and reports real worker availability", async () => {
  await sql`INSERT INTO geo_public_source_status (source_id,source_name,source_url,enabled)
    VALUES ('translation-progress','Progress','https://example.com',true),('translation-hidden','Hidden','https://hidden.example',false)`;
  for (const [id,canonical,language,source] of [
    ['progress-a','canonical-a','en','translation-progress'],
    ['progress-copy','canonical-a','en','translation-progress'],
    ['progress-stale','canonical-b','fr','translation-progress'],
    ['progress-failure','canonical-c','ja','translation-progress'],
    ['progress-chinese','canonical-d','zh','translation-progress'],
    ['progress-hidden','canonical-e','en','translation-hidden'],
  ]) {
    await sql`INSERT INTO geo_public_items (id,canonical_id,title,summary,language,url,source_id,source_name,source_url,collected_at)
      VALUES (${id},${canonical},${id},'Original excerpt',${language},${'https://example.com/'+id},${source},'Progress','https://example.com',${id === 'progress-copy' ? '2026-10-16T01:00:00Z' : '2026-10-15T01:00:00Z'})`;
  }
  for (const [id,language,status,title] of [
    ['progress-a','en','done','progress-a'],
    ['progress-copy','en','done','progress-copy'],
    ['progress-stale','fr','done','outdated title'],
    ['progress-failure','ja','error','progress-failure'],
    ['progress-hidden','en','done','progress-hidden'],
  ]) await sql`INSERT INTO geo_public_translations (item_id,content_hash,title_original,summary_original,language_original,title_zh,summary_zh,status,provider)
    VALUES (${id},'fixture',${title},'Original excerpt',${language},'中文标题','中文摘要',${status},'fixture')`;

  let status = await loadGeoTranslationStatus();
  assert.deepEqual({total:status.total,translated:status.translated,pending:status.pending,retrying:status.retrying,state:status.state},
    {total:3,translated:1,pending:2,retrying:1,state:'paused'});
  assert.ok(status.updatedAt); assert.equal(status.retryAt,null);
  const refresh=await loadGeoTranslations(['progress-a','progress-stale','progress-failure','progress-hidden','progress-missing','progress-a']);
  assert.equal(refresh.length,3);
  assert.equal(refresh.find(item=>item.id==='progress-a')?.translation?.title,'中文标题');
  assert.equal(refresh.find(item=>item.id==='progress-stale')?.translation,null);
  assert.equal(refresh.find(item=>item.id==='progress-failure')?.translation,null);
  assert.equal(refresh.find(item=>item.id==='progress-a')?.title,'progress-a');
  const release=await acquireCollectorLock('translation');
  try {
    assert.equal((await loadGeoTranslationStatus()).state,'running');
    await sql`INSERT INTO geo_public_translation_runtime (provider,retry_after,last_error) VALUES ('bing',now()+interval '5 minutes','private diagnostic')`;
    status=await loadGeoTranslationStatus();
    assert.equal(status.state,'waiting'); assert.ok(status.retryAt);
    assert.ok(!JSON.stringify(status).includes('private diagnostic'));
  } finally {await release();}
  await sql`UPDATE geo_public_translations SET status='done',title_original=item_id WHERE item_id IN ('progress-stale','progress-failure')`;
  status=await loadGeoTranslationStatus();
  assert.equal(status.state,'complete'); assert.equal(status.pending,0); assert.equal(status.translated,3);
});
