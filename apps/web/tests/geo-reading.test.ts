// Exercises the grouped source-reading contract through the production router, with synthetic HTTP data.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { startWebServer, type WebServer } from "./web-server.ts";
import { expectReaderLink, geoFeed, geoItem, geoOverview, geoStatus } from "./geo-fixtures.ts";

const groupKey = "a".repeat(64);
const hits: URL[] = [];
const common = { sourceId: "index-fixture", sourceName: "公开索引", sourceUrl: "https://news.google.com/", language: "en", platform: "web", contentKind: "aggregated" as const, publishedAt: "2026-10-16T08:00:00.000Z", collectedAt: "2026-10-16T09:00:00.000Z" };
const main = { ...geoItem({ ...common, id: "reading-main", title: "AI search meets AI and search <img src=x onerror=alert(1)>", url: "https://news.google.com/rss/articles/main", summary: "Main source summary with citation evidence." }), publisherName: "Verified Publisher", publisherUrl: "https://publisher.example.org/" };
const variants = Array.from({ length: 41 }, (_, index) => ({ ...geoItem({ ...common, id: `reading-variant-${index + 1}`, title: `AI search meets AI and search — publisher ${index + 1}`, url: `https://news.google.com/rss/articles/variant-${index + 1}`, summary: `Publisher ${index + 1} supplied this separate excerpt.` }), publisherName: index === 0 ? "<img src=x onerror=alert(1)>" : `Publisher ${index + 1}`, publisherUrl: index === 0 ? "javascript:alert(1)" : `https://publisher${index + 1}.example.org/` }));
const solo = geoItem({ id: "reading-solo", title: "Independent AI search field research", summary: "Separate author methodology", sourceId: "author-fixture", sourceName: "研究作者", language: "en", platform: "web", contentKind: "direct" });
const summaryOnly = geoItem({ id: "summary-only", title: "Field measurement guide", summary: "Background. ".repeat(30) + "citation evidence is visible in this source summary.", language: "en" });
const readerImage = "/api/img-proxy?u=https%3A%2F%2Fexample.org%2Freader-cover.png&mode=card&exp=1999999999&sig=fixture";
const readerItem = geoItem({
  id: "b".repeat(64), title: "AI search citation experiment &amp; limitations", url: "https://example.org/reader-study",
  summary: "The source measured citation changes across repeated queries. ".repeat(8) + "Original summary ends with the negative result.",
  sourceId: "reader-fixture", sourceName: "实测作者", language: "en", platform: "web", contentKind: "direct",
  imageUrl: readerImage, imageOrigin: "rss",
  translation: { title: "AI 搜索引用实验与局限", summary: "来源比较了重复查询中的引用变化。".repeat(8) + "摘要最后保留未观察到提升的结果。", language: "zh", provider: "geo-reviewed-v1" },
});
const readerWithoutSummary = geoItem({ id: "c".repeat(64), title: "A GEO source without an excerpt", summary: null, sourceId: "reader-fixture", sourceName: "实测作者", language: "en", platform: "web", contentKind: "direct" });
const readerWithBrief = { ...readerItem, id: "f".repeat(64), brief: {
  conclusion: "实测发现引用分布变化，但不能据此推断流量提升。",
  findings: ["研究使用 100 个固定查询，连续观察两周。", "引用率从 10% 升至 15%；该指标不等同于点击率。"],
  geoValue: ["本站解读：应把引用率和点击率分开跟踪，再评估优化效果。"],
  caveats: ["样本只覆盖英语查询，未检验其他语言。"], coverage: "full-article", updatedAt: "2026-10-17T08:00:00.000Z",
} };
const readerAbstract = { ...readerWithoutSummary, id: "1".repeat(64), brief: { ...readerWithBrief.brief, coverage: "abstract", caveats: [], automated: true } };
const readerAlias = "e".repeat(64);
const readerSources = [{ id: "reader-fixture", name: "实测作者", count: 2 }];
const sources = [{ id: "index-fixture", name: "公开索引", count: 42 }, { id: "author-fixture", name: "研究作者", count: 1 }];
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://fixture"); hits.push(url);
  if (url.pathname === "/api/img-proxy") {
    res.setHeader("Content-Type", "image/png");
    return res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAwAAAAICAIAAABChommAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQYlWM4+OAuQcQwqggAT77vQZ3EOC0AAAAASUVORK5CYII=", "base64"));
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const send = (value: unknown) => res.end(JSON.stringify(value));
  if (url.pathname === "/api/site/meta") return send({ changelogVersion: "fixture" });
  if (url.pathname === "/api/site/track") { res.statusCode = 204; return res.end(); }
  if (url.pathname === "/api/geo/collection-status") return send(geoStatus);
  if (url.pathname === "/api/geo/overview") return send(geoOverview({ dailyItems: [solo], dailyTotal: 1 }));
  if (url.pathname.startsWith("/api/geo/public-items/")) {
    const id = url.pathname.split("/").at(-1);
    const item = id === readerAlias ? readerItem : [readerItem, readerWithoutSummary, readerWithBrief, readerAbstract].find(item => item.id === id);
    res.setHeader("Cache-Control", "private, no-store");
    if (!item) { res.statusCode = 404; return send({ error: "内容不存在或已停止公开" }); }
    return send({ item });
  }
  if (url.pathname === "/api/geo/public-items") {
    const groupMode = url.searchParams.get("group") === "title" ? "title" : "none";
    if (url.searchParams.get("source") === "reader-fixture") {
      const second = url.searchParams.get("cursor") === "reader-next";
      return send(geoFeed({ items: second ? [readerItem] : [readerWithoutSummary], total: 2, totalGroups: 2, groupMode, sort: url.searchParams.get("sort") ?? "recommended", sources: readerSources, nextCursor: second ? null : "reader-next" }));
    }
    const q = url.searchParams.get("q") ?? "";
    const searchTerms = q === '"AI search" <img' ? ["AI search", "<img"] : q === '"citation evidence"' ? ["citation evidence"] : q ? [q] : [];
    if (q === '"citation evidence"') return send(geoFeed({ items: [summaryOnly], total: 1, totalGroups: 1, groupMode, sources, searchTerms }));
    if (q === '"AI search" <img') return send(geoFeed({ items: [main], total: 1, totalGroups: 1, groupMode, sources, searchTerms }));
    if (groupMode === "title") {
      const second = url.searchParams.has("cursor");
      const representative = { ...main, nearDuplicates: { key: groupKey, count: 42, items: variants.slice(0, 19), remainingCount: 22 } };
      const indexOnly = url.searchParams.get("source") === "index-fixture";
      return send(geoFeed({ items: second ? [solo] : [representative], total: indexOnly ? 42 : 43, totalGroups: indexOnly ? 1 : 2, groupMode, nextCursor: second || indexOnly ? null : "groups-next", sources, searchTerms }));
    }
    const records = url.searchParams.has("groupKey") ? [main, ...variants] : [main, ...variants, solo];
    const second = url.searchParams.has("cursor");
    return send(geoFeed({ items: second ? records.slice(30) : records.slice(0, 30), total: records.length, totalGroups: url.searchParams.has("groupKey") ? 1 : 2, groupMode, nextCursor: second ? null : "members-next", sources, searchTerms }));
  }
  res.statusCode = 404; send({});
});
let web: WebServer; let browser: Browser;
before(async () => {
  const results = await Promise.allSettled([startWebServer(api).then(value => { web = value; }), chromium.launch({ channel: "chromium" }).then(value => { browser = value; })]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
});
after(async () => { await browser?.close(); await web?.stop(); });

test("reader briefs explain findings and implications while keeping the source excerpt distinct", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  const external: string[] = [];
  page.on("request", request => { if (new URL(request.url()).origin !== web.origin) external.push(request.url()); });
  try {
    await page.goto(web.origin + `/read/${readerWithBrief.id}`);
    await expect(page.locator("[data-reader-conclusion]")).toHaveText(readerWithBrief.brief.conclusion);
    await expect(page.locator("[data-reader-brief] li")).toHaveText(readerWithBrief.brief.findings);
    await expect(page.getByRole("heading", { name: "对 GEO 的启示本站解读" })).toBeVisible();
    await expect(page.getByText(readerWithBrief.brief.caveats[0]!, { exact: true })).toBeVisible();
    await expect(page.locator("[data-reader-summary]")).toHaveCount(0);
    await page.getByRole("button", { name: "原文摘要", exact: true }).click();
    await expect(page.getByRole("heading", { name: "来源摘要", exact: true })).toBeVisible();
    await expect(page.locator("[data-reader-summary]")).toHaveText(readerItem.summary!);
    await expect(page.locator("[data-reader-brief]")).toHaveCount(0);
    await page.getByRole("button", { name: "中文概要", exact: true }).click();
    await expect(page.locator("[data-reader-conclusion]")).toHaveText(readerWithBrief.brief.conclusion);
    await expect(page.getByRole("link", { name: "查看原文 ↗", exact: true })).toHaveAttribute("href", readerItem.url);
    assert.deepEqual(external, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.goto(web.origin + `/read/${readerAbstract.id}`);
    await expect(page.locator("[data-reader-brief]")).toBeVisible();
    await expect(page.getByText("依据论文摘要整理，未覆盖论文全文。", { exact: true })).toBeVisible();
    await expect(page.getByText("AI 整理", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "原文摘要", exact: true }).click();
    await expect(page.getByText("来源暂未提供摘要。", { exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test("a complete reader brief is server-rendered without relying on a browser model or translation", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage();
  try {
    const response = await page.goto(web.origin + `/read/${readerWithBrief.id}`);
    assert.equal(response!.status(), 200);
    await expect(page.locator("[data-reader-conclusion]")).toHaveText(readerWithBrief.brief.conclusion);
    await expect(page.locator("[data-reader-brief] li")).toHaveText(readerWithBrief.brief.findings);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", readerWithBrief.brief.conclusion);
  } finally { await context.close(); }
});

test("card reading stays on-site, shows the complete bilingual excerpt and returns to the same filtered page", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  const externalRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).origin !== web.origin) externalRequests.push(request.url()); });
  try {
    const query = new URLSearchParams({ q: "citation", source: "reader-fixture", language: "en", platform: "web", kind: "direct", period: "7d", sort: "recommended", group: "none" });
    await page.goto(web.origin + "/all?" + query);
    await page.getByRole("link", { name: "下一页 →", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("cursor")).toBe("reader-next");
    const listUrl = new URL(page.url()); const from = listUrl.pathname + listUrl.search;
    const card = page.locator(`[data-public-item="${readerItem.id}"]`);
    await expectReaderLink(card.locator("h2 a"), readerItem.id, from);
    await card.locator("h2 a").click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/read/${readerItem.id}`);
    assert.equal(new URL(page.url()).searchParams.get("from"), from);
    assert.equal(context.pages().length, 1);
    const article = page.locator(`[data-reader-item="${readerItem.id}"]`);
    await expect(article.locator("h1")).toHaveText(readerItem.translation!.title);
    await expect(article.locator("[data-reader-summary]")).toHaveText(readerItem.translation!.summary!);
    assert.equal(await article.locator("[data-reader-summary]").evaluate(element => element.scrollHeight > element.clientHeight + 1), false, "the collected excerpt is not line-clamped");
    await article.getByRole("button", { name: "查看原文", exact: true }).click();
    await expect(article.locator("h1")).toHaveText("AI search citation experiment & limitations");
    await expect(article.locator("[data-reader-summary]")).toHaveText(readerItem.summary!);
    await article.getByRole("button", { name: "查看中文翻译", exact: true }).click();
    await expect(article.locator("[data-reader-summary]")).toHaveText(readerItem.translation!.summary!);
    const originalLink = article.getByRole("link", { name: "查看原文 ↗", exact: true });
    await expect(originalLink).toHaveAttribute("href", readerItem.url);
    await expect(originalLink).toHaveAttribute("target", "_blank");
    assert.deepEqual(externalRequests, [], "reading and language switching never open the source article");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole("link", { name: "返回列表", exact: true }).click();
    await expect(page).toHaveURL(listUrl.href);
    await expect(card).toBeVisible();
    for (const [key, value] of query) assert.equal(new URL(page.url()).searchParams.get(key), value);
    assert.equal(new URL(page.url()).searchParams.get("cursor"), "reader-next");
    assert.equal(await page.evaluate(() => localStorage.getItem("aihot-read-items")), null);
  } finally { await context.close(); }
});

test("cover and saved-item entries open the same local reader and retain the original bookmark data", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/all?source=reader-fixture&cursor=reader-next");
    const cover = page.locator(`[data-public-item="${readerItem.id}"] img`);
    await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await cover.click();
    await expect(page.locator(`[data-reader-item="${readerItem.id}"]`)).toBeVisible();
    assert.equal(context.pages().length, 1);
    await page.getByRole("button", { name: "收藏这条内容", exact: true }).click();
    await expect(page.getByRole("button", { name: "取消收藏", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.goto(web.origin + "/starred");
    const savedLink = page.locator(`[data-card-key="${readerItem.id}"] h2 a`);
    await expectReaderLink(savedLink, readerItem.id, "/starred");
    await savedLink.click();
    await expect(page.locator(`[data-reader-item="${readerItem.id}"]`)).toBeVisible();
    await expect(page.getByRole("button", { name: "取消收藏", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "返回列表", exact: true }).click();
    await expect(page).toHaveURL(web.origin + "/starred");
    await expect(savedLink).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("aihot-starred-items") ?? "[]"));
    assert.equal(stored[0].url, readerItem.url); assert.equal(stored[0].title, readerItem.title); assert.equal(stored[0].summary, readerItem.summary);
  } finally { await context.close(); }
});

test("direct reader loads without JavaScript, states missing excerpts honestly and returns safe 404s", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage();
  try {
    const response = await page.goto(web.origin + `/read/${readerItem.id}`);
    assert.equal(response!.status(), 200);
    await expect(page.locator("[data-reader-summary]")).toHaveText(readerItem.translation!.summary!);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", web.origin + `/read/${readerItem.id}`);
    await page.goto(web.origin + `/read/${readerWithoutSummary.id}?from=https%3A%2F%2Foutside.example%2F`);
    await expect(page.getByText("来源暂未提供摘要。", { exact: true })).toBeVisible();
    await expect(page.locator("[data-reader-summary]")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "返回列表", exact: true })).toHaveAttribute("href", "/all");
    for (const id of ["d".repeat(64), "invalid-id"]) {
      const missing = await page.goto(web.origin + `/read/${id}?from=${encodeURIComponent("/all?source=reader-fixture&cursor=reader-next")}`);
      assert.equal(missing!.status(), 404);
      assert.match(missing!.headers()["cache-control"] ?? "", /no-store/);
      await expect(page.getByRole("heading", { name: "这条内容暂时无法查看", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "返回列表", exact: true })).toHaveAttribute("href", "/all?source=reader-fixture&cursor=reader-next");
      await expect(page.locator("[data-reader-summary]")).toHaveCount(0);
    }
  } finally { await context.close(); }
});

test("an old bookmarked alias resolves to the current item without duplicate or leftover bookmarks", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  const oldBookmark = { id: readerAlias, title: readerItem.title, summary: readerItem.summary, language: "en", sourceName: readerItem.sourceName, publishedAt: readerItem.publishedAt, savedAt: "2026-09-01T03:00:00.000Z", url: "https://example.org/reader-study?legacy=1", score: null, aiSelected: false };
  const unrelatedBookmark = { ...oldBookmark, id: readerWithoutSummary.id, title: readerWithoutSummary.title, summary: null, url: readerWithoutSummary.url };
  await context.addInitScript(bookmarks => { if (!localStorage.getItem("aihot-starred-items")) localStorage.setItem("aihot-starred-items", JSON.stringify(bookmarks)); }, [oldBookmark, unrelatedBookmark]);
  try {
    await page.goto(web.origin + "/starred");
    const savedLink = page.locator(`[data-card-key="${readerAlias}"] h2 a`);
    await expectReaderLink(savedLink, readerAlias, "/starred");
    await savedLink.click();
    await expect(page.locator(`[data-reader-item="${readerItem.id}"]`)).toBeVisible();
    await expect(page.getByRole("button", { name: "取消收藏", exact: true })).toHaveAttribute("aria-pressed", "true");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("aihot-starred-items") ?? "[]"));
    assert.equal(stored.length, 2); assert.equal(stored[0].id, readerAlias);
    assert.equal(stored[0].url, oldBookmark.url); assert.equal(stored[0].savedAt, oldBookmark.savedAt);
    await page.getByRole("button", { name: "取消收藏", exact: true }).click();
    await expect(page.getByRole("button", { name: "收藏这条内容", exact: true })).toHaveAttribute("aria-pressed", "false");
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("aihot-starred-items") ?? "[]")), [unrelatedBookmark]);
    await page.getByRole("button", { name: "收藏这条内容", exact: true }).click();
    const savedAgain = await page.evaluate(() => JSON.parse(localStorage.getItem("aihot-starred-items") ?? "[]"));
    assert.equal(savedAgain.length, 2); assert.equal(savedAgain[0].id, readerItem.id); assert.equal(savedAgain[0].url, readerItem.url);
    assert.deepEqual(savedAgain[1], unrelatedBookmark);
  } finally { await context.close(); }
});

test("default title grouping reduces visible rows while every embedded source keeps its link and independent bookmark", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  try {
    const start = hits.length;
    await page.goto(web.origin + "/all");
    assert.ok(hits.slice(start).some(url => url.pathname === "/api/geo/public-items" && url.searchParams.get("group") === "title"));
    await expect(page.getByRole("status")).toContainText("已收录 43 条 · 合为 2 组展示");
    await expect(page.locator('[data-public-item="reading-variant-1"]')).not.toBeVisible();
    await page.getByText("相似标题 · 共 42 条", { exact: false }).click();
    const sibling = page.locator('[data-public-item="reading-variant-1"]');
    await expect(sibling).toBeVisible();
    await expectReaderLink(sibling.locator("h2 a"), variants[0]!.id, "/all");
    await expect(page.getByText(/尚未核实为同一篇内容/)).toBeVisible();
    await sibling.getByRole("button", { name: "收藏这条内容", exact: true }).click();
    await expect(sibling.getByRole("button", { name: "取消收藏", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-public-item="reading-main"] > div').first().getByRole("button", { name: "收藏这条内容", exact: true })).toHaveAttribute("aria-pressed", "false");
    const stored = await page.evaluate(() => localStorage.getItem("aihot-starred-items"));
    assert.ok(stored?.includes(variants[0]!.url)); assert.ok(!stored?.includes(main.url));
    await expect(page.locator('[data-public-item="reading-main"] > p').getByRole("link", { name: /Verified Publisher/ })).toHaveAttribute("href", main.publisherUrl);
    await expect(sibling.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.locator("main img")).toHaveCount(0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally { await context.close(); }
});

test("large-group expansion keeps all filters and paginates remaining original links", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    const filters = new URLSearchParams({ q: "AI", source: "index-fixture", language: "en", platform: "web", kind: "aggregated", period: "7d", sort: "recommended" });
    await page.goto(web.origin + "/all?" + filters);
    await page.getByText("相似标题 · 共 42 条", { exact: false }).click();
    await page.getByRole("link", { name: /还有 22 条，查看这一组全部条目/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("groupKey")).toBe(groupKey);
    let query = new URL(page.url()).searchParams;
    for (const [key, value] of filters) assert.equal(query.get(key), value);
    assert.equal(query.get("group"), "none"); assert.equal(query.get("groupKey"), groupKey); assert.equal(query.get("cursor"), null);
    await expect(page.locator('[data-public-item]')).toHaveCount(30);
    await page.getByRole("link", { name: "下一页 →", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("cursor")).toBe("members-next");
    query = new URL(page.url()).searchParams;
    assert.equal(query.get("groupKey"), groupKey); assert.equal(query.get("group"), "none"); assert.equal(query.get("cursor"), "members-next");
    await expect(page.locator('[data-public-item="reading-variant-41"]')).toBeVisible();
    await page.getByRole("link", { name: "回到第一页", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("cursor")).toBeNull();
  } finally { await context.close(); }
});

test("switching grouped and individual views preserves filtering and resets the cursor", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/all?q=AI&language=en&group=title&cursor=groups-next");
    await expect(page.locator('[data-public-item="reading-solo"]')).toBeVisible();
    await page.getByRole("button", { name: "逐条查看", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("group")).toBe("none");
    assert.equal(new URL(page.url()).searchParams.get("q"), "AI"); assert.equal(new URL(page.url()).searchParams.get("language"), "en");
    assert.equal(new URL(page.url()).searchParams.get("cursor"), null);
    await expect(page.locator('[data-similar-titles]')).toHaveCount(0);
    await page.getByRole("button", { name: "合并相似标题", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("group")).toBe("title");
    await expect(page.locator('[data-similar-titles]')).toHaveCount(1);
  } finally { await context.close(); }
});

test("old cursor links without a group mode retain individual pagination and can return to its first page", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    const start = hits.length;
    await page.goto(web.origin + "/all?cursor=members-next&language=en");
    assert.ok(hits.slice(start).some(url => url.pathname === "/api/geo/public-items" && url.searchParams.get("group") === "none"));
    await expect(page.getByRole("button", { name: "逐条查看", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-public-item="reading-variant-41"]')).toBeVisible();
    await page.getByRole("link", { name: "回到第一页", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("cursor")).toBeNull();
    assert.equal(new URL(page.url()).searchParams.get("group"), "none");
    assert.equal(new URL(page.url()).searchParams.get("language"), "en");
    await expect(page.locator('[data-public-item="reading-main"]')).toBeVisible();
  } finally { await context.close(); }
});

test("server search terms highlight literal phrases safely and summary-only matches remain visible in compact reading", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/all?q=" + encodeURIComponent('"AI search" <img'));
    const title = page.locator('[data-public-item="reading-main"] > h2');
    await expect(title.locator("mark")).toHaveText(["AI search", "<img"]);
    await expect(title).toContainText("meets AI and search <img src=x onerror=alert(1)>");
    await expect(page.locator("main img")).toHaveCount(0);
    await page.goto(web.origin + "/all?q=" + encodeURIComponent('"citation evidence"'));
    await expect(page.getByRole("button", { name: "简洁", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-search-excerpt] mark')).toHaveText("citation evidence");
    await expect(page.locator('[data-search-excerpt]')).toBeVisible();
  } finally { await context.close(); }
});

test("reading preference survives public-page navigation and reload, without storing a reading history", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/all");
    await page.getByRole("button", { name: "摘要", exact: true }).click();
    await expect(page.getByText(main.summary!, { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => localStorage.getItem("geo-reading-mode")), "summary");
    await page.goto(web.origin + "/daily?day=2026-10-04");
    await expect(page.getByRole("button", { name: "摘要", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(solo.summary!, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "摘要", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "简洁", exact: true }).click();
    await page.goto(web.origin + "/all");
    await expect(page.getByRole("button", { name: "简洁", exact: true })).toHaveAttribute("aria-pressed", "true");
    assert.equal(await page.evaluate(() => localStorage.getItem("geo-reading-mode")), "compact");
    assert.equal(await page.evaluate(() => localStorage.getItem("aihot-read-items")), null);
  } finally { await context.close(); }
});

test("directory entry-type filtering remains shareable and combines with language and search", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  try {
    await page.goto(web.origin + "/atlas?language=en");
    await page.getByRole("combobox", { name: "来源性质", exact: true }).selectOption("research");
    await expect.poll(() => new URL(page.url()).searchParams.get("evidence")).toBe("research");
    assert.equal(new URL(page.url()).searchParams.get("language"), "en");
    await expect(page.getByRole("heading", { name: /arXiv · Information Retrieval/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Google Search Central/ })).toHaveCount(0);
    await page.getByLabel("搜索信源", { exact: true }).fill("arXiv");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("arXiv");
    assert.equal(new URL(page.url()).searchParams.get("evidence"), "research");
    assert.equal(new URL(page.url()).searchParams.get("language"), "en");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "来源性质", exact: true })).toHaveValue("research");
    await expect(page.getByLabel("搜索信源", { exact: true })).toHaveValue("arXiv");
    await expect(page.getByRole("heading", { name: /arXiv · Information Retrieval/ })).toBeVisible();
    await page.getByRole("combobox", { name: "来源性质", exact: true }).selectOption("official");
    await expect(page.getByRole("heading", { name: "没有找到匹配的信源", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "清除筛选", exact: true }).click();
    await expect.poll(() => new URL(page.url()).search).toBe("");
    await expect(page.getByRole("combobox", { name: "来源性质", exact: true })).toHaveValue("");
    await expect(page.getByRole("heading", { name: "Google Search Central", exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally { await context.close(); }
});
