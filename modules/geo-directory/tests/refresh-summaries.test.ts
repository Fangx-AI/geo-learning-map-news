import test, { after } from "node:test";
import assert from "node:assert/strict";
import { sql, closeDb } from "@aihot/backend/db";
import { refreshStoredSummaries } from "../backend/refresh-summaries.ts";
import { PUBLIC_SUMMARY_VERSION } from "../backend/public-summary.ts";

after(closeDb);
test("stored excerpts no longer in RSS adopt cleanup once, preserving raw text and source metadata", async () => {
  for (const [id,enabled] of [["refresh-active",true],["refresh-other",true],["refresh-disabled",false]] as const)
    await sql`INSERT INTO geo_public_source_status(source_id,source_name,source_url,enabled) VALUES(${id},${id},'https://www.oncrawl.com/feed/',${enabled})`;
  const text = "AI can read most webpages just fine without a single line of schema. Large…";
  const raw = `${text} The post Do schema and structured data really matter for AI search? appeared first on Oncrawl .`;
  for (let n=0;n<8;n++) {
    const id = String(n).repeat(64), source = n===2 ? "refresh-other" : n===3 ? "refresh-disabled" : "refresh-active";
    const version = n===4 ? 0 : n===7 ? PUBLIC_SUMMARY_VERSION+1 : 1;
    await sql`INSERT INTO geo_public_items(id,canonical_id,source_id,source_name,source_url,title,summary,summary_raw,summary_version,summary_origin,summary_source_url,language,url,published_at,collected_at)
      VALUES(${id},${id},${source},'Oncrawl','https://www.oncrawl.com','AI search',${n===1 ? text : raw},${n===5 ? null : n===1 ? text : raw},${version},'rss',${n===6 ? null : 'https://www.oncrawl.com/feed/'},'en',${`https://www.oncrawl.com/test-${n}`},'2026-10-01T00:00:00Z','2026-10-02T00:00:00Z')`;
  }
  const before = await sql`SELECT * FROM geo_public_items ORDER BY id`;
  assert.deepEqual(await refreshStoredSummaries('refresh-active'),{updated:2,textChanged:1});
  assert.deepEqual(await refreshStoredSummaries('refresh-active'),{updated:0,textChanged:0});
  const afterRows = await sql`SELECT * FROM geo_public_items ORDER BY id`;
  for (let n=0;n<8;n++) {
    const expected = {...before[n]};
    if(n<2) { expected.summary=text; expected.summary_version=PUBLIC_SUMMARY_VERSION; }
    assert.deepEqual(afterRows[n],expected);
  }
  assert.deepEqual(await refreshStoredSummaries(),{updated:1,textChanged:1});
  assert.deepEqual(await refreshStoredSummaries(),{updated:0,textChanged:0});
});
