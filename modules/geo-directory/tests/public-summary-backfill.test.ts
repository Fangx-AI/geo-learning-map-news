import test,{after} from "node:test";
import assert from "node:assert/strict";
import {sql,closeDb} from "@aihot/backend/db";
import {applySummaryBackfill,type SummaryBackfillPlan,type SummaryOriginal} from "../backend/backfill-summaries.ts";
import {makePublicSummary,PUBLIC_SUMMARY_VERSION} from "../backend/public-summary.ts";
after(closeDb);
test("reviewed summary backfill is idempotent and CAS protects original text, disabled sources, URLs and dates",async()=>{
  const source="summary-backfill-fixture";
  await sql`INSERT INTO geo_public_source_status(source_id,source_name,source_url) VALUES(${source},'Fixture','https://fixture.example')`;
  const entries=[];
  for(let i=0;i<6;i++){
    const before:SummaryOriginal={id:String(i).repeat(64),canonical_id:String(i).repeat(64),source_id:source,title:"AI search research",summary:"Original excerpt…",language:"en",url:`https://fixture.example/${i}`,summary_version:0};
    await sql`INSERT INTO geo_public_items(id,canonical_id,source_id,source_name,source_url,title,summary,language,url,published_at,collected_at) VALUES(${before.id},${before.canonical_id},${source},'Fixture','https://fixture.example',${before.title},${before.summary},${before.language},${before.url},'2026-01-02T00:00:00Z','2026-01-03T00:00:00Z')`;
    entries.push({before,after:makePublicSummary({text:"Original excerpt with a complete measured result of 42% and limitations.",sourceUrl:"https://fixture.example/feed",articleUrl:before.url,origin:"rss"})});
  }
  const plan:SummaryBackfillPlan={schemaVersion:1,summaryVersion:PUBLIC_SUMMARY_VERSION,createdAt:new Date().toISOString(),examined:6,entries,outcomes:[]};
  await sql`UPDATE geo_public_items SET title='Updated title' WHERE id=${entries[1].before.id}`;
  await sql`UPDATE geo_public_items SET summary='Updated summary' WHERE id=${entries[2].before.id}`;
  await sql`UPDATE geo_public_items SET language='fr' WHERE id=${entries[3].before.id}`;
  await sql`UPDATE geo_public_items SET url='https://fixture.example/changed' WHERE id=${entries[4].before.id}`;
  await sql`UPDATE geo_public_items SET canonical_id=${"f".repeat(64)} WHERE id=${entries[5].before.id}`;
  assert.deepEqual(await applySummaryBackfill(plan),{updated:1,skipped:5,textChanged:1});
  assert.deepEqual(await applySummaryBackfill(plan),{updated:0,skipped:6,textChanged:0});
  const [row]=await sql`SELECT title,url,published_at,collected_at,summary_raw,summary_version FROM geo_public_items WHERE id=${entries[0].before.id}`;
  assert.equal(row.title,entries[0].before.title);assert.equal(row.url,entries[0].before.url);assert.equal(row.published_at.toISOString(),"2026-01-02T00:00:00.000Z");assert.equal(row.collected_at.toISOString(),"2026-01-03T00:00:00.000Z");assert.equal(row.summary_raw,entries[0].after.summaryRaw);assert.equal(row.summary_version,PUBLIC_SUMMARY_VERSION);
  await sql`UPDATE geo_public_items SET summary_version=0,summary=${entries[0].before.summary} WHERE id=${entries[0].before.id}`;
  await sql`UPDATE geo_public_source_status SET enabled=false WHERE source_id=${source}`;
  assert.equal((await applySummaryBackfill(plan)).updated,0);
  const tampered=structuredClone(plan);tampered.entries[0].after.summary="Invented text";
  await assert.rejects(applySummaryBackfill(tampered),/no longer matches/);
});
