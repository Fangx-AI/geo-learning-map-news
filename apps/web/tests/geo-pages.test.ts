// Production routes + synthetic public API: the GEO site reads attributed originals, not the model timeline.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { before, after, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { startWebServer, type WebServer } from "./web-server.ts";
import { expectReaderLink, geoAt, geoFeed, geoItem, geoOverview, geoStatus } from "./geo-fixtures.ts";

const hits: string[] = [];
const original = geoItem({ id: "a".repeat(64), title: "GEO &amp; AI &lt;img src=x onerror=alert(1)&gt;", summary: "公开摘要 &amp; 引用研究", publishedAt: "2026-10-03T16:30:00.000Z", platform: "web", contentKind: "direct" });
const undated = geoItem({ id: "undated", title: "没有原发布日期的公开资料", publishedAt: null, dateBasis: "collected", url: "https://example.net/undated", sourceId: "community-fixture", sourceName: "社区资料", sourceUrl: "https://example.net/", language: "zh", platform: "web", contentKind: "direct" });
const chineseFirst = geoItem({ id: "zh-first", title: "citation & GEO 中文研究一", language: "zh", publishedAt: "2026-10-04T01:00:00.000Z", url: "https://example.org/zh-first", platform: "web", contentKind: "direct" });
const chineseSecond = geoItem({ id: "zh-second", title: "citation & GEO 中文研究二", language: "zh", publishedAt: "2026-10-03T15:00:00.000Z", url: "https://example.org/zh-second", platform: "web", contentKind: "direct" });
const social = geoItem({ id: "social-post", title: "AI search citation field notes", sourceId: "social-fixture", sourceName: "研究者原帖", sourceUrl: "https://x.com/researcher", url: "https://x.com/researcher/status/123456", platform: "x", contentKind: "social" });
const aggregate = geoItem({ id: "index-result", title: "GEO 方法研究 - 知乎专栏", sourceId: "index-fixture", sourceName: "知乎公开索引", sourceUrl: "https://news.google.com/", url: "https://news.google.com/rss/articles/fixture", language: "zh", platform: "zhihu", contentKind: "aggregated" });
const googleSourceItem = geoItem({ id: "google-source-item", title: "Google AI search guidance", sourceId: "rss-google-search-central", sourceName: "Google Search Central", sourceUrl: "https://developers.google.com/search/blog", url: "https://developers.google.com/search/blog/2026/10/fixture", platform: "web", contentKind: "direct" });
const publicItems = [original, chineseFirst, chineseSecond, undated, social, aggregate, googleSourceItem];
const sources = [...new Set(publicItems.map(item => item.sourceId))].map(id => {
  const items = publicItems.filter(item => item.sourceId === id);
  return { id, name: items[0].sourceName, count: items.length, latestPublishedAt: items.find(item => item.publishedAt)?.publishedAt ?? null };
});
const collection = { ...geoStatus, sources: sources.map(source => ({ ...geoStatus.sources[0], id: source.id, name: source.name, count: source.count, stale: source.id === "rss-google-search-central" })), collector: { state: "waiting", heartbeatAt: geoAt, nextRunAt: "2026-10-04T08:15:00.000Z" as string | null, lastStartedAt: geoAt, lastCompletedAt: geoAt, error: null, intervalMinutes: 15 } };
const topics = [
  { slug: "openai", name: "OpenAI", group: "company", description: "ChatGPT 与 AI 搜索", count: 2, items: [original, undated] },
  { slug: "crawling", name: "抓取与索引", group: "field", description: "robots 和网站索引", count: 0, items: [] },
];
const digestBrief = { conclusion: "研究观察到不同查询类型的引用来源存在差异，不能直接解释为因果效果。", findings: ["在本次 100 条查询样本中，研究者逐条比较了引用来源。"], geoValue: ["本站启示：按查询类型建立引用基线，再评估内容调整。"], caveats: ["样本仅限本次实验，不代表所有语言与行业。"], coverage: "full-article", updatedAt: geoAt };
const digest = { generatedAt: geoAt, since: "2026-10-03T08:00:00Z", day: "2026-10-04", candidatesTruncated: false, recentTotal: 2, researchTotal: 14,
  recent: [{ ...original, briefAddedAt: null, translation: { title: "近 24 小时的引用变化", summary: "本次研究的来源摘要。", language: "zh", provider: "fixture" }, brief: digestBrief }, { ...undated, id: 'd'.repeat(64), briefAddedAt: null }],
  research: Array.from({ length: 14 }, (_, n) => ({ ...geoItem({ id: (n + 1).toString(16).repeat(64), url: `https://example.org/study/${n}`, title: `Original study ${n}`, publishedAt: "2025-01-01T00:00:00Z", translation: { title: `中文研究 ${n}`, summary: "研究的来源摘要。", language: "zh", provider: "fixture" } }), brief: digestBrief, briefAddedAt: geoAt })),
};
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://fixture");
  hits.push(req.url!);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "fixture" }));
  if (url.pathname === "/api/site/track") { res.statusCode = 204; return res.end(); }
  if (url.pathname === "/api/geo/daily") return res.end(JSON.stringify(url.searchParams.get("view") === "library" ? { ...digest, view: "library", recent: [], recentTotal: 0 } : digest));
  if (url.pathname === "/api/geo/collection-status") return res.end(JSON.stringify(collection));
  if (url.pathname === "/api/geo/public-items") {
    const query = url.searchParams;
    const platform = query.get("platform"), kind = query.get("kind"), period = query.get("period"), cursor = query.get("cursor");
    if (query.get("q") === "invalid-fixture" || platform && !["web", "x", "reddit", "bluesky", "mastodon", "youtube", "zhihu", "xiaohongshu", "wechat"].includes(platform) || kind && !["direct", "social", "aggregated"].includes(kind) || period && !["24h", "7d", "30d"].includes(period) || cursor && !/^page-\d+$/.test(cursor)) { res.statusCode = 400; return res.end('{}'); }
    const hours = period === "24h" ? 24 : period === "7d" ? 168 : period === "30d" ? 720 : null;
    const filtered = publicItems.filter(item => (!query.get("source") || item.sourceId === query.get("source"))
      && (!query.get("language") || item.language === query.get("language")) && (!platform || item.platform === platform) && (!kind || item.contentKind === kind)
      && (!query.get("q") || `${item.title} ${item.summary}`.toLowerCase().includes(query.get("q")!.toLowerCase()))
      && (!hours || item.publishedAt && Date.parse(item.publishedAt) >= Date.parse(geoAt) - hours * 3600_000 && Date.parse(item.publishedAt) <= Date.parse(geoAt)));
    const offset = cursor ? Number(cursor.slice(5)) : 0;
    return res.end(JSON.stringify(geoFeed({ items: filtered.slice(offset, offset + 1), nextCursor: offset + 1 < filtered.length ? `page-${offset + 1}` : null, total: filtered.length, sources })));
  }
  if (url.pathname === "/api/geo/overview") {
    const day = url.searchParams.get("day") ?? "2026-10-04";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) { res.statusCode = 400; return res.end('{}'); }
    return res.end(JSON.stringify(geoOverview({
      highlights: [original], collections: [], topics, selectedTopic: topics.find(topic => topic.slug === url.searchParams.get("topic")) ?? null,
      stats: { total: 205, sourceCount: 2, topicCount: 2, analyzedItems: 205, undatedCount: 1, truncated: false },
      window: { kind: "7d", label: "最近 7 天", basis: "publishedAt", from: "2026-09-28T00:00:00.000Z", to: geoAt, itemCount: 2 },
      hotClusters: [{ id: "openai", title: "OpenAI", topicSlug: "openai", itemCount: 2, sourceCount: 2, sourceDomains: ["example.org", "example.net"], items: [original, undated] }],
      days: [{ day: "2026-10-04", count: 205, publishedCount: 204, collectedOnlyCount: 1 }, { day: "2026-10-03", count: 1, publishedCount: 1, collectedOnlyCount: 0 }],
      selectedDay: day, dailyTotal: day === "2026-10-04" ? 205 : 1, dailyItems: day === "2026-10-04" ? [original, undated] : [geoItem({ id: "previous-day", title: "前一日公开资料", publishedAt: "2026-10-03T06:00:00.000Z", collectedAt: "2026-10-03T07:00:00.000Z" })],
    })));
  }
  res.statusCode = 404; res.end('{}');
});
let web: WebServer;
let browser: Browser;
before(async () => {
  const results = await Promise.allSettled([startWebServer(api).then(value => { web = value; }), chromium.launch({ channel: "chromium" }).then(value => { browser = value; })]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
});
after(async () => { await browser?.close(); await web?.stop(); });

test("GEO home leads with attributed headlines and full readings, preserving source dates without JavaScript", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(web.origin);
    await expect(page.getByRole("heading", { name: "今日 GEO 资讯", exact: true })).toBeVisible();
    const lead = page.locator(`[data-top-story="${original.id}"]`);
    await expect(lead).toContainText("GEO & AI <img src=x onerror=alert(1)>");
    await expect(lead).toContainText(original.sourceName);
    await expect(lead.locator("time")).toHaveAttribute("datetime", original.publishedAt!);
    await expect(lead.locator("img")).toHaveCount(0);
    await expectReaderLink(lead.locator("h3 a"), original.id, "/");
    await expect(page.locator(`[data-public-item="${original.id}"]`)).toHaveCount(0);
    await expect(page.locator("[data-reading-link]")).toHaveCount(4);
    await expect(page.locator("[data-reading-link]").first()).toContainText("中文研究 0");
    await expectReaderLink(page.locator("[data-reading-link] a").first(), "1".repeat(64), "/");
    await expect(page.getByRole("link", { name: "查看更多资讯 →", exact: true })).toHaveAttribute("href", "/all");
  } finally { await context.close(); }
});

test("mobile combined filters preserve every condition through pagination, first-page navigation and filter changes", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    const start = hits.length;
    await page.goto(web.origin + "/all");
    await page.getByText("更多筛选：来源、语言、发布平台、排序", { exact: true }).click();
    await page.getByLabel("选择资讯来源").click();
    await page.getByLabel("搜索来源").fill("官方");
    await expect(page.getByRole("list", { name: "可选资讯来源" }).getByRole("button", { name: /社区资料/ })).toHaveCount(0);
    await page.getByRole("list", { name: "可选资讯来源" }).getByRole("button", { name: /^官方资料/ }).click();
    await expect(page).toHaveURL(/source=official-fixture/);
    await page.getByLabel("原文语言").selectOption("zh");
    await expect(page).toHaveURL(/language=zh/);
    await page.getByLabel("发布平台").selectOption("web");
    await expect(page).toHaveURL(/platform=web/);
    await expect(page.getByRole("group", { name: "内容类型" }).getByRole("button", { name: "文章", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("group", { name: "发布时间" }).getByRole("button", { name: "最近 7 天", exact: true }).click();
    await expect(page).toHaveURL(/period=7d/);
    await page.getByLabel("搜索资讯").fill("citation & GEO");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("citation & GEO");
    await page.getByRole("link", { name: "下一页 →", exact: true }).click();
    await expect(page.getByRole("link", { name: /citation & GEO 中文研究二/ })).toBeVisible();
    const next = new URL(page.url());
    assert.equal(next.pathname, "/all");
    assert.equal(next.searchParams.get("q"), "citation & GEO");
    assert.equal(next.searchParams.get("language"), "zh");
    assert.equal(next.searchParams.get("source"), "official-fixture");
    assert.equal(next.searchParams.get("platform"), "web"); assert.equal(next.searchParams.get("kind"), null); assert.equal(next.searchParams.get("period"), "7d");
    assert.equal(next.searchParams.get("cursor"), "page-1");
    await page.getByRole("link", { name: "回到第一页", exact: true }).click();
    await expect(page.locator('[data-public-item="zh-first"]')).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.get("q"), "citation & GEO");
    await page.getByRole("link", { name: "下一页 →", exact: true }).click();
    await page.getByRole("group", { name: "发布时间" }).getByRole("button", { name: "最近 24 小时", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("cursor")).toBeNull();
    await expect(page.locator('[data-public-item="zh-first"]')).toBeVisible();
    await page.getByRole("link", { name: "移除筛选：中文", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("language")).toBeNull();
    const removed = new URL(page.url());
    assert.equal(removed.searchParams.get("language"), null);
    for (const [key, value] of Object.entries({ source: "official-fixture", q: "citation & GEO", platform: "web", period: "24h" })) assert.equal(removed.searchParams.get(key), value);
    const reads = hits.slice(start).filter(path => path.startsWith("/api/geo/public-items"));
    assert.ok(reads.some(path => { const q = new URL(path, "http://fixture").searchParams; return q.get("q") === "citation & GEO" && q.get("source") === "official-fixture" && q.get("language") === "zh" && q.get("platform") === "web" && q.get("kind") === "direct" && q.get("period") === "7d" && q.get("cursor") === "page-1" && q.get("limit") === "30"; }));
    assert.ok(!hits.slice(start).some(path => /^\/api\/site\/(timeline|pool)/.test(path)));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally { await context.close(); }
});

test("empty results can clear only the query while preserving source, platform, language, kind and period", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/all?q=no-matching-research&source=official-fixture&language=zh&platform=web&kind=direct&period=7d");
    await expect(page.getByRole("heading", { name: "没有找到匹配的资讯", exact: true })).toBeVisible();
    await expect(page.locator("[data-public-item]")).toHaveCount(0);
    await page.getByRole("link", { name: "只清除关键词", exact: true }).click();
    await expect(page.locator('[data-public-item="zh-first"]')).toBeVisible();
    const params = new URL(page.url()).searchParams;
    assert.equal(params.get("q"), null); assert.equal(params.get("cursor"), null);
    for (const [key, value] of Object.entries({ source: "official-fixture", language: "zh", platform: "web", kind: "direct", period: "7d" })) assert.equal(params.get(key), value);
    await expect(page.getByRole("status")).toContainText("找到 2 条");
    await page.getByRole("link", { name: "清除全部", exact: true }).click();
    await expect(page).toHaveURL(web.origin + "/all");
    await expect(page.getByRole("status")).toContainText("共 5 条");
  } finally { await context.close(); }
});

test("cards show the source summary, and content-type chips separate articles, media coverage and posts", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/all");
    const card = page.locator(`[data-public-item="${original.id}"]`);
    await expect(card.getByText("公开摘要 & 引用研究", { exact: true })).toBeVisible();
    await expectReaderLink(card.locator("h2 a"), original.id, "/all");
    await expect(card.getByRole("link", { name: "官方资料", exact: true })).toHaveAttribute("href", "/all?source=official-fixture");
    await expect(card.getByRole("link", { name: "原文 ↗", exact: true })).toHaveAttribute("href", original.url);
    const kinds = page.getByRole("group", { name: "内容类型" });
    await kinds.getByRole("button", { name: "媒体报道", exact: true }).click();
    await expect(page.locator('[data-public-item="index-result"]')).toBeVisible();
    await page.getByText("更多筛选：来源、语言、发布平台、排序", { exact: true }).click();
    await page.getByLabel("发布平台").selectOption("zhihu");
    await expect(page).toHaveURL(/platform=zhihu/);
    const index = page.locator('[data-public-item="index-result"]');
    await expectReaderLink(index.locator("h2 a"), aggregate.id, "/all" + new URL(page.url()).search);
    await expect(index.locator("time")).toContainText("索引标注");
    await page.getByLabel("发布平台").selectOption("");
    await expect.poll(() => new URL(page.url()).searchParams.get("platform")).toBeNull();
    await kinds.getByRole("button", { name: "社交帖子", exact: true }).click();
    const post = page.locator('[data-public-item="social-post"]');
    await expect(post).toBeVisible();
    await expect(post.getByText("帖子", { exact: true })).toBeVisible();
    await expectReaderLink(post.locator("h2 a"), social.id, "/all" + new URL(page.url()).search);
  } finally { await context.close(); }
});

test("unknown dates remain explicit and are excluded by a publication-time filter", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/all?source=community-fixture");
    const card = page.locator('[data-public-item="undated"]');
    await expect(card.locator("time")).toHaveText("日期待确认");
    assert.equal(await card.locator("time").getAttribute("datetime"), null);
    await page.getByRole("group", { name: "发布时间" }).getByRole("button", { name: "最近 7 天", exact: true }).click();
    await expect(page.getByRole("heading", { name: "没有找到匹配的资讯", exact: true })).toBeVisible();
    await expect(page.getByText(/日期待确认的资讯不计入时间筛选/)).toBeVisible();
    await page.getByRole("link", { name: "移除筛选：最近 7 天", exact: true }).click();
    await expect(card).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.get("source"), "community-fixture");
  } finally { await context.close(); }
});

test("atlas configured filter uses live collection status and source cards link to their actual collected content", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/atlas");
    await page.getByLabel("获取方式").selectOption("configured");
    await expect(page.getByRole("status")).toContainText("找到 1 个来源");
    const card = page.locator("li").filter({ has: page.getByRole("heading", { name: /^Google Search Central/ }) });
    await expect(card).toBeVisible();
    await expect(card.getByText("更新延迟", { exact: true })).toBeVisible();
    const contents = card.getByRole("link", { name: "查看已收录内容 →", exact: true });
    await expect(contents).toHaveAttribute("href", "/all?source=rss-google-search-central");
    await contents.click();
    await expect(page).toHaveURL(web.origin + "/all?source=rss-google-search-central");
    await expectReaderLink(page.locator('[data-public-item="google-source-item"] h2 a'), googleSourceItem.id, "/all?source=rss-google-search-central");
  } finally { await context.close(); }
});

test("stopped and stale collectors with no next run show their state without an invented schedule", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  const previous = { ...collection.collector };
  try {
    for (const [state, label] of [["stopped", "采集已停止"], ["stale", "采集状态待检查"]]) {
      collection.collector.state = state; collection.collector.nextRunAt = null;
      await page.goto(web.origin + `/atlas?q=collector-${state}`);
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await page.getByText(label, { exact: true }).click();
      await expect(page.getByText(/每 15 分钟检查一轮/)).toBeVisible();
      await expect(page.getByText(/下次计划|Invalid Date/)).toHaveCount(0);
    }
  } finally { Object.assign(collection.collector, previous); await context.close(); }
});

test("public bookmarks preserve raw source versions, display decoded text and retain reader links after reload", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/stream");
    await expect(page).toHaveURL(web.origin + "/all");
    await page.getByRole("button", { name: "收藏这条内容", exact: true }).click();
    await expect(page.getByRole("button", { name: "取消收藏", exact: true })).toHaveAttribute("aria-pressed", "true");
    const start = hits.length;
    await page.goto(web.origin + "/starred");
    const link = page.getByRole("link", { name: /GEO & AI <img/ });
    await expectReaderLink(link, original.id, "/starred");
    await expect(page.getByText("公开摘要 & 引用研究", { exact: true })).toBeVisible();
    await expect(page.locator("main img")).toHaveCount(0);
    await page.reload(); await expect(link).toBeVisible();
    await expectReaderLink(link, original.id, "/starred");
    await expect(page.getByText("公开摘要 & 引用研究", { exact: true })).toBeVisible();
    await expect(page.locator("main img")).toHaveCount(0);
    assert.ok(!hits.slice(start).some(path => path.includes("/items/availability")));
    const stored = await page.evaluate(() => localStorage.getItem("aihot-starred-items"));
    const saved = JSON.parse(stored ?? "[]").find((item: { id: string }) => item.id === original.id);
    assert.equal(saved?.url, original.url);
    assert.equal(saved?.title, original.title, "preserve the exact source title for version-matched translation refresh");
    assert.equal(saved?.summary, original.summary);
    assert.ok(saved.title.includes("&amp;"), "decode only for display, not in the saved source version");
  } finally { await context.close(); }
});

test("topics filter and open attributed results, while valid empty topics retain their metadata", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/topics");
    await page.getByLabel("搜索主题").fill("OpenAI");
    await expect(page.locator('a[href="/topics/crawling"]')).toHaveCount(0);
    await page.locator('a[href="/topics/openai"]').click();
    await expect(page.getByRole("heading", { name: "OpenAI", exact: true })).toBeVisible();
    await expect(page.locator('[data-public-item]')).toHaveCount(2);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", web.origin + "/topics/openai");
    await page.goto(web.origin + "/topics/crawling");
    await expect(page.getByRole("heading", { name: "抓取与索引", exact: true })).toBeVisible();
    await expect(page.getByText(/当前条件下暂无收录/)).toBeVisible();
    const response = await page.goto(web.origin + "/topics/unknown");
    assert.equal(response!.status(), 404);
  } finally { await context.close(); }
});

test("daily redirects to the same today selection, and legacy library filters survive", async () => {
 const context=await browser.newContext({viewport:{width:390,height:844}}); const page=await context.newPage();
 try { await page.goto(web.origin+'/daily'); await expect(page).toHaveURL(web.origin+'/');
 await expect(page.getByRole('heading',{name:'今日 GEO 资讯',exact:true})).toBeVisible();
 await expect(page.locator('[data-reading-link]')).toHaveCount(4);
 await expect(page.locator('[data-reading-link]').first()).toContainText('中文研究 0');
 await page.getByRole('group',{name:'阅读语言'}).getByRole('button',{name:'原文',exact:true}).click();
 await expect(page.locator('[data-reading-link]').first()).toContainText('Original study 0');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto(web.origin+'/daily?view=library&q='+encodeURIComponent('中文研究 7'));
 await expect(page).toHaveURL(/\/library\?q=/);
 await expect(page.locator('[data-digest-item]')).toHaveCount(1);
 } finally {await context.close();}
});
test("library search, work filters and follow choices survive reload", async () => {
 const context=await browser.newContext({viewport:{width:390,height:844}}); const page=await context.newPage();
 try {await page.goto(web.origin+'/library');
 await page.getByLabel('搜索中文解读').fill('中文研究 7'); await page.getByRole('button',{name:'查找',exact:true}).click();
 await expect(page.locator('[data-digest-item]')).toHaveCount(1);
 const url=new URL(page.url()); await expectReaderLink(page.locator('[data-digest-item] h3 a'),'8'.repeat(64),url.pathname+url.search);
 await page.getByLabel('工作问题').selectOption('measure'); await page.getByRole('button',{name:'查找',exact:true}).click();
 await expect(page.locator('[data-digest-item]')).toHaveCount(1); await expect(page).toHaveURL(/task=measure/); await page.reload(); await expect(page.getByLabel('工作问题')).toHaveValue('measure');
 await page.goto(web.origin+'/following'); const follow=page.getByRole('button',{name:/衡量引用、流量与效果/}); await follow.click(); await expect(follow).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-digest-item]')).toHaveCount(12); await page.getByRole('link',{name:'继续看关注中的未读解读 →',exact:true}).click(); await expect(page.locator('[data-digest-item]')).toHaveCount(14); await page.reload(); await expect(page.locator('[data-digest-item]')).toHaveCount(14); await expect(follow).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'清除关注和阅读记录',exact:true}).click();await expect(follow).toHaveAttribute('aria-pressed','false');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 } finally {await context.close();}
});

test("daily archives select actual dates, show the cap honestly and hot clusters disclose their time window", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/daily/archive");
    await expect(page.getByRole("heading", { name: "按日期看资讯", exact: true })).toBeVisible();
    await expect(page.getByText("当前展示前 2 条，该日共 205 条。", { exact: true })).toBeVisible();
    await page.locator('[data-day-list] a[href="/daily/2026-10-03"]').click();
    await expect(page.getByRole("link", { name: "后一天 →", exact: true })).toHaveAttribute("href", "/daily/2026-10-04");
    await expect(page.getByRole("heading", { name: "2026-10-03 · 1 条资料", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /前一日公开资料/ })).toBeVisible();
    await expect(page.locator('[data-public-item="previous-day"] time')).toHaveText(/10月3日$/);
    await page.getByLabel("选择日期").fill("2026-10-04");
    await page.getByRole("button", { name: "查看日报", exact: true }).click();
    await expect(page.getByRole("heading", { name: "2026-10-04 · 205 条资料", exact: true })).toBeVisible();
    await expect(page.locator(`[data-public-item="${original.id}"]`).getByText("公开摘要 & 引用研究", { exact: true })).toBeHidden();
    await page.getByRole("group", { name: "阅读方式" }).getByRole("button", { name: "摘要", exact: true }).click();
    await expect(page.locator(`[data-public-item="${original.id}"]`).getByText("公开摘要 & 引用研究", { exact: true })).toBeVisible();
    await page.goto(web.origin + "/more");
    await page.getByRole("link", { name: "热点榜", exact: true }).click();
    await expect(page.getByText("统计范围：最近 7 天 · 2 条内容", { exact: true })).toBeVisible();
    await expect(page.getByText("最近被最多来源同时报道的平台和话题。", { exact: true })).toBeVisible();
    await expect(page.locator('a[href="/topics/openai"]')).toBeVisible();
    await expect(page.locator(`[data-public-item="${original.id}"]`)).toBeHidden();
    await page.getByText("查看报道与帖子（展示 2 条）", { exact: true }).click();
    await expect(page.locator(`[data-public-item="${original.id}"]`)).toBeVisible();
    await expect(page.locator('[data-public-item="undated"]')).toBeVisible();
  } finally { await context.close(); }
});

test("invalid public filters and dates preserve API 400 status and are not cached", async () => {
  for (const path of ["/all?q=invalid-fixture", "/stream?q=invalid-fixture", "/stream?platform=invalid", "/daily?day=2026-02-31", "/daily?day=2026-99-99"]) {
    const response = await fetch(web.origin + path);
    assert.equal(response.status, 400, path);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    await response.text();
  }
});

test("legacy stream links redirect permanently with every valid public filter intact", async () => {
  const query = "?q=citation&source=official-fixture&language=zh&platform=web&kind=direct&period=7d&cursor=page-1";
  const response = await fetch(web.origin + "/stream" + query, { redirect: "manual" });
  assert.equal(response.status, 308); assert.equal(response.headers.get("location"), "/all" + query);
  await response.text();
});
