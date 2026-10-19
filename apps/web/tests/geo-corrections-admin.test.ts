import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { startWebServer, type WebServer } from "./web-server.ts";

let web: WebServer, browser: Browser;
let signedIn = true;
const rows = [1, 2].map(id => ({ id, item_id: String(id).repeat(64), status: "pending", title_original: `AI search study ${id}`, summary_original: "The study measured citation changes.", language_original: "en", title_zh: `AI 搜索研究 ${id}`, summary_zh: "研究测量了引用变化。", note: "纠正引用方向", machine_title_zh: `旧标题 ${id}`, machine_summary_zh: "旧摘要", created_at: "2026-10-16T12:00:00Z", reviewed_at: null as string | null, reviewed_by: null as string | null, review_note: null as string | null, url: `https://example.com/study/${id}`, stale: id === 2, enabled: true }));
const writes: Array<{ id: number; action: string; note?: string; csrf?: string }> = [];
const api = createServer(async (req, res) => {
  const url = new URL(req.url!, "http://api.local");
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
  if (url.pathname.startsWith("/api/admin/") && !signedIn) { res.statusCode = 401; return res.end(JSON.stringify({ detail: "unauthorized" })); }
  if (url.pathname === "/api/admin/me") return res.end(JSON.stringify({ name: "审核测试", csrf: "fixture-csrf", dev: true }));
  if (url.pathname === "/api/admin/nav-counts") return res.end(JSON.stringify({ geoCorrections: rows.filter(row => row.status === "pending").length }));
  if (url.pathname === "/api/admin/geo/translation-corrections") return res.end(JSON.stringify({ rows: rows.filter(row => url.searchParams.get("status") === "all" || row.status === (url.searchParams.get("status") ?? "pending")) }));
  const review = url.pathname.match(/^\/api\/admin\/geo\/translation-corrections\/(\d+)\/review$/);
  if (review && req.method === "POST") {
    let body = ""; for await (const part of req) body += part;
    const input = JSON.parse(body), row = rows.find(row => row.id === Number(review[1]))!;
    writes.push({ id: row.id, ...input, csrf: req.headers["x-csrf-token"] });
    row.status = input.action === "apply" ? "applied" : "rejected";
    row.review_note = input.note ?? null; row.reviewed_by = "审核测试"; row.reviewed_at = "2026-10-16T13:00:00Z";
    return res.end(JSON.stringify({ id: row.id, status: row.status }));
  }
  res.statusCode = 404; res.end(JSON.stringify({ detail: "not_found" }));
});
before(async () => { web = await startWebServer(api); browser = await chromium.launch({ channel: "chromium" }); });
after(async () => { await browser?.close(); await web?.stop(); });

test("correction review page requires authentication and keeps private responses uncacheable", async () => {
  signedIn = false;
  try {
    const response = await fetch(web.origin + "/admin/geo-corrections", { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location") ?? "", /\/api\/auth\/login/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(writes.length, 0);
  } finally { signedIn = true; }
});

test("review compares originals, sends CSRF, refreshes the queue and blocks stale application", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(web.origin + "/admin/geo-corrections");
    await expect(page.getByText("AI search study 1", { exact: true })).toBeVisible();
    await expect(page.getByText("AI 搜索研究 1", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await expect(page.getByRole("button", { name: "应用修订", exact: true }).nth(1)).toBeDisabled();
    await expect(page.getByRole("button", { name: "不采用", exact: true }).first()).toBeDisabled();
    await page.getByLabel("审核备注（未采用时必填）").first().fill("已核对原文和引用关系");
    await page.getByRole("button", { name: "应用修订", exact: true }).first().click();
    await expect(page.getByText("AI search study 1", { exact: true })).toHaveCount(0);
    assert.deepEqual(writes[0], { id: 1, action: "apply", note: "已核对原文和引用关系", csrf: "fixture-csrf" });
    await expect(page.getByRole("button", { name: "应用修订", exact: true })).toBeDisabled();
    await page.getByLabel("审核备注（未采用时必填）").fill("来源已更新，需要按新原文修正");
    await page.getByRole("button", { name: "不采用", exact: true }).click();
    await expect(page.getByText("暂无待审核建议。", { exact: true })).toBeVisible();
    assert.equal(writes[1].action, "reject");
    await page.getByRole("link", { name: "已应用", exact: true }).click();
    await expect(page.getByText("AI 搜索研究 1", { exact: true })).toBeVisible();
    await expect(page.getByText(/已核对原文和引用关系/)).toBeVisible();
    assert.equal(await page.getByRole("link", { name: "查看原文 ↗" }).getAttribute("href"), "https://example.com/study/1");
  } finally { await page.close(); }
});
