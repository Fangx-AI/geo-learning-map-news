/// <reference lib="dom" />
// Failure modes recorded before the metadata change:
// - filtered/search feeds compete with their parent or canonicalize to different content;
// - tracking and obsolete positioning parameters leak into canonical, or ordinary archives become noindex;
// - a report's title omits its visible lead, or metadata promotes a withdrawn citation;
// - an article invents a modification date from its source's publication date or omits its image;
// - a story has no machine-readable subject, or claims its first report is its own publication date.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import * as cheerio from "cheerio";
import type { FeedItemSummary, ReportCitation, ReportDetail, ReportKind, SiteItemDetail, StoryDetail } from "@aihot/contracts/site";
import { SITE, withSubject } from "@aihot/site";
import { articleLd, reportLd } from "../apps/web/app/lib/seo.ts";
import { startWebServer, type WebServer } from "../apps/web/tests/web-server.ts";
import type { GeoOverviewItem, GeoOverviewResponse } from "../modules/geo-directory/types.ts";

const at = "2026-10-04T08:00:00.000Z";
const item: FeedItemSummary = { id: "metadata-fixture", title: "可核实的测试报道", summary: "报道摘要", reason: null, source: { name: "Fixture" }, publishedAt: at, timelineAt: at, category: "platform-updates", tags: [], score: 80, selected: true, channel: "news", x: null };
const detail: SiteItemDetail = { ...item, x: null, originalTitle: null, links: { original: "https://example.org/report" }, discoveredAt: at, story: null, readingMode: "full", author: null, body: { zh: "<p>可核实的测试正文。</p>", original: null, zhKind: "original", complete: true }, outline: [], relatedStories: [], topics: [], indexable: true, markdownAvailable: true, group: null, hasTranslation: false, bodyLanguage: "zh" };
const citation = (available: boolean): ReportCitation => ({ itemId: available ? item.id : "withdrawn", title: available ? item.title : "已撤下的旧头条", summary: item.summary, sourceName: item.source.name, sourceUrl: detail.links.original, sourceIconUrl: null, firstParty: true, publishedAt: at, available });
const report = (kind: ReportKind): ReportDetail => ({ kind, key: kind === "daily" ? "2026-10-04" : kind === "weekly" ? "2026-W40" : "2026-10", issueNumber: 1, title: `${SITE.name} 测试刊物`, generatedAt: at, lead: { title: "本期已验证的重要变化", leadParagraph: "本期的导读与依据。" }, leadItemId: item.id, overview: null, highlights: [citation(true)], sections: [], flashes: [], cover: null, metrics: {}, readingMinutes: 1, prev: null, next: null });
const story: StoryDetail = { publicId: "metadata-story", title: "测试事件的最新进展", status: "settled", reportCount: 1, sourceCount: 1, firstReportAt: at, latestAt: at, digest: "当前可核实的事件综述。", digestUpdatedAt: "2026-10-04T09:00:00.000Z", summary: null, excerpt: null, latest: null, latestReport: null, whyHot: { participants48h: 0, newParticipants6h: 0, recentReports24h: 0, observationComplete: true, rank: null }, developments: [], officialReports: [], timeline: [{ id: item.id, title: item.title, summary: item.summary, source: { name: item.source.name, firstParty: true }, publishedAt: at, selected: true }], heat: [], related: [], topics: [] };
const publicItem: GeoOverviewItem = { id: item.id, title: item.title, url: detail.links.original, summary: item.summary, sourceId: "public-fixture", sourceName: "Fixture", sourceUrl: "https://example.org/", language: "zh", publishedAt: at, collectedAt: at, matchedTerms: ["AI search"], categoryKeys: ["platform-updates"], topicSlugs: [], selectionReasons: ["主题相关"], dateBasis: "published" };
const overview = (day = "2026-10-04"): GeoOverviewResponse => ({ generatedAt: at, lastCollectedAt: at, stats: { total: 1, analyzedItems: 1, sourceCount: 1, topicCount: 0, undatedCount: 0, truncated: false }, window: { kind: "48h", label: "最近48小时", from: null, to: at, basis: "publishedAt", itemCount: 1 }, rules: { classification: "主题匹配", highlights: "相关性与来源多样性", hotClusters: "跨来源聚合", daily: "按原帖发布时间汇编" }, highlights: [publicItem], collections: [], topics: [], selectedTopic: null, hotClusters: [], days: [{ day, count: 1, publishedCount: 1, collectedOnlyCount: 0 }], selectedDay: day, dailyTotal: 1, dailyItems: [publicItem] });
let web: WebServer;
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://local");
  const path = url.pathname;
  res.setHeader("Content-Type", "application/json");
  const send = (value: unknown) => res.end(JSON.stringify(value));
  if (path === "/api/site/meta") return send({ changelogVersion: "fixture" });
  if (path === "/api/geo/overview") return send(overview(url.searchParams.get("day") ?? undefined));
  if (path === "/api/geo/daily") return send({ generatedAt: at, since: "2026-10-03T08:00:00Z", day: "2026-10-04", recent: [{ ...publicItem, briefAddedAt: null }], research: [], recentTotal: 1, researchTotal: 0, candidatesTruncated: false });
  if (path === "/api/geo/public-items") return send({ items: [publicItem], total: 1, nextCursor: null, sources: [{ id: publicItem.sourceId, name: publicItem.sourceName }], languages: ["zh"], lastCollectedAt: at });
  if (path === "/api/geo/collection-status") return send({ sources: [], lastCollectedAt: at });
  if (path === `/api/site/items/${item.id}`) return send(detail);
  if (path === `/api/site/stories/${story.publicId}`) return send(story);
  const match = /^\/api\/site\/reports\/(daily|weekly|monthly)\/(.+)$/.exec(path);
  if (match) {
    const r = report(match[1] as ReportKind);
    const index = [{ key: r.key, issueNumber: 1, title: r.title, count: 1 }];
    if (match[2] === "latest-page") return send({ report: r, index });
    if (match[2]?.startsWith("navigation/")) return send({ items: index });
    if (match[2] === r.key) return send(r);
  }
  res.statusCode = 404;
  send({ code: "not_found" });
});
before(async () => { web = await startWebServer(api); });
after(async () => { await web?.stop(); });

async function page(path: string) {
  const response = await fetch(`${web.origin}${path}`);
  assert.equal(response.status, 200, web.logs());
  return cheerio.load(await response.text());
}
function structured($: cheerio.CheerioAPI): Array<Record<string, unknown>> {
  return $("script[type='application/ld+json']").toArray().flatMap((node) => JSON.parse($(node).text()));
}

test("filtered feeds keep their exact content address but leave indexing to the public landing pages", async () => {
  for (const base of ["/all", "/stream"]) for (const query of ["q=ChatGPT", "source=public-fixture", "language=zh", "q=GEO&source=public-fixture&language=zh", "cursor=fixture-cursor", "platform=reddit", "kind=aggregated", "period=7d", "platform=wechat&kind=aggregated&period=30d", "sort=recommended", "sort=latest&group=title", "group=none", "group=title", "group=none&groupKey=" + "a".repeat(64)]) {
    const $ = await page(`${base}?${query}&utm_source=fixture&anchorAt=old&deep=1`);
    assert.equal($("meta[name=robots]").attr("content"), "noindex, follow", `${base}?${query}`);
    assert.equal($("link[rel=canonical]").attr("href"), `${web.origin}/all?${query}`);
    assert.ok($("main").text().includes(item.title));
  }
  const $ = await page("/all?q=Claude&language=zh&source=public-fixture&tab=relevance&page=2&anchorAt=old");
  assert.equal($("meta[name=robots]").attr("content"), "noindex, follow");
  assert.equal($("link[rel=canonical]").attr("href"), `${web.origin}/all?q=Claude&source=public-fixture&language=zh`);
});

test("the former stream URL permanently redirects to the unified feed without losing filters", async () => {
  const path = "/stream?q=GEO&platform=reddit&kind=social&period=7d&cursor=fixture-cursor";
  const response = await fetch(web.origin + path, { redirect: "manual" });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), path.replace("/stream", "/all"));
  await response.text();
});

test("ordinary feed pages remain indexable and normalize ignored parameters", async () => {
  for (const [requested, canonical] of [["/?channel=invalid&category=invalid&tag=%20&utm_source=fixture", "/"], ["/all?channel=all&tab=relevance&anchorAt=old&page=2&utm_source=fixture", "/all"], ["/stream?utm_source=fixture&q=%20", "/all"]]) {
    const $ = await page(requested!);
    assert.equal($("meta[name=robots]").attr("content"), undefined);
    assert.equal($("link[rel=canonical]").attr("href"), `${web.origin}${canonical}`);
    assert.ok($("main").text().includes(item.title));
  }
});

for (const [kind, label] of [["weekly", "周报"], ["monthly", "月报"]] as const) {
  test(`${kind} issue metadata describes its visible lead while the permanent entry keeps its title`, async () => {
    const r = report(kind);
    const $ = await page(`/${kind}/${r.key}`);
    const title = `${withSubject(label)} ${r.key}：${r.lead!.title}`;
    assert.equal($("title").text(), `${title} · ${SITE.name}`);
    assert.equal($("meta[property='og:title']").attr("content"), title);
    assert.ok($("main").text().includes(r.lead!.title));
    const article = structured($).find((entry) => entry["@type"] === "NewsArticle")!;
    assert.equal(article.headline, title);
    assert.equal(article.image, `${web.origin}/og/reports/${kind}/${r.key}.png`);
    assert.equal("dateModified" in article, false);
    const latest = await page(`/${kind}`);
    assert.equal(latest("title").text(), `${withSubject(label)} · ${SITE.name}`);
  });
}

test("GEO daily metadata identifies the selected day without claiming an edited news article", async () => {
  for (const requested of ["/daily/2026-10-04?utm_source=fixture", "/daily?day=2026-10-04&utm_source=fixture"]) {
    const $ = await page(requested);
    assert.match($("title").text(), /GEO 日报/);
    assert.match($("title").text(), /2026-10-04/);
    assert.match($("meta[property='og:title']").attr("content")!, /2026-10-04/);
    assert.equal($("link[rel=canonical]").attr("href"), `${web.origin}/daily/2026-10-04`);
    assert.ok($("main").text().includes("2026-10-04"));
    assert.ok($("main").text().includes(item.title));
    assert.equal(structured($).some(entry => entry["@type"] === "NewsArticle"), false);
  }
  const latest = await page("/daily?utm_source=fixture");
  assert.match(latest("title").text(), /GEO 日报/);
  assert.doesNotMatch(latest("title").text(), /2026-10-04/);
  assert.equal(latest("link[rel=canonical]").attr("href"), `${web.origin}/daily`);
});

test("a report without an edited lead uses only a still-public visible highlight", () => {
  const r = { ...report("weekly"), lead: null, highlights: [citation(false), citation(true)] };
  assert.match(reportLd(r, "/weekly/2026-W40", "导读").headline, new RegExp(item.title));
  assert.doesNotMatch(reportLd(r, "/weekly/2026-W40", "导读").headline, /已撤下/);
});

test("article metadata has a representative image and does not invent an update timestamp", async () => {
  const $ = await page(`/items/${item.id}`);
  const article = structured($).find((entry) => entry["@type"] === "NewsArticle")!;
  assert.equal(article.image, `${web.origin}/og/items/${item.id}.png`);
  assert.equal(article.datePublished, at);
  assert.equal("dateModified" in article, false);
  assert.equal(article.isBasedOn, detail.links.original);
  assert.deepEqual(article.author, { "@id": `${web.origin}/#organization` });
  const modified = "2026-10-04T10:00:00.000Z";
  assert.equal(articleLd({ path: "/items/test", headline: "更正", modifiedAt: modified }).dateModified, modified);
});

test("story metadata describes the visible collection, current summary and report list", async () => {
  const $ = await page(`/story/${story.publicId}`);
  const collection = structured($).find((entry) => entry["@type"] === "CollectionPage")!;
  assert.ok(collection);
  assert.equal(collection.name, story.title);
  assert.equal(collection.description, story.digest);
  assert.equal(collection.dateModified, story.digestUpdatedAt);
  assert.equal("datePublished" in collection, false);
  const list = collection.mainEntity as { itemListElement: Array<{ name: string }> };
  assert.deepEqual(list.itemListElement.map((entry) => entry.name), [item.title]);
  assert.ok($("main").text().includes(story.digest!));
});
