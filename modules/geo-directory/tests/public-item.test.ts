import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify from "fastify";
import { sql, closeDb } from "@aihot/backend/db";
import { loadGeoPublicItem, loadGeoPublicItems } from "@aihot/backend/publication/geo-public";
import geoModule from "../server.ts";
import moduleDefinition from "../module.ts";
import { upgradeLegacyPublicItems } from "../backend/store-public.ts";

const app = Fastify();
geoModule.http!(app);
after(async () => { await app.close(); await closeDb(); });
beforeEach(async () => { await sql`DELETE FROM geo_public_items`; await sql`DELETE FROM geo_public_source_status`; });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
interface Fixture {
  id: string; canonical_id: string; title: string; summary: string | null; language: string; url: string;
  source_id: string; source_name: string; source_url: string; published_at: string | null; collected_at: string;
}
async function fixture(name: string, override: Partial<Fixture> = {}): Promise<Fixture> {
  const row: Fixture = { id: hash(name), canonical_id: hash(name), title: "AI search citation research", summary: "We tested 100 queries.", language: "en",
    url: `https://research.example/${name}`, source_id: name, source_name: "Research source", source_url: "https://research.example",
    published_at: "2026-10-15T08:00:00Z", collected_at: "2026-10-16T08:00:00Z", ...override };
  await sql`INSERT INTO geo_public_source_status (source_id,source_name,source_url) VALUES (${row.source_id},${row.source_name},${row.source_url}) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO geo_public_items ${sql(row)}`;
  return row;
}
async function machine(row: Fixture, override: Partial<{ title_original: string; summary_original: string | null; language_original: string; title_zh: string | null; summary_zh: string | null; status: string }> = {}) {
  const translation = { item_id: row.id, content_hash: hash(JSON.stringify(row)), title_original: row.title, summary_original: row.summary, language_original: row.language,
    title_zh: "AI 搜索引用研究", summary_zh: row.summary ? "我们测试了 100 个查询。" : null, status: "done", provider: "fixture", ...override };
  await sql`INSERT INTO geo_public_translations ${sql(translation)} ON CONFLICT (item_id) DO UPDATE SET ${sql(translation)}`;
}
async function correction(row: Fixture, status = "applied", title = "AI 搜索引用实测") {
  await sql`INSERT INTO geo_translation_corrections(item_id,title_original,summary_original,language_original,title_zh,summary_zh,note,source_hash,fingerprint,status,reviewed_at,reviewed_by,review_note)
    VALUES(${row.id},${row.title},${row.summary},${row.language},${title},${row.summary ? "研究实测了 100 个查询。" : null},'private-reader-note',${hash(row.id)},${hash(status + title)},${status},now(),'private-reviewer','private-review-note')`;
}
const read = (id: string) => app.inject({ url: `/api/geo/public-items/${id}` });

test("single reading publishes the same source, translation and signed image as the feed, with no internal fields", async () => {
  const row = await fixture("reader-projection");
  await machine(row);
  await sql`UPDATE geo_public_items SET summary_raw='private-long-raw-excerpt',summary_source_url='https://private.example/source',summary_origin='rss-excerpt',
    image_url='https://research.example/cover.jpg',image_origin='rss',image_error='private-fetch-error',
    publisher_name='Original publisher',publisher_url='https://publisher.example',matched_terms=${["AI search"]} WHERE id=${row.id}`;
  const response = await read(row.id);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  const { item } = response.json();
  assert.deepEqual(item, (await loadGeoPublicItems({ source: row.source_id })).items[0]);
  assert.equal(item.title, row.title); assert.equal(item.summary, row.summary); assert.equal(item.url, row.url);
  assert.equal(item.publishedAt, "2026-10-15T08:00:00.000Z"); assert.equal(item.collectedAt, "2026-10-16T08:00:00.000Z");
  assert.ok(item.translation);
  assert.equal(item.translation.title, "AI 搜索引用研究");
  assert.equal(item.sourceName, row.source_name); assert.equal(item.sourceUrl, row.source_url);
  assert.equal(item.publisherName, "Original publisher"); assert.equal(item.contentKind, "direct"); assert.equal(item.platform, "web");
  assert.ok(item.imageUrl);
  assert.match(item.imageUrl, /^\/api\/img-proxy\?/);
  const image = new URL(item.imageUrl, "http://localhost");
  assert.equal(image.searchParams.get("u"), "https://research.example/cover.jpg"); assert.ok(image.searchParams.get("sig"));
  assert.equal(item.readingReady, false);
  assert.deepEqual(Object.keys(item).sort(), ["id", "title", "url", "summary", "sourceId", "sourceName", "sourceUrl", "language", "publishedAt", "collectedAt", "matchedTerms", "platform", "contentKind", "publisherName", "publisherUrl", "imageUrl", "imageOrigin", "translation", "readingPriority", "readingReady"].sort());
  assert.ok(!response.body.includes("private-"));
});

test("single reading validates IDs and hides missing or disabled sources without caching", async () => {
  const row = await fixture("reader-http");
  for (const invalid of ["invalid", "a".repeat(63), "g".repeat(64), "a".repeat(65), encodeURIComponent("' OR 1=1 --")]) {
    const response = await read(invalid);
    assert.equal(response.statusCode, 400, invalid); assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal((await read(row.id.toUpperCase())).json().item.id, row.id);
  assert.equal((await read(hash("missing"))).statusCode, 404);
  await sql`UPDATE geo_public_source_status SET enabled=false WHERE source_id=${row.source_id}`;
  const hidden = await read(row.id);
  assert.equal(hidden.statusCode, 404); assert.equal(hidden.headers["cache-control"], "no-store"); assert.ok(!Object.hasOwn(hidden.json(), "item"));
  assert.equal(await loadGeoPublicItem(row.id), null);
  assert.equal(await loadGeoPublicItem("invalid"), null);
  assert.equal((await app.inject({ method: "POST", url: `/api/geo/public-items/${row.id}` })).statusCode, 404);
  for (const path of ["/api/geo/public-items", `/api/geo/public-items/${row.id}`, "/api/geo/public-items/invalid"]) assert.ok(moduleDefinition.apiPaths!.some(pattern => pattern.test(path)));
  assert.ok(!moduleDefinition.apiPaths!.some(pattern => pattern.test(`/api/geo/public-items/${row.id}/extra`)));
});

test("legacy bookmark aliases resolve an enabled canonical representative while exact IDs retain their own source", async () => {
  const legacy = await fixture("reader-legacy", { canonical_id: "" });
  assert.equal(await upgradeLegacyPublicItems(), 1);
  const first = (await loadGeoPublicItems({ source: legacy.source_id })).items[0];
  assert.notEqual(first.id, legacy.id);
  await machine({ ...legacy, id: first.id });
  assert.deepEqual((await read(legacy.id)).json().item, await loadGeoPublicItem(first.id));
  const second = await fixture("reader-secondary", { canonical_id: legacy.id, title: "Another source title", summary: "A second source excerpt.", source_name: "Second source", collected_at: "2026-10-17T08:00:00Z" });
  assert.equal((await read(legacy.id)).json().item.id, first.id);
  assert.equal((await read(second.id)).json().item.title, second.title);
  assert.equal((await read(second.id)).json().item.translation, null, "a shared URL must not borrow another source's translation");
  await sql`UPDATE geo_public_source_status SET enabled=false WHERE source_id=${legacy.source_id}`;
  assert.equal((await read(first.id)).statusCode, 404);
  const fallback = (await read(legacy.id)).json().item;
  assert.equal(fallback.id, second.id); assert.equal(fallback.title, second.title); assert.equal(fallback.summary, second.summary);
  assert.equal(fallback.sourceName, second.source_name); assert.equal(fallback.collectedAt, "2026-10-17T08:00:00.000Z");
  await sql`UPDATE geo_public_source_status SET enabled=false WHERE source_id=${second.source_id}`;
  assert.equal((await read(legacy.id)).statusCode, 404);
});

test("an existing disabled ID cannot fall through to another source's canonical alias", async () => {
  const exact = await fixture("reader-exact-disabled");
  await fixture("reader-collision", { canonical_id: exact.id });
  await sql`UPDATE geo_public_source_status SET enabled=false WHERE source_id=${exact.source_id}`;
  assert.equal((await read(exact.id)).statusCode, 404);
});

test("single reading hides incomplete, failed and stale translations for each original field", async () => {
  const cases = [
    { title_original: "Old title" }, { summary_original: null }, { language_original: "fr" },
    { status: "error" }, { title_zh: "  " }, { summary_zh: "  " },
  ];
  for (const [index, override] of cases.entries()) {
    const row = await fixture(`reader-invalid-translation-${index}`);
    await machine(row, override);
    const response = await read(row.id);
    assert.equal(response.statusCode, 200); assert.equal(response.json().item.translation, null);
    assert.equal(response.json().item.summary, row.summary);
  }
});

test("reviewed text overrides machine output and expires when the source changes; pending suggestions stay private", async () => {
  const row = await fixture("reader-correction");
  await machine(row);
  await correction(row, "pending", "待审核的私有建议");
  let response = await read(row.id);
  assert.equal(response.json().item.translation.provider, "fixture"); assert.ok(!response.body.includes("私有建议"));
  await correction(row);
  response = await read(row.id);
  assert.equal(response.json().item.translation.title, "AI 搜索引用实测"); assert.equal(response.json().item.translation.provider, "geo-reviewed-v1");
  assert.ok(!response.body.includes("private-"));
  await machine(row, { title_zh: "后来完成的机翻" });
  assert.equal((await read(row.id)).json().item.translation.title, "AI 搜索引用实测");
  await sql`UPDATE geo_public_items SET summary='We retested 200 queries.' WHERE id=${row.id}`;
  assert.equal((await read(row.id)).json().item.translation, null);
  await machine({ ...row, summary: "We retested 200 queries." }, { title_zh: "新版本研究", summary_zh: "我们重新测试了 200 个查询。" });
  const current = (await read(row.id)).json().item;
  assert.equal(current.translation.title, "新版本研究"); assert.equal(current.translation.provider, "fixture");
});

test("title-only and original Chinese entries remain readable without fabricated summaries or dates", async () => {
  const row = await fixture("reader-title-only", { summary: null, published_at: null });
  await machine(row);
  const item = (await read(row.id)).json().item;
  assert.equal(item.summary, null); assert.equal(item.translation.summary, null); assert.equal(item.publishedAt, null); assert.equal(item.imageUrl, null);
  assert.equal(item.translation.title, "AI 搜索引用研究");
  const chinese = await fixture("reader-chinese", { title: "AI 搜索引用研究", summary: "这是来源的公开短摘要。", language: "zh" });
  const original = (await read(chinese.id)).json().item;
  assert.equal(original.title, chinese.title); assert.equal(original.summary, chinese.summary); assert.equal(original.translation, null);
});
