import test from "node:test";
import assert from "node:assert/strict";
import { matchGeoTerms, inferLanguage } from "../backend/relevance.ts";
import { publicCollectionError, publicSourceIssue, toPublicCandidates, type PublicSource } from "../backend/public-source.ts";
import { readGeoCursor } from "@aihot/backend/publication/geo-public";

const source: PublicSource = { id: "geo-test", name: "Research", kind: "rss", config: { feedUrl: "https://research.example/feed" }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://research.example", languageHint: "en" };

test("GEO recall includes multilingual specifics and AI+discovery pairs, not ordinary SEO or geography", () => {
  assert.ok(matchGeoTerms("ChatGPT fan-out queries are getting longer").length);
  assert.ok(matchGeoTerms("Gemini query fan-out analysis").length);
  assert.equal(matchGeoTerms("Database query fan-out execution plan").length, 0);
  for (const text of ["Generative engine optimisation study", "AEO vs SEO", "生成引擎优化新研究", "生成式引擎优化", "生成式搜索优化", "AI Overviews update", "ChatGPT referral traffic", "豆包品牌推荐实测", "AI検索最適化", "생성형 검색", "moteurs génératifs", "KI-Suche", "motores generativos", "búsqueda con IA", "Optimización para motores de búsqueda generativos", "Optimisation pour les moteurs de recherche génératifs", "Otimização para mecanismos de busca generativos", "محركات البحث التوليدية", "एआई खोज"]) assert.ok(matchGeoTerms(text).length > 0, text);
  for (const text of ["SEO title tags and canonical URLs", "GEO satellite launch", "Geography and climate change", "ChatGPT writes a poem", "Citation styles for academic papers", "GEO targeting for maps"]) assert.equal(matchGeoTerms(text).length, 0, text);
});

test("candidate conversion preserves source language and dates, deduplicates links and only uses brief source excerpts", () => {
  const body = "AI search citations " + "原始资料".repeat(150);
  const now = Date.parse("2026-10-16T00:00:00Z");
  const items = toPublicCandidates([
    { title: "GEO research", url: "https://www.research.example/article/?utm_source=feed", publishedAt: null, excerpt: "", bodyText: body },
    { title: "same research", url: "https://research.example/article", bodyText: body },
    { title: "AI search", url: "https://research.example/future", publishedAt: new Date(now + 48 * 3600_000) },
    { title: "AI search", url: "https://user:password@research.example/private" },
  ], source, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].publishedAt, null);
  assert.equal(items[0].sourceName, source.name);
  const otherSourceItem = toPublicCandidates([{ title: "AI search research", url: "https://research.example/article" }], { ...source, id: "other-source" })[0];
  assert.equal(items[0].canonicalId, otherSourceItem.canonicalId);
  assert.notEqual(items[0].id, otherSourceItem.id);
  assert.equal(items[0].language, "zh");
  assert.equal([...items[0].summary!].length, 450);
  assert.equal(items[0].summaryRaw, body);
  assert.equal(items[0].summaryOrigin, "body-excerpt");
  assert.match(items[0].summary!, /^AI search citations/);
  assert.equal(toPublicCandidates([{ title: "GEO是什么", url: "https://research.example/geo" }], source).length, 0);
  assert.equal(toPublicCandidates([{ title: "GEO是什么", url: "https://research.example/geo" }], { ...source, geoFocused: true }).length, 1);
  assert.equal(inferLanguage("AI search methods", "fr"), "fr");
  assert.equal(inferLanguage("AI search methods"), "und");
});

test("public listing mode refuses paid readers, credentials and non-GET requests; safe status never echoes payloads", () => {
  assert.equal(publicSourceIssue(source), null);
  for (const config of [{ url: "https://r.jina.ai/https://example.com" }, { url: "https://example.com/api?access_token=secret" }, { url: "https://example.com/api", headers: { authorization: "Bearer secret" } }, { url: "https://example.com/api", method: "POST", bodyJson: { query: "GEO" } }]) assert.ok(publicSourceIssue({ kind: "json_list", config }));
  assert.ok(publicSourceIssue({ kind: "x_search", config: { query: "GEO" } }));
  assert.equal(publicCollectionError({ status: 403, message: "secret" }), "来源返回 HTTP 403");
  assert.ok(!publicCollectionError(new Error("token=secret body data")).includes("secret"));
});

test("publisher attribution uses supplied metadata only and rejects unsafe publisher links", () => {
  const candidate = { title: "AI search research - Guessed Publisher", url: "https://news.example/article" };
  assert.equal(toPublicCandidates([candidate], source)[0]!.publisherName, null);
  const [attributed] = toPublicCandidates([{ ...candidate, raw: { publisherName: " <b>Research</b> &amp; Data ", publisherUrl: "https://research.example/" } }], source);
  assert.equal(attributed!.publisherName, "Research & Data");
  assert.equal(attributed!.publisherUrl, "https://research.example/");
  for (const publisherUrl of ["javascript:alert(1)", "https://user:secret@research.example/", "https://localhost/", "https://research.example/?api_key=secret"]) {
    const [item] = toPublicCandidates([{ ...candidate, raw: { publisherName: "Untrusted", publisherUrl } }], source);
    assert.equal(item!.publisherName, null);
    assert.equal(item!.publisherUrl, null);
  }
});

test("cursor retains PostgreSQL microsecond tie-break precision and rejects malformed dates and ids", () => {
  const cursor = { at: "2026-10-16T08:30:00.123456Z", id: "a".repeat(64) };
  assert.deepEqual(readGeoCursor(Buffer.from(JSON.stringify(cursor)).toString("base64url")), cursor);
  for (const value of ["bad", Buffer.from(JSON.stringify({ ...cursor, at: "2026-02-30T08:30:00.000Z" })).toString("base64url"), Buffer.from(JSON.stringify({ ...cursor, id: "' OR 1=1" })).toString("base64url")]) assert.throws(() => readGeoCursor(value));
});
