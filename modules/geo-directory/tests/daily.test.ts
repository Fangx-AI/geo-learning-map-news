import test, { after } from "node:test";
import assert from "node:assert/strict";
import { sql, closeDb } from "@aihot/backend/db";
import { loadGeoDailyCandidates } from "@aihot/backend/publication/geo-public";
import { readerBriefInputHash, saveReaderBrief } from "../backend/reader-brief.ts";
import { buildGeoDailyDigest } from "../backend/daily.ts";
after(closeDb);

test("daily publication reads valid reviewed briefs and hides stale, disabled and private source fields", async () => {
  await sql`INSERT INTO geo_public_source_status(source_id,source_name,source_url,enabled,status) VALUES ('daily-on','Research','https://research.example',true,'ok'),('daily-off','Off','https://off.example',false,'ok')`;
  const brief = { conclusion: "研究对比了 AI 搜索中的引用行为，结果需要结合原始样本理解。", findings: ["该实验使用同一组问题，比较不同回答中的引用来源。"], geoValue: ["本站启示：按问题类型建立引用基线，不能把相关性当作因果。"], caveats: ["结果只覆盖原始实验的样本。"], coverage: "full-article" as const };
  for (const [n, source] of [[1, "daily-on"], [2, "daily-on"], [3, "daily-on"]] as const) {
    const item = { id: String(n).repeat(64), title: `AI search citation experiment ${n}`, url: `https://research.example/${n}`, summary: "We tested 100 AI search queries." };
    await sql`INSERT INTO geo_public_items(id,canonical_id,title,url,summary,source_id,source_name,source_url,published_at,collected_at) VALUES (${item.id},${item.id},${item.title},${item.url},${item.summary},${source},'Research','https://research.example','2020-01-01',now())`;
    await saveReaderBrief({ id: item.id, inputHash: readerBriefInputHash(item), sourceUrl: item.url, brief, provenance: "reviewed", evidence: { privateMarker: "never publish" } });
  }
  await sql`UPDATE geo_public_items SET summary='Changed source snapshot' WHERE id=${"2".repeat(64)}`;
  await sql`UPDATE geo_public_items SET source_id='daily-off' WHERE id=${"3".repeat(64)}`;
  const now = Date.now();
  const candidates = await loadGeoDailyCandidates(now);
  assert.equal(candidates.candidates.length, 2);
  assert.equal(candidates.candidates.find(i => i.item.id === "2".repeat(64))?.item.brief, undefined);
  const digest = buildGeoDailyDigest(candidates, now);
  assert.equal(digest.research.length, 1);
  assert.equal(digest.research[0].brief?.conclusion, brief.conclusion);
  assert.doesNotMatch(JSON.stringify(digest), /privateMarker|input_hash|body_hash|evidence|canonicalId/);
  await sql`UPDATE geo_public_reader_briefs SET created_at=now()-interval '2 days',updated_at=now() WHERE item_id=${"1".repeat(64)}`;
  assert.equal(buildGeoDailyDigest(await loadGeoDailyCandidates(Date.now())).research.length, 0, "revisions are not newly completed research");
  const library = buildGeoDailyDigest(await loadGeoDailyCandidates(Date.now(), true), Date.now(), true);
  assert.equal(library.view, "library");
  assert.deepEqual(library.research.map(item => item.id), ["1".repeat(64)], "history remains readable, stale/disabled briefs do not");
  assert.equal(library.research[0].briefAddedAt, null, "old completion must not be relabeled today");
  assert.doesNotMatch(JSON.stringify(library), /privateMarker|input_hash|body_hash|evidence|canonicalId/);
});
