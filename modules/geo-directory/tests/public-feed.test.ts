import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";
import { loadGeoPublicItems, loadGeoCollectionStatus } from "@aihot/backend/publication/geo-public";
import { toPublicCandidates, type PublicSource } from "../backend/public-source.ts";
import { savePublicCandidates, upgradeLegacyPublicItems } from "../backend/store-public.ts";

after(closeDb);

test("channel filters describe linked material and recent periods exclude unknown publication dates", async () => {
  const source: PublicSource = { id: "geo-channel-fixture", name: "Channel fixture", kind: "rss", config: { feedUrl: "https://fixture.example/feed" }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://fixture.example", languageHint: "en" };
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url) VALUES (${source.id}, ${source.name}, ${source.sourceUrl})`;
  const items = toPublicCandidates([
    { title: "AI search on Xiaohongshu and WeChat", url: "https://fixture.example/discussion", publishedAt: new Date() },
    { title: "AI search research", url: "https://x.com/research/status/1234567890", publishedAt: new Date() },
    { title: "AI search archive", url: "https://www.reddit.com/r/SEO/comments/archive/" },
    { title: "AI search news", url: "https://news.google.com/rss/articles/abc", publishedAt: new Date(Date.now() - 10 * 86400_000) },
  ], source);
  await sql.begin(tx => savePublicCandidates(tx, items));
  assert.equal((await loadGeoPublicItems({ source: source.id, platform: "xiaohongshu" })).total, 0);
  assert.equal((await loadGeoPublicItems({ source: source.id, platform: "wechat" })).total, 0);
  const originals = await loadGeoPublicItems({ source: source.id, kind: "social" });
  assert.equal(originals.total, 2);
  assert.equal((await loadGeoPublicItems({ source: source.id, kind: "social", period: "24h" })).total, 1);
  assert.equal((await loadGeoPublicItems({ source: source.id, kind: "aggregated", period: "7d" })).total, 0);
  assert.equal((await loadGeoPublicItems({ source: source.id, kind: "aggregated", period: "30d" })).total, 1);
  assert.equal(originals.sources.find(row => row.id === source.id)?.count, 4);
});

test("collector heartbeat distinguishes a stopped or stale watcher from old successful source reads", async () => {
  await sql`INSERT INTO geo_public_collector_runtime (id, state, heartbeat_at, next_run_at) VALUES ('watch','waiting', now() - interval '10 minutes', now() + interval '20 minutes')`;
  assert.equal((await loadGeoCollectionStatus()).collector.state, "stale");
  await sql`UPDATE geo_public_collector_runtime SET state = 'stopped', heartbeat_at = now() WHERE id = 'watch'`;
  assert.equal((await loadGeoCollectionStatus()).collector.state, "stopped");
  await sql`UPDATE geo_public_collector_runtime SET state = 'waiting', heartbeat_at = now() WHERE id = 'watch'`;
  assert.equal((await loadGeoCollectionStatus()).collector.state, "waiting");
});

test("legacy URL identities are converted once and all feed validators are refreshed", async () => {
  const oldId = "d".repeat(64);
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url, cursor) VALUES ('geo-legacy', 'Legacy source', 'https://legacy.example', '{"rss":{"etag":"old"}}'::jsonb)`;
  await sql`INSERT INTO geo_public_items (id, title, url, source_id, source_name, source_url) VALUES (${oldId}, 'AI search legacy', 'https://legacy.example/article', 'geo-legacy', 'Legacy source', 'https://legacy.example')`;
  assert.equal((await loadGeoPublicItems({ source: "geo-legacy" })).total, 1);
  assert.equal(await upgradeLegacyPublicItems(), 1);
  assert.equal(await upgradeLegacyPublicItems(), 0);
  const [row] = await sql`SELECT id, canonical_id FROM geo_public_items WHERE source_id = 'geo-legacy'`;
  assert.equal(row.canonical_id, oldId);
  assert.notEqual(row.id, oldId);
  assert.deepEqual((await sql`SELECT cursor FROM geo_public_source_status WHERE source_id = 'geo-legacy'`)[0].cursor, {});
});

test("public feed paginates tied microsecond timestamps without loss and keeps filters literal", async () => {
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url, status, last_success_at)
    VALUES ('geo-feed-fixture', 'Fixture source', 'https://example.invalid', 'ok', now())`;
  for (const [index, title] of ["AI search 100% results", "AI search other results", "AI search _literal"].entries()) {
    const id = String.fromCharCode(97 + index).repeat(64);
    await sql`INSERT INTO geo_public_items (id, canonical_id, title, url, source_id, source_name, source_url, language, collected_at, matched_terms)
      VALUES (${id}, ${id}, ${title}, ${`https://example.invalid/${id}`}, 'geo-feed-fixture', 'Fixture source', 'https://example.invalid', 'en', '2026-10-16T08:30:00.123456Z', ${["AI search"]})`;
  }
  const first = await loadGeoPublicItems({ limit: 1, source: "geo-feed-fixture" });
  const second = await loadGeoPublicItems({ limit: 1, source: "geo-feed-fixture", cursor: first.nextCursor! });
  const third = await loadGeoPublicItems({ limit: 1, source: "geo-feed-fixture", cursor: second.nextCursor! });
  assert.deepEqual([first.items[0].id, second.items[0].id, third.items[0].id], ["c".repeat(64), "b".repeat(64), "a".repeat(64)]);
  assert.equal(third.nextCursor, null);
  assert.equal(first.total, 3);
  assert.equal((await loadGeoPublicItems({ q: "%", source: "geo-feed-fixture" })).total, 1);
  assert.equal((await loadGeoPublicItems({ q: "_", source: "geo-feed-fixture" })).total, 1);
  assert.equal((await loadGeoPublicItems({ language: "zh", source: "geo-feed-fixture" })).total, 0);
  assert.equal(first.items[0].publishedAt, null);
  assert.ok((await loadGeoCollectionStatus()).sources.some(source => source.id === "geo-feed-fixture" && source.status === "ok"));
  await sql`UPDATE geo_public_source_status SET enabled = false WHERE source_id = 'geo-feed-fixture'`;
  assert.equal((await loadGeoPublicItems({ source: "geo-feed-fixture" })).total, 0);
});

test("shared URL retains each source's original text and falls back without a new fetch", async () => {
  const base: PublicSource = { id: "geo-duplicate-a", name: "Publisher A", kind: "rss", config: { feedUrl: "https://a.example/feed" }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://a.example", languageHint: "en" };
  const other: PublicSource = { ...base, id: "geo-duplicate-b", name: "Publisher B", sourceUrl: "https://b.example" };
  for (const source of [base, other]) await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url, status, last_success_at) VALUES (${source.id}, ${source.name}, ${source.sourceUrl}, 'ok', now())`;
  const a = toPublicCandidates([{ title: "AI search duplicate-fixture A", url: "https://article.example/shared?utm_source=a", excerpt: "A original excerpt", publishedAt: new Date("2026-10-01T00:00:00Z") }], base);
  const b = toPublicCandidates([{ title: "AI search duplicate-fixture B", url: "https://article.example/shared?utm_source=b", excerpt: "B original excerpt", publishedAt: new Date("2026-10-02T00:00:00Z") }], other);
  await sql.begin(async tx => { await savePublicCandidates(tx, a, new Date("2026-10-10T00:00:00Z")); await savePublicCandidates(tx, b, new Date("2026-10-11T00:00:00Z")); });
  assert.equal((await sql`SELECT id FROM geo_public_items WHERE canonical_id = ${a[0].canonicalId}`).length, 2);
  let visible = await loadGeoPublicItems({ q: "duplicate-fixture" });
  assert.equal(visible.total, 1);
  assert.equal(visible.items[0].sourceId, base.id);
  assert.equal(visible.items[0].summary, "A original excerpt");
  const updatedB = [{ ...b[0], title: "AI search duplicate-fixture B updated", summary: "B updated excerpt" }];
  await sql.begin(tx => savePublicCandidates(tx, updatedB));
  assert.equal((await loadGeoPublicItems({ q: "duplicate-fixture" })).items[0].summary, "A original excerpt");
  assert.equal((await loadGeoPublicItems({ source: other.id })).items[0].title, updatedB[0].title);
  await sql`UPDATE geo_public_source_status SET enabled = false WHERE source_id = ${base.id}`;
  // A 304 changes status only; B's stored version must remain independently usable.
  await sql`UPDATE geo_public_source_status SET last_success_at = now() WHERE source_id = ${other.id}`;
  visible = await loadGeoPublicItems({ q: "duplicate-fixture" });
  assert.equal(visible.total, 1);
  assert.deepEqual({ sourceId: visible.items[0].sourceId, sourceName: visible.items[0].sourceName, sourceUrl: visible.items[0].sourceUrl, title: visible.items[0].title, summary: visible.items[0].summary, publishedAt: visible.items[0].publishedAt }, { sourceId: other.id, sourceName: other.name, sourceUrl: other.sourceUrl, title: updatedB[0].title, summary: updatedB[0].summary, publishedAt: "2026-10-02T00:00:00.000Z" });
  assert.equal(visible.items[0].collectedAt, "2026-10-11T00:00:00.000Z");
});

test("large source listings preserve matching entries beyond the write-batch boundary", async () => {
  const source: PublicSource = { id: "geo-long-list", name: "Long source list", kind: "rss", config: { feedUrl: "https://long.example/feed" }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://long.example", languageHint: "en" };
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url) VALUES (${source.id}, ${source.name}, ${source.sourceUrl})`;
  const items = toPublicCandidates(Array.from({ length: 501 }, (_, index) => ({ title: `AI search archive entry-${index}`, url: `https://long.example/archive/${index}` })), source);
  await sql.begin(tx => savePublicCandidates(tx, items));
  assert.equal((await loadGeoPublicItems({ source: source.id })).total, 501);
  const tail = await loadGeoPublicItems({ source: source.id, q: "entry-500" });
  assert.equal(tail.total, 1);
  assert.equal(tail.items[0].url, "https://long.example/archive/500");
});
