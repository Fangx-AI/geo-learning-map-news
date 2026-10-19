import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeDb, sql } from "@aihot/backend/db";
import { loadGeoPublicItems } from "@aihot/backend/publication/geo-public";
import { loadGeoOverviewInput } from "@aihot/backend/publication/geo-overview";
import { buildGeoOverview } from "../backend/overview.ts";

after(closeDb);
const id = (value: string) => createHash("sha256").update(value).digest("hex");
const source = "translation-fixture";
type Item = { name: string; title: string; summary: string | null; language: string };
const items: Item[] = [
  { name: "english", title: "AI search citation study with 100 queries", summary: "We tested ChatGPT citation accuracy using 100 queries.", language: "en" },
  { name: "french", title: "Étude sur la visibilité des citations", summary: "Une analyse de 200 réponses dans AI Mode.", language: "fr" },
  { name: "japanese", title: "AI検索の引用実験", summary: null, language: "ja" },
  ...["missing", "stale-title", "stale-summary", "stale-language", "failed", "empty-title", "empty-summary"].map(name => ({ name, title: `AI search ${name}`, summary: `Original excerpt ${name}`, language: "en" })),
];
async function translate(item: Item, override: Partial<{ title_original: string; summary_original: string | null; language_original: string; title_zh: string | null; summary_zh: string | null; status: string }> = {}) {
  const row = { item_id: id(item.name), content_hash: id(JSON.stringify(item)), title_original: item.title, summary_original: item.summary, language_original: item.language,
    title_zh: "人工智能搜索引用研究", summary_zh: item.summary ? "作者测试了引用准确率。" : null, status: "done", provider: "fixture", ...override };
  await sql`INSERT INTO geo_public_translations ${sql(row)} ON CONFLICT (item_id) DO UPDATE SET ${sql(row)}`;
}
before(async () => {
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url) VALUES (${source}, 'Translation fixture', 'https://translation.example')`;
  for (const item of items) await sql`INSERT INTO geo_public_items (id, canonical_id, title, summary, url, source_id, source_name, source_url, language, published_at, collected_at)
    VALUES (${id(item.name)}, ${id(item.name)}, ${item.title}, ${item.summary}, ${`https://translation.example/${item.name}`}, ${source}, 'Translation fixture', 'https://translation.example', ${item.language}, '2026-10-16T08:00:00Z', '2026-10-16T08:00:00.123456Z')`;
  await translate(items[0], { title_zh: "AI 搜索引用研究：100 个查询", summary_zh: "我们实测了 ChatGPT 的引用准确率，包含 100 个查询，提升 10%_。" });
  await translate(items[1], { title_zh: "引用可见性研究", summary_zh: "分析了 AI Mode 中的 200 个回答。" });
  await translate(items[2], { title_zh: "AI 搜索引用实验" });
  for (const name of ["stale-title", "stale-summary", "stale-language", "failed", "empty-title", "empty-summary"]) {
    const item = items.find(item => item.name === name)!;
    const override = name === "stale-title" ? { title_original: "Earlier title" }
      : name === "stale-summary" ? { summary_original: null }
      : name === "stale-language" ? { language_original: "fr" }
      : name === "failed" ? { status: "error" }
      : name === "empty-title" ? { title_zh: "   " }
      : { summary_zh: "   " };
    await translate(item, { title_zh: "失效译文", summary_zh: "失效摘要", ...override });
  }
});

test("public feed and overview expose complete current translations while preserving original text and links", async () => {
  const feed = await loadGeoPublicItems({ source, limit: 50 });
  const input = await loadGeoOverviewInput("2026-10-16");
  for (const collection of [feed.items, input.items]) {
    for (const fixture of items) {
      const item = collection.find(item => item.id === id(fixture.name))!;
      assert.equal(item.title, fixture.title); assert.equal(item.summary, fixture.summary); assert.equal(item.language, fixture.language);
      assert.equal(item.url, `https://translation.example/${fixture.name}`);
      if (["english", "french", "japanese"].includes(fixture.name)) {
        assert.equal(item.translation?.language, "zh"); assert.equal(item.translation.provider, "fixture");
        assert.match(item.translation.title, /引用/);
        if (fixture.summary === null) assert.equal(item.translation.summary, null);
      } else assert.equal(item.translation, null, `${fixture.name} must not publish a stale, failed or partial translation`);
      for (const key of ["translation_title", "content_hash", "title_original", "last_error", "attempts"]) assert.ok(!Object.hasOwn(item, key));
    }
  }
  const overview = buildGeoOverview(input, Date.parse("2026-10-16T10:00:00Z"), "citations");
  for (const collection of [overview.highlights, overview.dailyItems, overview.selectedTopic!.items, ...overview.collections.map(group => group.items), ...overview.hotClusters.map(group => group.items)]) {
    const item = collection.find(item => item.id === id("english"));
    if (item) assert.equal(item.translation?.title, "AI 搜索引用研究：100 个查询");
  }
});

test("Chinese and original search terms combine literally across valid translated titles and summaries", async () => {
  const matching = await loadGeoPublicItems({ source, q: '"引用研究" accuracy 实测' });
  assert.deepEqual(matching.items.map(item => item.id), [id("english")]);
  assert.deepEqual(matching.searchTerms, ["引用研究", "accuracy", "实测"]);
  assert.equal((await loadGeoPublicItems({ source, q: "可见性 200", language: "fr" })).total, 1);
  assert.equal((await loadGeoPublicItems({ source, q: "引用实验", language: "ja" })).total, 1);
  assert.equal((await loadGeoPublicItems({ source, q: "引用研究", language: "zh" })).total, 0, "language filter continues to describe the original source");
  assert.equal((await loadGeoPublicItems({ source, q: "引用研究 missing" })).total, 0, "each term remains required");
  assert.equal((await loadGeoPublicItems({ source, q: "%_" })).total, 1, "translation search does not treat SQL wildcards specially");
  assert.equal((await loadGeoPublicItems({ source, q: "失效" })).total, 0);
  assert.equal((await loadGeoPublicItems({ source, q: "' OR 1=1 --" })).total, 0);
});

test("changing any original field immediately hides the previous translation from reads and search", async () => {
  const item = items.find(item => item.name === "stale-title")!;
  await translate(item, { title_zh: "当前译文", summary_zh: "当前摘要" });
  assert.equal((await loadGeoPublicItems({ source, q: "当前译文" })).total, 1);
  await sql`UPDATE geo_public_items SET summary = 'Updated source excerpt' WHERE id = ${id(item.name)}`;
  assert.equal((await loadGeoPublicItems({ source, q: "当前译文" })).total, 0);
  assert.equal((await loadGeoOverviewInput()).items.find(row => row.id === id(item.name))?.translation, null);
  await sql`UPDATE geo_public_items SET summary = ${item.summary} WHERE id = ${id(item.name)}`;
  await translate(item, { status: "error" });
});

test("translations preserve recommended ordering, original title groups and cursor traversal", async () => {
  const groupingSource = "translation-group-fixture";
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url) VALUES (${groupingSource}, 'Group fixture', 'https://groups.example')`;
  const fixtures = Array.from({ length: 7 }, (_, index) => ({ name: `translation-group-${index}`, title: index < 3 ? "AI search original experiment with detailed dataset findings" : `AI search observations ${index}`, summary: index < 3 ? "We tested 100 queries and publish our dataset." : "Notes about citations.", language: "en" }));
  for (const [index, item] of fixtures.entries()) await sql`INSERT INTO geo_public_items (id, canonical_id, group_key, group_version, title, summary, url, source_id, source_name, source_url, language, published_at, collected_at)
    VALUES (${id(item.name)}, ${id(item.name)}, ${id(index < 3 ? "original-group" : item.name)}, 2, ${item.title}, ${item.summary}, ${`https://groups.example/${item.name}`}, ${groupingSource}, 'Group fixture', 'https://groups.example', 'en', '2026-10-16T08:00:00.123456Z', '2026-10-16T08:00:00Z')`;
  for (const sort of ["recommended", "latest"] as const) {
    const before = await loadGeoPublicItems({ source: groupingSource, sort, limit: 50 });
    for (const item of fixtures) await translate(item, { title_zh: "同一个译文标题", summary_zh: "营销服务，立即购买。" });
    const after = await loadGeoPublicItems({ source: groupingSource, sort, limit: 50 });
    assert.deepEqual(after.items.map(item => [item.id, item.readingPriority]), before.items.map(item => [item.id, item.readingPriority]));
    for (const group of ["none", "title"] as const) {
      const ids: string[] = [], memberIds = new Set<string>(); let cursor: string | undefined;
      do {
        const page = await loadGeoPublicItems({ source: groupingSource, q: "同一个译文标题", sort, group, limit: 1, cursor });
        assert.equal(page.total, 7); assert.equal(page.totalGroups, group === "title" ? 5 : 7);
        ids.push(...page.items.map(item => item.id));
        for (const item of page.items) {
          memberIds.add(item.id);
          for (const member of item.nearDuplicates?.items ?? []) { memberIds.add(member.id); assert.equal(member.translation?.title, "同一个译文标题"); }
        }
        cursor = page.nextCursor ?? undefined;
        assert.ok(ids.length <= 7, "pagination must terminate");
      } while (cursor);
      assert.equal(ids.length, group === "title" ? 5 : 7); assert.equal(new Set(ids).size, ids.length); assert.equal(memberIds.size, 7);
    }
    await sql`DELETE FROM geo_public_translations WHERE item_id = ANY(${fixtures.map(item => id(item.name))}::text[])`;
  }
});

test("canonical URL deduplication retains each source's matching translation and enabled-source fallback", async () => {
  const originals = ["translation-source-a", "translation-source-b"];
  for (const [index, sourceId] of originals.entries()) {
    await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url) VALUES (${sourceId}, ${sourceId}, ${`https://${sourceId}.example`})`;
    const item = { name: sourceId, title: `AI search original ${index}`, summary: `Source ${index} excerpt`, language: "en" };
    await sql`INSERT INTO geo_public_items (id, canonical_id, title, summary, url, source_id, source_name, source_url, language, collected_at)
      VALUES (${id(sourceId)}, ${id("same-canonical-url")}, ${item.title}, ${item.summary}, 'https://original.example/shared', ${sourceId}, ${sourceId}, ${`https://${sourceId}.example`}, 'en', ${`2026-10-${index ? "11" : "10"}T00:00:00Z`})`;
    await translate(item, { title_zh: `同文不同来源 ${index}`, summary_zh: `来源 ${index} 摘要` });
  }
  const unfiltered = await loadGeoPublicItems({ q: "同文不同来源" });
  assert.equal(unfiltered.total, 1); assert.equal(unfiltered.items[0].sourceId, originals[0]); assert.equal(unfiltered.items[0].translation?.summary, "来源 0 摘要");
  const filtered = await loadGeoPublicItems({ q: "同文不同来源", source: originals[1] });
  assert.equal(filtered.total, 1); assert.equal(filtered.items[0].translation?.summary, "来源 1 摘要");
  await sql`UPDATE geo_public_source_status SET enabled = false WHERE source_id = ${originals[0]}`;
  const fallback = await loadGeoPublicItems({ q: "同文不同来源" });
  assert.equal(fallback.total, 1); assert.equal(fallback.items[0].sourceId, originals[1]); assert.equal(fallback.items[0].translation?.title, "同文不同来源 1");
});
