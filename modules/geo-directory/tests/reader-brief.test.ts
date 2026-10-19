import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sql, closeDb } from "@aihot/backend/db";
import { loadGeoPublicItem, loadGeoPublicItems } from "@aihot/backend/publication/geo-public";
import { loadGeoOverviewInput } from "@aihot/backend/publication/geo-overview";
import { readerBriefInputHash, readerBriefSchema, readerBriefImportSchema, saveReaderBrief, type ReaderBrief } from "../backend/reader-brief.ts";

after(closeDb);
beforeEach(async () => { await sql`DELETE FROM geo_public_items`; await sql`DELETE FROM geo_public_source_status`; });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const brief: ReaderBrief = {
  conclusion: "这次实测发现，AI 回答中的引用变化不一定来自网站排名变化。",
  findings: ["研究跟踪了 100 个查询；其中 20 个查询的引用来源发生变化。", "研究只比较同一查询的两次结果，没有将引用变化归因于某个排名因素。"],
  geoValue: ["对 GEO 的启示是同时记录查询、回答与引用来源，避免把单次变化误判成优化效果。"],
  caveats: ["两次观察无法说明长期趋势或证明因果关系。"],
  coverage: "full-article",
};
async function fixture(name: string, override: Record<string, unknown> = {}) {
  const row = { id: hash(name), canonical_id: hash(name), title: "A study of AI search citations", summary: "We compared 100 queries.",
    url: `https://research.example/${name}`, language: "en", source_id: name, source_name: "Original Research", source_url: "https://research.example", ...override };
  await sql`INSERT INTO geo_public_source_status (source_id,source_name,source_url) VALUES (${row.source_id},${row.source_name},${row.source_url}) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO geo_public_items ${sql(row)}`;
  return row;
}
function input(row: { id: string; url: string; title: string; summary: string | null }) {
  return { id: row.id, inputHash: readerBriefInputHash(row), sourceUrl: row.url, brief, provenance: "reviewed" as const,
    evidence: { quote: "private evidence, not publication", body: "private full article body" } };
}

test("single-reader publication exposes only the current short brief and leaves list payloads unchanged", async () => {
  const row = await fixture("reader-brief-publication");
  assert.deepEqual(await saveReaderBrief(input(row)), { saved: true });
  const detail = await loadGeoPublicItem(row.id);
  assert.deepEqual({ ...detail!.brief, updatedAt: undefined }, { ...brief, updatedAt: undefined });
  assert.ok(!Number.isNaN(Date.parse(detail!.brief!.updatedAt)));
  assert.equal(detail!.summary, row.summary, "a synthesis must not overwrite the original source excerpt");
  assert.deepEqual(Object.keys(detail!.brief!).sort(), ["conclusion", "findings", "geoValue", "caveats", "coverage", "updatedAt"].sort());
  assert.ok(!JSON.stringify(detail).includes("private"));
  const list = await loadGeoPublicItems({ source: row.source_id });
  assert.equal(list.items[0].brief, undefined);
  assert.equal(list.items[0].readingReady, true);
  assert.equal((await loadGeoOverviewInput()).items.find(item => item.id === row.id)?.readingReady, true);
  const [stored] = await sql`SELECT body_hash,evidence FROM geo_public_reader_briefs WHERE item_id=${row.id}`;
  assert.equal(stored.body_hash, null, "reviewed imports do not fabricate a body hash");
  assert.equal(stored.evidence.quote, "private evidence, not publication");
});

test("all exact source fields invalidate a brief and compare-and-save rejects stale work", async () => {
  for (const [index, change] of [{ title: "Changed title" }, { url: "https://research.example/updated" }, { summary: "A corrected study." }].entries()) {
    const row = await fixture(`reader-brief-stale-${index}`);
    const original = input(row);
    await saveReaderBrief(original);
    await sql`UPDATE geo_public_items SET ${sql(change)} WHERE id=${row.id}`;
    assert.equal((await loadGeoPublicItem(row.id))!.brief, undefined);
    assert.equal((await loadGeoPublicItems({ source: row.source_id })).items[0].readingReady, false);
    assert.equal((await loadGeoOverviewInput()).items.find(item => item.id === row.id)?.readingReady, false);
    assert.deepEqual(await saveReaderBrief(original), { saved: false, reason: "source-changed" });
  }
  const source = { url: "https://research.example/a", title: "Research", summary: null };
  assert.notEqual(readerBriefInputHash(source), readerBriefInputHash({ ...source, summary: "" }));
  assert.notEqual(readerBriefInputHash(source), readerBriefInputHash({ ...source, title: " Research" }));
  assert.equal(readerBriefInputHash(source), hash(JSON.stringify([source.url, source.title, null])));
});

test("disabled and missing sources cannot save or publish reader briefs", async () => {
  const row = await fixture("reader-brief-disabled");
  await saveReaderBrief(input(row));
  await sql`UPDATE geo_public_source_status SET enabled=false WHERE source_id=${row.source_id}`;
  assert.equal(await loadGeoPublicItem(row.id), null);
  assert.deepEqual(await saveReaderBrief(input(row)), { saved: false, reason: "not-found" });
  assert.deepEqual(await saveReaderBrief({ ...input(row), id: hash("missing") }), { saved: false, reason: "not-found" });
});

test("reviewed briefs survive an in-flight automatic result but can be revised by another review", async () => {
  const row = await fixture("reader-brief-reviewed");
  const reviewed = input(row);
  const automatic = { ...reviewed, provenance: "local-model" as const, bodyHash: hash("full article"), model: "local-fixture", promptVersion: "reader-v1" };
  assert.deepEqual(await saveReaderBrief(automatic), { saved: true });
  await saveReaderBrief(reviewed);
  assert.deepEqual(await saveReaderBrief({ ...automatic, brief: { ...brief, conclusion: "自动概要试图用另一段结论替换已经人工核对过的版本。" } }),
    { saved: false, reason: "reviewed-protected" });
  assert.equal((await loadGeoPublicItem(row.id))!.brief!.conclusion, brief.conclusion);
  const revised = { ...brief, conclusion: "人工复核确认，引用变化只是在有限样本内的观察，不能直接推断排名机制。" };
  assert.deepEqual(await saveReaderBrief({ ...reviewed, brief: revised }), { saved: true });
  assert.equal((await loadGeoPublicItem(row.id))!.brief!.conclusion, revised.conclusion);
  await sql`UPDATE geo_public_items SET title='Updated research' WHERE id=${row.id}`;
  assert.deepEqual(await saveReaderBrief({ ...automatic, inputHash: readerBriefInputHash({ ...row, title: "Updated research" }) }), { saved: false, reason: "reviewed-protected" });
  assert.equal((await loadGeoPublicItem(row.id))!.brief, undefined);
});

test("invalid or incomplete briefs are rejected rather than published as full summaries", async () => {
  const row = await fixture("reader-brief-invalid");
  const invalid = [
    { ...brief, findings: [] }, { ...brief, geoValue: [] }, { ...brief, conclusion: "详见原文" },
    { ...brief, findings: ["This is an English-only research statement."] },
    { ...brief, conclusion: "<script>这里包含不应该展示的网页脚本内容</script>" },
    { ...brief, conclusion: "&lt;div&gt;这里包含没有经过清理的 HTML 内容。" },
    { ...brief, fullText: "A private full article body" },
    { ...brief, conclusion: "字".repeat(241) },
    { ...brief, findings: Array(6).fill(brief.findings[0]) },
    { ...brief, findings: Array(5).fill("字".repeat(300)), geoValue: Array(3).fill("字".repeat(240)) },
    { ...brief, coverage: "teaser" },
  ];
  for (const candidate of invalid) {
    assert.equal(readerBriefSchema.safeParse(candidate).success, false);
    await assert.rejects(saveReaderBrief({ ...input(row), brief: candidate as ReaderBrief }));
  }
  await assert.rejects(saveReaderBrief({ ...input(row), provenance: "local-model" }));
  await assert.rejects(saveReaderBrief({ ...input(row), evidence: "x".repeat(100001) }));
  assert.equal(readerBriefImportSchema.safeParse({ ...input(row), provenance: undefined }).success, false);
  assert.equal((await loadGeoPublicItem(row.id))!.brief, undefined);
  assert.equal((await sql`SELECT 1 FROM geo_public_reader_briefs WHERE item_id=${row.id}`).length, 0);
});

test("publication validates stored JSON again and never leaks extra private fields", async () => {
  const row = await fixture("reader-brief-corrupt");
  await saveReaderBrief(input(row));
  await sql`UPDATE geo_public_reader_briefs SET brief=${sql.json({ ...brief, evidence: "private evidence" })} WHERE item_id=${row.id}`;
  assert.equal((await loadGeoPublicItem(row.id))!.brief, undefined);
});

test("legacy aliases use only the actual representative's brief", async () => {
  const alias = hash("reader-brief-legacy-alias");
  const first = await fixture("reader-brief-representative", { canonical_id: alias, collected_at: "2026-10-15T10:00:00Z" });
  const second = await fixture("reader-brief-secondary", { canonical_id: alias, collected_at: "2026-10-16T10:00:00Z" });
  await saveReaderBrief(input(second));
  assert.equal((await loadGeoPublicItem(alias))!.id, first.id);
  assert.equal((await loadGeoPublicItem(alias))!.brief, undefined, "another source's brief must not be borrowed");
  await saveReaderBrief(input(first));
  assert.deepEqual((await loadGeoPublicItem(alias))!.brief, (await loadGeoPublicItem(first.id))!.brief);
  await sql`DELETE FROM geo_public_items WHERE id=${first.id}`;
  assert.equal((await sql`SELECT 1 FROM geo_public_reader_briefs WHERE item_id=${first.id}`).length, 0);
  assert.equal((await loadGeoPublicItem(alias))!.id, second.id);
});
