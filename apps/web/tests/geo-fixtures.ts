import type { GeoOverviewItem, GeoOverviewResponse, GeoDailyDigest } from "../../../modules/geo-directory/types.ts";
import assert from "node:assert/strict";
import { expect, type Locator } from "@playwright/test";

export async function expectReaderLink(link: Locator, id: string, from: string) {
  await expect(link).toHaveAttribute("href", /^\/read\//);
  const href = new URL((await link.getAttribute("href"))!, "http://fixture");
  assert.equal(href.pathname, `/read/${id}`);
  assert.equal(href.searchParams.get("from"), from);
  assert.equal(await link.getAttribute("target"), null, "reader links stay in the current tab");
}

/** Synthetic, source-attributed public data. No model scores or generated article bodies. */
export const geoAt = "2026-10-04T08:00:00.000Z";
export function geoItem(overrides: Partial<GeoOverviewItem> = {}): GeoOverviewItem {
  return {
    id: "geo-fixture", title: "GEO 公开资料", url: "https://example.org/geo-original", summary: "原站公开摘要",
    sourceId: "official-fixture", sourceName: "官方资料", sourceUrl: "https://example.org/", language: "en",
    publishedAt: geoAt, collectedAt: geoAt, matchedTerms: ["GEO"], categoryKeys: ["platform-updates"], topicSlugs: ["openai"],
    selectionReasons: ["官方来源"], dateBasis: "published", ...overrides,
  };
}
export function geoOverview(overrides: Partial<GeoOverviewResponse> = {}): GeoOverviewResponse {
  const item = geoItem();
  const topic = { slug: "openai", name: "OpenAI", group: "company", description: "OpenAI 的 AI 搜索资料", count: 1, items: [item] };
  return {
    generatedAt: geoAt, lastCollectedAt: geoAt,
    stats: { total: 1, analyzedItems: 1, sourceCount: 1, topicCount: 1, undatedCount: 0, truncated: false },
    window: { kind: "recent", label: "最近收录的资料（含历史内容）", from: null, to: geoAt, basis: "collectedAt", itemCount: 1 },
    rules: { classification: "按明确关键词分类", highlights: "官方来源优先，再按日期排序", hotClusters: "按报道来源数聚合，并非社交热度", daily: "按北京时间归档；未知发布日期按收录日归档。" },
    highlights: [item], collections: [{ key: "platform-updates", name: "平台变化", count: 1, items: [item] }],
    topics: [topic], selectedTopic: null, hotClusters: [{ id: "openai", title: "OpenAI", topicSlug: "openai", itemCount: 1, sourceCount: 1, sourceDomains: ["example.org"], items: [item] }],
    days: [{ day: "2026-10-04", count: 1, publishedCount: 1, collectedOnlyCount: 0 }], selectedDay: "2026-10-04", dailyTotal: 1, dailyItems: [item], ...overrides,
  };
}
export function geoFeed(overrides: Record<string, unknown> = {}) {
  return { items: [geoItem()], total: 1, hiddenTotal: 0, nextCursor: null, sources: [{ id: "official-fixture", name: "官方资料" }], languages: ["en", "zh"], lastCollectedAt: geoAt, ...overrides };
}
export function geoDaily(): GeoDailyDigest {
  return { generatedAt: geoAt, since: "2026-10-03T08:00:00Z", day: "2026-10-04", recent: [{ ...geoItem(), briefAddedAt: null }], research: [], recentTotal: 1, researchTotal: 0, candidatesTruncated: false };
}
export const geoStatus = { sources: [{ id: "official-fixture", name: "官方资料", enabled: true, status: "ok", lastAttemptAt: geoAt, lastSuccessAt: geoAt, count: 1, error: null }], lastCollectedAt: geoAt };
