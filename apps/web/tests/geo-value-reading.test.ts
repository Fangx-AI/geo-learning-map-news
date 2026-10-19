import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { startWebServer, type WebServer } from "./web-server.ts";
import { expectReaderLink, geoFeed, geoItem, geoStatus } from "./geo-fixtures.ts";

const hits: URL[] = [];
const image = "/api/img-proxy?u=https%3A%2F%2Fexample.org%2Fcover.png&mode=card&exp=1999999999&sig=fixture";
const priority = { tier: "priority" as const, label: "优先阅读", reasons: ["提供可复查的方法与数据", "明确讨论 GEO 搜索引用"], limitations: ["规则不代表结论已被验证"], policyVersion: 1 as const };
const useful = { ...geoItem({ id: "valuable", title: "GEO field study with a reproducible methodology", sourceId: "rss-arxiv-ir", sourceName: "研究资料", publishedAt: "2026-10-10T08:00:00Z" }), imageUrl: image, imageOrigin: "rss", readingPriority: priority };
const commercial = { ...geoItem({ id: "commercial", title: "GEO product launches today", publishedAt: "2026-10-16T08:00:00Z" }), imageUrl: null, readingPriority: { ...priority, tier: "deprioritized" as const, label: "延后阅读", reasons: ["主要介绍厂商产品"], limitations: ["缺少可复查的实验数据"] } };
const broken = { ...geoItem({ id: "broken-image", title: "GEO analysis with unavailable cover" }), imageUrl: image.replace("sig=fixture", "sig=broken"), imageOrigin: "og-image" };
const foreign = { ...geoItem({ id: "foreign-image", title: "GEO analysis with unproxied image" }), imageUrl: "https://untrusted-image.example.org/track.png", imageOrigin: "social" };
const malformed = { ...geoItem({ id: "malformed-image", title: "GEO analysis with malformed proxy" }), imageUrl: "/api/img-proxy?u=https://example.org/cover.png&mode=full", imageOrigin: "rss" };
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://fixture"); hits.push(url);
  if (url.pathname === "/api/img-proxy") {
    if (url.searchParams.get("sig") === "broken") { res.statusCode = 404; return res.end(); }
    res.setHeader("Content-Type", "image/png");
    return res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAwAAAAICAIAAABChommAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQYlWM4+OAuQcQwqggAT77vQZ3EOC0AAAAASUVORK5CYII=", "base64"));
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const send = (value: unknown) => res.end(JSON.stringify(value));
  if (url.pathname === "/api/site/meta") return send({ changelogVersion: "fixture" });
  if (url.pathname === "/api/site/track") { res.statusCode = 204; return res.end(); }
  if (url.pathname === "/api/geo/collection-status") return send(geoStatus);
  if (url.pathname === "/api/geo/public-items") {
    const sort = url.searchParams.get("sort") ?? "latest";
    if (sort !== "recommended" && sort !== "latest") { res.statusCode = 400; return send({ code: "invalid_sort" }); }
    const second = url.searchParams.has("cursor");
    const sorted = sort === "recommended" ? [useful, commercial] : [commercial, useful];
    return send(geoFeed({ sort, groupMode: url.searchParams.get("group") ?? "none", total: 6, totalGroups: 6, items: second ? [geoItem({ id: "continuation", title: "GEO page two" })] : [...sorted, broken, foreign, malformed], nextCursor: second ? null : `${sort}-next`, languages: ["en", "zh"], searchTerms: url.searchParams.has("q") ? [url.searchParams.get("q")] : [] }));
  }
  res.statusCode = 404; send({});
});
let web: WebServer; let browser: Browser;
before(async () => {
  const results = await Promise.allSettled([startWebServer(api).then(value => { web = value; }), chromium.launch({ channel: "chromium" }).then(value => { browser = value; })]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
});
after(async () => { await browser?.close(); await web?.stop(); });

test("recommended and latest ordering retain filters and reset cursors", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    const query = new URLSearchParams({ q: "GEO", language: "en", platform: "web", kind: "direct", period: "7d", group: "title" });
    const start = hits.length;
    await page.goto(web.origin + "/all?" + query);
    assert.ok(hits.slice(start).some(url => url.pathname === "/api/geo/public-items" && url.searchParams.get("sort") === "recommended"));
    await expect(page.getByRole("group", { name: "内容排序", exact: true }).getByRole("button", { name: "推荐", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-public-item]").first()).toHaveAttribute("data-public-item", "valuable");
    await page.getByRole("link", { name: "下一页 →", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("cursor")).toBe("recommended-next");
    assert.equal(new URL(page.url()).searchParams.get("sort"), "recommended");
    await page.getByRole("button", { name: "最新", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("latest");
    const latest = new URL(page.url()).searchParams;
    assert.equal(latest.get("cursor"), null);
    for (const [key, value] of query) assert.equal(latest.get(key), value);
    await expect(page.locator("[data-public-item]").first()).toHaveAttribute("data-public-item", "commercial");
    await page.getByRole("link", { name: "下一页 →", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("cursor")).toBe("latest-next");
    await page.getByLabel("原文语言", { exact: true }).selectOption("zh");
    await expect.poll(() => new URL(page.url()).searchParams.get("cursor")).toBeNull();
    assert.equal(new URL(page.url()).searchParams.get("sort"), "latest");
    await page.getByLabel("搜索公开动态", { exact: true }).fill("citation");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("citation");
    assert.equal(new URL(page.url()).searchParams.get("sort"), "latest");
    assert.equal(new URL(page.url()).searchParams.get("language"), "zh");
  } finally { await context.close(); }
});

test("old unsorted cursor links stay latest and invalid explicit sort preserves API errors", async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    const start = hits.length;
    await page.goto(web.origin + "/all?cursor=old-time-cursor&language=en");
    assert.ok(hits.slice(start).some(url => url.pathname === "/api/geo/public-items" && url.searchParams.get("sort") === "latest"));
    await expect(page.getByRole("button", { name: "最新", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "回到第一页", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("cursor")).toBeNull();
    assert.equal(new URL(page.url()).searchParams.get("sort"), "latest");
    const response = await fetch(web.origin + "/all?sort=fake");
    assert.equal(response.status, 400);
    assert.ok(/no-cache|no-store/.test(response.headers.get("cache-control") ?? ""));
    await response.text();
  } finally { await context.close(); }
});

test("mobile cards show only valid same-origin covers, preserve dimensions and collapse failed images", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  const external: string[] = [];
  page.on("request", request => { if (request.url().includes("untrusted-image.example.org")) external.push(request.url()); });
  try {
    await page.goto(web.origin + "/all");
    const card = page.locator('[data-public-item="valuable"]'); const cover = card.locator("img");
    await cover.scrollIntoViewIfNeeded();
    await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(cover).toHaveAttribute("src", image);
    await expect(cover).toHaveAttribute("loading", "lazy");
    await expect(cover).toHaveAttribute("alt", "");
    const box = await cover.boundingBox(); assert.ok(box); assert.equal(box.width, 84); assert.equal(box.height, 56);
    await expectReaderLink(card.locator("h2 a"), useful.id, "/all");
    await expectReaderLink(card.locator("a:has(img)"), useful.id, "/all");
    const failed = page.locator('[data-public-item="broken-image"]');
    await failed.scrollIntoViewIfNeeded();
    await expect(failed.locator("img")).toHaveCount(0);
    for (const id of ["commercial", "foreign-image", "malformed-image"]) await expect(page.locator(`[data-public-item="${id}"] img`)).toHaveCount(0);
    assert.deepEqual(external, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally { await context.close(); }
});
