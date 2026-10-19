import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";
import { loadGeoPublicItems } from "@aihot/backend/publication/geo-public";
import { toPublicCandidates, type PublicSource } from "../backend/public-source.ts";
import { savePublicCandidates, upgradePublicGroups } from "../backend/store-public.ts";
import { publicGroupKey, PUBLIC_GROUP_VERSION } from "../backend/public-grouping.ts";
after(closeDb);
const source: PublicSource = { id: "group-fixture", name: "Index fixture", kind: "rss", config: { feedUrl: "https://fixture.example/feed" }, tier: "T1", participation_mode: "editorial", first_party: false, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://fixture.example", languageHint: "en" };

test("group pagination preserves every member including large groups, and filters apply before grouping", async () => {
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url) VALUES (${source.id}, ${source.name}, ${source.sourceUrl})`;
  const make = (id: string, title: string, day = "2026-10-16") => ({ title, url: `https://news.google.com/rss/articles/${id}`, publishedAt: new Date(`${day}T00:00:00Z`), excerpt: "ChatGPT original experiment with citations", raw: { publisherName: "Research lab", publisherUrl: "https://research.example" } });
  const items = toPublicCandidates([
    ...Array.from({ length: 23 }, (_, i) => make(`same-${i}`, `AI search detailed experiment and original findings - Publisher ${i}`)),
    make("other", "AI search a different long article about retrieval"),
    make("older", "AI search detailed experiment and original findings - Publisher", "2026-10-15"),
    { ...make("unknown-1", "AI search detailed experiment and original findings"), publishedAt: null },
    { ...make("unknown-2", "AI search detailed experiment and original findings"), publishedAt: null },
  ], source);
  await sql.begin(tx => savePublicCandidates(tx, items));
  const groups = [];
  let cursor: string | undefined;
  do {
    const page = await loadGeoPublicItems({ source: source.id, group: "title", limit: 1, cursor });
    assert.equal(page.total, 27); assert.equal(page.totalGroups, 5);
    groups.push(...page.items); cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(groups.length, 5);
  const grouped = groups.find(item => item.nearDuplicates)!;
  assert.equal(grouped.nearDuplicates!.count, 23);
  assert.equal(grouped.nearDuplicates!.items.length, 19);
  assert.equal(grouped.nearDuplicates!.remainingCount, 3);
  const members = await loadGeoPublicItems({ source: source.id, group: "none", groupKey: grouped.nearDuplicates!.key, limit: 50 });
  assert.equal(members.total, 23); assert.equal(members.items.length, 23);
  assert.ok(members.items.every(item => !item.nearDuplicates));
  assert.equal(new Set(members.items.map(item => item.id)).size, 23);
  assert.equal(members.items[0].publisherName, "Research lab");
  const filtered = await loadGeoPublicItems({ source: source.id, group: "title", q: '"different long" citations ChatGPT' });
  assert.equal(filtered.total, 1); assert.deepEqual(filtered.searchTerms, ["different long", "citations", "ChatGPT"]);
  const unfiltered = await loadGeoPublicItems({ source: source.id, limit: 50 });
  assert.equal(unfiltered.items.length, 27); assert.equal(unfiltered.groupMode, "none");
});

test("group metadata backfill is resumable and does not delete or alter original records", async () => {
  const [before] = await sql`SELECT count(*)::int AS n FROM geo_public_items`;
  await sql`UPDATE geo_public_items SET group_key = NULL`;
  assert.equal(await upgradePublicGroups(), before.n);
  assert.equal(await upgradePublicGroups(), 0);
  assert.equal((await sql`SELECT count(*)::int AS n FROM geo_public_items`)[0].n, before.n);
});

test("old nonempty group keys are recomputed in batches, locked remainders resume, and current writes stay on v2", async () => {
  const fixture = { ...source, id: "group-version-fixture" };
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url) VALUES (${fixture.id}, ${fixture.name}, ${fixture.sourceUrl})`;
  const dates = ["2026-10-15T23:00:00Z", "2026-10-16T01:00:00Z", "2026-10-16T18:00:00Z"];
  const items = toPublicCandidates(Array.from({ length: 252 }, (_, index) => ({ title: "AI search versioned grouping experiment with original findings", url: `https://research.example/version-${index}`, publishedAt: new Date(dates[index % 3]) })), fixture, Date.parse("2026-10-17T00:00:00Z"));
  await sql.begin(tx => savePublicCandidates(tx, items));
  assert.equal((await sql`SELECT count(*)::int AS n FROM geo_public_items WHERE source_id = ${fixture.id} AND group_version = ${PUBLIC_GROUP_VERSION}`)[0].n, items.length);
  const before = await sql`SELECT id, title, url, summary, published_at, collected_at, source_id FROM geo_public_items WHERE source_id = ${fixture.id} ORDER BY id`;
  await sql`UPDATE geo_public_items SET group_key = ${"e".repeat(64)}, group_version = 1 WHERE source_id = ${fixture.id}`;
  // One unfinished row is locked by another transaction. The first pass still commits two
  // bounded batches, and the next invocation resumes the skipped remainder after release.
  await sql.begin(async tx => {
    await tx`SELECT id FROM geo_public_items WHERE id = ${items[0].id} FOR UPDATE`;
    assert.equal(await upgradePublicGroups(), items.length - 1);
  });
  assert.equal(await upgradePublicGroups(), 1);
  assert.equal(await upgradePublicGroups(), 0);
  const keys = await sql<Array<{ id: string; group_key: string; group_version: number }>>`SELECT id, group_key, group_version FROM geo_public_items WHERE source_id = ${fixture.id}`;
  const expected = new Map(items.map(item => [item.id, publicGroupKey(item)]));
  for (const row of keys) { assert.equal(row.group_version, 2); assert.equal(row.group_key, expected.get(row.id)); }
  assert.deepEqual(await sql`SELECT id, title, url, summary, published_at, collected_at, source_id FROM geo_public_items WHERE source_id = ${fixture.id} ORDER BY id`, before);
  const visible = await loadGeoPublicItems({ source: fixture.id, group: "title" });
  assert.equal(visible.total, 252); assert.equal(visible.totalGroups, 2);
  await sql`UPDATE geo_public_items SET group_version = 0, group_key = ${"f".repeat(64)} WHERE id = ${items[0].id}`;
  await sql.begin(tx => savePublicCandidates(tx, [items[0]]));
  assert.equal(await upgradePublicGroups(), 0, "upserts also write the current version without waiting for backfill");
});
