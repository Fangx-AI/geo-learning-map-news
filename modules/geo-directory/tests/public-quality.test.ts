import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sql, closeDb } from "@aihot/backend/db";
import { loadGeoPublicItems, readGeoCursor, geoContentKindSql, type GeoPublicQuery } from "@aihot/backend/publication/geo-public";
import { geoReadingRankSql, readingFacts } from "@aihot/backend/publication/geo-quality";
import { loadGeoOverviewInput } from "@aihot/backend/publication/geo-overview";
import { verifyProxyRequest } from "@aihot/backend/media/imgproxy";
import { qualityFixtures } from "./quality-fixtures.ts";

after(closeDb);
const id = (value: string) => createHash("sha256").update(value).digest("hex");
const source = "quality-fixture";
/** Every page of one query; the fixtures outnumber the 50-item page limit. */
async function allItems(query: GeoPublicQuery) {
  const items = []; let cursor: string | undefined;
  do { const page = await loadGeoPublicItems({ ...query, limit: 50, cursor }); items.push(...page.items); cursor = page.nextCursor ?? undefined; } while (cursor);
  return items;
}
before(async () => {
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url) VALUES (${source}, 'Quality fixture', 'https://fixture.example')`;
  for (const fixture of qualityFixtures) await sql`INSERT INTO geo_public_items (id, canonical_id, title, summary, url, source_id, source_name, source_url, language, published_at, collected_at)
    VALUES (${id(fixture.name)}, ${id(fixture.name)}, ${fixture.title}, ${fixture.summary}, ${fixture.url}, ${source}, 'Quality fixture', 'https://fixture.example', 'en', '2026-10-15T00:00:00Z', '2026-10-16T00:00:00Z')`;
});

test("database ranking and public explanations agree for multilingual original, derivative and promotional samples", async () => {
  const rows = await sql<Array<{ id: string; reading_rank: number }>>`WITH classified AS (SELECT i.id, i.title, i.summary, i.url, (${geoContentKindSql}) AS content_kind FROM geo_public_items i WHERE i.source_id = ${source}) SELECT i.id, ${geoReadingRankSql} AS reading_rank FROM classified i`;
  for (const fixture of qualityFixtures) {
    assert.equal(rows.find(row => row.id === id(fixture.name))?.reading_rank, fixture.expected, fixture.name);
    assert.equal(readingFacts(fixture).rank, fixture.expected, fixture.name);
  }
  const items = await allItems({ source, sort: "recommended" });
  const expected = [...qualityFixtures].sort((a, b) => a.expected - b.expected || id(b.name).localeCompare(id(a.name)));
  assert.deepEqual(items.map(item => item.id), expected.map(item => id(item.name)));
  assert.deepEqual(items.map(item => item.readingPriority?.tier), expected.map(item => ["priority", "standard", "deprioritized"][item.expected]));
  assert.ok(items.every(item => !Object.hasOwn(item, "reading_rank")));
});

test("the useful view leaves out promotion, compilations and reprints and reports how many it folded", async () => {
  const page = await loadGeoPublicItems({ source, quality: "useful", limit: 50 });
  const folded = qualityFixtures.filter(fixture => readingFacts(fixture).noise).length;
  assert.ok(folded > 0 && folded < qualityFixtures.filter(fixture => fixture.expected === 2).length);
  assert.equal(page.total, qualityFixtures.length - folded);
  assert.equal(page.hiddenTotal, folded);
  assert.ok(page.items.every(item => !item.readingPriority?.folded));
  assert.equal((await loadGeoPublicItems({ source, limit: 1 })).hiddenTotal, 0);
  const cursor = (await loadGeoPublicItems({ source, quality: "useful", limit: 1 })).nextCursor!;
  assert.throws(() => readGeoCursor(cursor, { source }), /invalid/);
  assert.equal(readGeoCursor(cursor, { source, quality: "useful" })?.sort, "latest");
});

test("both orderings traverse all rows across equal timestamps without repeats; cursors bind filters and mode", async () => {
  for (const sort of ["latest", "recommended"] as const) {
    const ids: string[] = []; let cursor: string | undefined;
    do {
      // Subsequent pages may infer the mode from their v2 cursor.
      const page = await loadGeoPublicItems({ source, sort: cursor ? undefined : sort, limit: 3, cursor });
      assert.equal(page.sort, sort); ids.push(...page.items.map(item => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(ids.length, qualityFixtures.length);
    assert.equal(new Set(ids).size, qualityFixtures.length);
    assert.deepEqual(ids, (await allItems({ source, sort })).map(item => item.id));
  }
  const page = await loadGeoPublicItems({ source, sort: "recommended", limit: 2 });
  const cursor = page.nextCursor!;
  for (const change of [{ sort: "latest" }, { source: "another" }, { language: "zh" }, { q: "dataset" }, { group: "title" }, { kind: "social" }, { platform: "x" }, { period: "7d" }, { groupKey: "a".repeat(64) }] satisfies GeoPublicQuery[]) {
    assert.throws(() => readGeoCursor(cursor, { source, ...change }), /invalid/);
  }
  assert.equal(readGeoCursor(cursor, { source, limit: 50 })?.sort, "recommended");
  const badVersion = { ...JSON.parse(Buffer.from(cursor, "base64url").toString()), policy: 999 };
  assert.throws(() => readGeoCursor(Buffer.from(JSON.stringify(badVersion)).toString("base64url"), { source }), /invalid/);
  const first = await loadGeoPublicItems({ source, limit: 2 });
  const last = first.items.at(-1)!;
  const legacy = Buffer.from(JSON.stringify({ at: last.publishedAt, id: last.id })).toString("base64url");
  assert.equal((await loadGeoPublicItems({ source, cursor: legacy })).sort, "latest");
  assert.throws(() => readGeoCursor(legacy, { sort: "recommended" }), /invalid/);
  assert.equal((await loadGeoPublicItems({ q: "' OR 1=1 --", sort: "recommended" })).total, 0);
});

test("recommended groups select the strongest matching representative without crossing source filters", async () => {
  const key = id("group");
  const title = "AI search original experiment and detailed dataset findings";
  for (const [index, url, summary] of [[0, "https://news.google.com/rss/articles/group", "Research index"], [1, "https://lab.example/original", "We tested 100 queries and publish our dataset."]] as const) {
    const sourceId = `quality-group-${index}`;
    await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url) VALUES (${sourceId}, ${sourceId}, 'https://fixture.example')`;
    await sql`INSERT INTO geo_public_items (id, canonical_id, group_key, group_version, title, summary, url, source_id, source_name, source_url, language, published_at, collected_at)
      VALUES (${id(sourceId)}, ${id(sourceId)}, ${key}, 2, ${title}, ${summary}, ${url}, ${sourceId}, ${sourceId}, 'https://fixture.example', 'en', ${index ? "2026-10-15T01:00:00Z" : "2026-10-15T02:00:00Z"}, '2026-10-16T00:00:00Z')`;
  }
  const recommended = await loadGeoPublicItems({ group: "title", groupKey: key, sort: "recommended" });
  assert.equal(recommended.items[0].sourceId, "quality-group-1");
  assert.equal(recommended.items[0].nearDuplicates?.count, 2);
  assert.equal(recommended.items[0].nearDuplicates?.items[0].sourceId, "quality-group-0");
  assert.equal((await loadGeoPublicItems({ group: "title", groupKey: key, sort: "latest" })).items[0].sourceId, "quality-group-0");
  const filtered = await loadGeoPublicItems({ group: "title", groupKey: key, source: "quality-group-0", sort: "recommended" });
  assert.equal(filtered.total, 1); assert.equal(filtered.items[0].sourceId, "quality-group-0"); assert.equal(filtered.items[0].nearDuplicates, undefined);
});

test("public feed and overview expose only a signed image proxy and declared image origin", async () => {
  const target = id(qualityFixtures[0].name);
  await sql`UPDATE geo_public_items SET image_url = 'https://images.example/private-origin.jpg', image_origin = 'og' WHERE id = ${target}`;
  const feed = await allItems({ source });
  const overview = await loadGeoOverviewInput();
  for (const item of [feed.find(item => item.id === target)!, overview.items.find(item => item.id === target)!]) {
    assert.match(item.imageUrl!, /\/api\/img-proxy\?/);
    const query = new URL(item.imageUrl!, "https://site.example").searchParams;
    assert.deepEqual(verifyProxyRequest(Object.fromEntries(query)), { ok: true, url: "https://images.example/private-origin.jpg", mode: "card" });
    assert.equal(item.imageOrigin, "og");
    assert.ok(!Object.hasOwn(item, "image_url"));
    assert.ok(!Object.hasOwn(item, "image_checked_at"));
  }
});
