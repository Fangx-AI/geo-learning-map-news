import test from "node:test";
import assert from "node:assert/strict";
import { publicGroupKey } from "../backend/public-grouping.ts";
import { parseGeoSearch } from "@aihot/backend/publication/geo-public";

const base = { canonicalId: "one", title: "AI search citations &amp; experiments on our website", url: "https://news.google.com/rss/articles/one", language: "en", publishedAt: new Date("2026-10-16T01:00:00Z") };
test("similar-title grouping ignores index labels but keeps dates, languages and unknown evidence separate", () => {
  assert.equal(publicGroupKey(base), publicGroupKey({ ...base, title: "AI search citations & experiments on our website - Publisher", canonicalId: "two" }));
  assert.notEqual(publicGroupKey(base), publicGroupKey({ ...base, publishedAt: new Date("2026-10-15T01:00:00Z") }));
  assert.notEqual(publicGroupKey(base), publicGroupKey({ ...base, language: "zh" }));
  assert.notEqual(publicGroupKey({ ...base, publishedAt: null }), publicGroupKey({ ...base, publishedAt: null, canonicalId: "two" }));
  assert.notEqual(publicGroupKey({ ...base, title: "GEO news" }), publicGroupKey({ ...base, title: "GEO news", canonicalId: "two" }));
  assert.notEqual(publicGroupKey(base), publicGroupKey({ ...base, url: "https://publisher.example/news", title: `${base.title} - An important qualification` }));
});
test("search requires separate terms and supports literal quoted phrases without operators or markup", () => {
  assert.deepEqual(parseGeoSearch('ChatGPT "AI search" “引用 研究” 100% _literal ChatGPT'), ["ChatGPT", "AI search", "引用 研究", "100%", "_literal"]);
  assert.deepEqual(parseGeoSearch('  '), []);
  assert.deepEqual(parseGeoSearch('<script> OR 1=1'), ['<script>', 'OR', '1=1']);
});

test("group dates follow the displayed Beijing day across UTC midnight and the 16:00 UTC boundary", () => {
  const at = (value: string) => publicGroupKey({ ...base, publishedAt: new Date(value) });
  assert.equal(at("2026-10-15T23:00:00Z"), at("2026-10-16T01:00:00Z"), "different UTC days are the same October 16 in Beijing");
  assert.notEqual(at("2026-10-16T01:00:00Z"), at("2026-10-16T18:00:00Z"), "the same UTC day spans October 16 and 17 in Beijing");
  assert.notEqual(at("2026-10-16T15:59:59.999Z"), at("2026-10-16T16:00:00.000Z"));
});
