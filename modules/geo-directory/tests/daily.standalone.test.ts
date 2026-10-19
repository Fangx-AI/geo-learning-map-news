import test from "node:test";
import assert from "node:assert/strict";
import { buildGeoDailyDigest } from "../backend/daily.ts";
import type { GeoPublicItem } from "@aihot/backend/publication/geo-public";

const now = Date.parse("2026-10-17T04:00:00Z");
const brief = { conclusion: "研究记录了不同 AI 搜索回答中的引用差异，不能据此推断优化的因果效果。", findings: ["研究对照不同查询的来源引用，样本仅代表该次实验。"], geoValue: ["本站启示：分查询类型观察引用变化，保留原始样本用于复查。"], caveats: ["观察性结果，不代表因果关系。"], coverage: "full-article" as const, updatedAt: new Date(now).toISOString() };
function candidate(n: number, changes: Partial<GeoPublicItem> = {}, created = "2026-10-17T01:00:00Z") {
  return { canonicalId: String(n), briefCreatedAt: created, item: { id: String(n), title: `AI search citation experiment ${n}`, summary: "We tested 100 queries and publish the dataset.", url: `https://research${n}.example/article`, sourceId: "research", sourceName: "研究机构", sourceUrl: "https://research.example", language: "en", matchedTerms: [], collectedAt: new Date(now).toISOString(), publishedAt: "2026-10-16T10:00:00Z", contentKind: "direct" as const, ...changes } };
}
test("daily uses rolling publication window and first brief date, with no old-item refill", () => {
  const candidates = [candidate(1), candidate(2, { publishedAt: "2020-01-01T00:00:00Z", brief }),
    candidate(3, { publishedAt: "2020-01-01T00:00:00Z", brief }, "2026-10-16T15:59:59Z"),
    candidate(4, { publishedAt: null }), candidate(5, { publishedAt: "2026-10-17T04:00:01Z" }),
    candidate(6, { publishedAt: "2026-10-16T03:59:59Z" }), candidate(7, { publishedAt: "2026-10-16T04:00:00Z", brief })];
  const digest = buildGeoDailyDigest({ candidates, truncated: false }, now);
  assert.deepEqual(digest.recent.map(i => i.id), ["7", "1"]);
  assert.deepEqual(digest.research.map(i => i.id), ["2"]);
  assert.equal(digest.research[0].publishedAt, "2020-01-01T00:00:00Z");
  assert.equal(digest.day, "2026-10-17");
  assert.equal(buildGeoDailyDigest({ candidates: [], truncated: false }, now).recent.length, 0);
});
test("daily suppresses noise and duplicates across both sections; source labels grant no priority", () => {
  const original = candidate(1, { brief });
  const duplicate = { ...candidate(2, { ...original.item, id: "2", publishedAt: "2020-01-01T00:00:00Z" }), canonicalId: "1" };
  const digest = buildGeoDailyDigest({ candidates: [original, duplicate,
    candidate(3, { title: "Best GEO service providers", summary: "Contact us for guaranteed citations" }),
    candidate(4, { contentKind: "aggregated", url: "https://news.google.com/rss/a" }),
    candidate(5, { title: "New AI image generator", summary: "Official model for drawing pictures", url: "https://openai.com/new" }),
    candidate(6, { contentKind: "social", summary: "Google announced an AI Mode update", title: "Google AI Mode launches new links" }),
    candidate(7, { title: original.item.title, publishedAt: "2020-01-01T00:00:00Z", brief }),
  ], truncated: false }, now);
  assert.deepEqual(digest.recent.map(i => i.id), ["1"]);
  assert.deepEqual(digest.research, []);
});
test("reviewed full content can establish relevance missing from feed excerpts; automatic or abstract briefs cannot", () => {
  const candidates = [candidate(1, { title: "The half-life of an AI citation is 11 days", summary: "New findings", publishedAt: "2025-01-01T00:00:00Z", brief }),
    candidate(2, { publishedAt: null, brief: { ...brief, automated: true } }),
    candidate(3, { publishedAt: null, brief: { ...brief, coverage: "abstract" } })];
  assert.deepEqual(buildGeoDailyDigest({ candidates, truncated: false }, now).research.map(i => i.id), ["1"]);
});

test("library restores older completed reading without including previews or labeling history as new", () => {
  const candidates = [candidate(1, { publishedAt: "2020-01-01T00:00:00Z", brief }, "2026-10-10T01:00:00Z"),
    candidate(2), candidate(3, { brief: { ...brief, automated: true } }),
    candidate(4, { brief: { ...brief, coverage: "abstract" } })];
  const library = buildGeoDailyDigest({ candidates, truncated: false }, now, true);
  assert.deepEqual(library.research.map(item => item.id), ["1"]);
  assert.equal(library.research[0].briefAddedAt, null);
  assert.deepEqual(library.recent, []);
});

test("reviewed theoretical examples remain in the library without occupying daily field-study slots", () => {
  const theoretical = candidate(1, { brief, url: "https://arxiv.org/abs/2609.40069v1" });
  const empirical = candidate(2, { brief, url: "https://arxiv.org/abs/2603.16138v2" });
  const input = { candidates: [theoretical, empirical], truncated: false };
  assert.deepEqual(buildGeoDailyDigest(input, now).recent.map(item => item.id), ["2"]);
  assert.deepEqual(buildGeoDailyDigest(input, now, true).research.map(item => item.id), ["2", "1"]);
});
