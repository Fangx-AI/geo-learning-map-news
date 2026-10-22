import test from "node:test";
import assert from "node:assert/strict";
import { archiveDay, buildGeoOverview, classifyGeoItem, validOverviewDay } from "../backend/overview.ts";
import type { GeoPublicItem } from "@aihot/backend/publication/geo-public";
import type { GeoOverviewInput } from "@aihot/backend/publication/geo-overview";

const now = Date.parse("2026-10-16T12:00:00Z");
function item(index: number, changes: Partial<GeoPublicItem> = {}): GeoPublicItem {
  return { id: index.toString(16).padStart(64, "0"), title: "AI search citation research", url: `https://research.example/article/${index}`, summary: "Source study of AI search citations.", sourceId: "research", sourceName: "Research", sourceUrl: "https://research.example", language: "en", publishedAt: new Date(now - 3600_000).toISOString(), collectedAt: new Date(now).toISOString(), matchedTerms: ["AI search"], ...changes };
}
function input(items: GeoPublicItem[], changes: Partial<GeoOverviewInput> = {}): GeoOverviewInput {
  return { items, days: [], selectedDay: "2026-10-16", dailyTotal: items.length, total: items.length, sourceCount: 1, undatedCount: items.filter(i => !i.publishedAt).length, lastCollectedAt: new Date(now).toISOString(), ...changes };
}

test("overview time windows use original publication time and label historical/unknown fallback", () => {
  const eight = Array.from({ length: 8 }, (_, index) => item(index));
  assert.equal(buildGeoOverview(input(eight), now).window.kind, "48h");
  const older = eight.map(i => ({ ...i, publishedAt: new Date(now - 96 * 3600_000).toISOString() }));
  assert.equal(buildGeoOverview(input(older), now).window.kind, "7d");
  const historical = eight.map(i => ({ ...i, publishedAt: "2021-01-01T00:00:00Z" }));
  const fallback = buildGeoOverview(input([...historical, item(9, { publishedAt: null })]), now);
  assert.equal(fallback.window.kind, "recent");
  assert.equal(fallback.window.basis, "collectedAt");
  assert.match(fallback.window.label, /历史/);
  assert.equal(fallback.highlights.find(i => i.id === item(9).id)?.dateBasis, "collected");
  assert.equal(buildGeoOverview(input([]), now).highlights.length, 0);
});

test("categories and topics follow text signals, official priority requires an exact registered domain", () => {
  const official = classifyGeoItem(item(1, { title: "OpenAI updates robots.txt and OAI-SearchBot indexing", url: "https://openai.com/news/crawling" }));
  assert.ok(official.categoryKeys.includes("crawling-indexing"));
  assert.ok(official.topicSlugs.includes("robots"));
  assert.ok(official.selectionReasons.includes("平台官方域名"));
  const spoof = classifyGeoItem(item(2, { url: "https://openai.com.unrelated.example/story" }));
  assert.ok(!spoof.selectionReasons.includes("平台官方域名"));
  const result = buildGeoOverview(input([item(2), official]), now);
  assert.equal(result.highlights[0].id, official.id);
  assert.match(result.rules.highlights, /规则优选/);
});

test("report clusters count link domains once, not repeated feed IDs or invented social popularity", () => {
  const result = buildGeoOverview(input([
    item(1, { url: "https://news.google.com/rss/articles/a", sourceId: "query-a" }),
    item(2, { url: "https://news.google.com/rss/articles/b", sourceId: "query-b" }),
    item(3, { url: "https://publisher.example/c", sourceId: "publisher" }),
  ]), now);
  const cluster = result.hotClusters.find(c => c.topicSlug === "citations")!;
  assert.equal(cluster.itemCount, 3);
  assert.equal(cluster.sourceCount, 2);
  assert.deepEqual(cluster.sourceDomains, ["news.google.com", "publisher.example"]);
  assert.match(result.rules.hotClusters, /不是社交热度/);
});

test("archive days use Beijing midnight and validate actual calendar dates", () => {
  assert.equal(archiveDay(item(1, { publishedAt: "2026-10-15T16:00:00Z" })), "2026-10-16");
  assert.equal(archiveDay(item(2, { publishedAt: null, collectedAt: "2026-10-15T15:59:59Z" })), "2026-10-15");
  assert.ok(validOverviewDay("2024-02-29"));
  for (const day of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-1-01", "bad"]) assert.equal(validOverviewDay(day), false);
});

test("selected topic metadata survives zero matches; detail lists are capped while counts stay exact", () => {
  const empty = buildGeoOverview(input([]), now, "robots");
  assert.equal(empty.selectedTopic?.slug, "robots");
  assert.equal(empty.selectedTopic?.count, 0);
  assert.deepEqual(empty.selectedTopic?.items, []);
  const items = Array.from({ length: 205 }, (_, index) => item(index));
  const populated = buildGeoOverview(input(items), now, "citations");
  assert.equal(populated.selectedTopic?.count, 205);
  assert.equal(populated.selectedTopic?.items.length, 200);
  assert.equal(populated.dailyTotal, 205);
  assert.equal(populated.dailyItems.length, 200);
  assert.ok(populated.topics.every(topic => topic.items.length <= 6));
});

test("highlights choose the best similar-title representative and never fill the front page with promotion", () => {
  const title = "AI search original experiment on citation attribution";
  const original = item(1, { title, summary: "We tested 100 queries and publish the dataset.", url: "https://research.example/original" });
  const index = item(2, { title, summary: "Index of an experiment", url: "https://news.google.com/rss/articles/abc", publishedAt: new Date(now - 1800_000).toISOString() });
  const moreOriginals = Array.from({ length: 3 }, (_, n) => item(3 + n, { title: `AI search experiment number ${n} with detailed original data`, summary: "We tested 200 prompts with a control group." }));
  const marketing = Array.from({ length: 20 }, (_, n) => item(10 + n, { title: `Best GEO service providers number ${n}`, summary: "Contact us for guaranteed citations", url: `https://agency${n}.example/list`, publishedAt: new Date(now - 60_000).toISOString() }));
  const overview = buildGeoOverview(input([index, original, ...moreOriginals, ...marketing]), now);
  assert.equal(overview.highlights.length, 4);
  assert.ok(overview.highlights.some(item => item.id === original.id));
  assert.ok(!overview.highlights.some(item => item.id === index.id));
  assert.ok(overview.highlights.every(item => item.readingPriority?.tier === "priority"));
});

test("round2 highlights prefer the same-tier direct group link without a global social penalty", () => {
  const title = "From Public Posts to AI-Search Citations: Measuring the Fragility of AI Search";
  const original = item(101, { title, summary: "We tested 100 queries and publish the dataset.", url: "https://arxiv.org/abs/2610.11932", contentKind: "direct", publishedAt: "2026-10-16T09:00:00Z" });
  const discussion = item(102, { title, summary: original.summary, url: "https://news.ycombinator.com/item?id=50029465", contentKind: "direct", publishedAt: "2026-10-16T10:00:00Z" });
  const independent = item(103, { title: "I tested 200 AI search prompts for local business recommendations", summary: "Our experiment found no effect.", url: "https://bsky.app/profile/author.example/post/experiment", contentKind: "social", publishedAt: "2026-10-16T11:00:00Z" });
  const overview = buildGeoOverview(input([discussion, original, independent]), now);
  assert.deepEqual(overview.highlights.map(i => i.id), [independent.id, original.id]);
  assert.equal(overview.highlights[1].publishedAt, original.publishedAt);
  const ordinary = { ...original, summary: "A guide to understanding citations.", title: "How to understand AI search citations and visibility" };
  const betterSocial = { ...discussion, title: ordinary.title, summary: "We tested 100 queries and publish the dataset." };
  assert.equal(buildGeoOverview(input([ordinary, betterSocial]), now).highlights[0].id, betterSocial.id);
});
