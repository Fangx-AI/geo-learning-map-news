import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sql, closeDb } from "@aihot/backend/db";
import { loadGeoPublicItems, geoContentKindSql } from "@aihot/backend/publication/geo-public";
import { groupLinkPreference, geoGroupLinkPreferenceSql } from "@aihot/backend/publication/geo-quality";

after(closeDb);
const id = (name: string) => createHash("sha256").update(`reading-round2-${name}`).digest("hex");
const source = "reading-round2-group";
const samples = [
  { name: "original", group: "one", title: "From Public Posts to AI-Search Citations: Measuring the Fragility of AI Search", summary: "We tested 100 queries and publish our dataset.", url: "https://arxiv.org/abs/2610.11932", at: "2026-10-16T09:00:00Z" },
  { name: "discussion", group: "one", title: "From Public Posts to AI-Search Citations: Measuring the Fragility of AI Search", summary: "We tested 100 queries and publish our dataset.", url: "https://news.ycombinator.com/item?id=50029465", at: "2026-10-16T10:00:00Z" },
  { name: "independent-social", group: "two", title: "I tested 200 AI search prompts for local business recommendations", summary: "Our experiment found no effect.", url: "https://bsky.app/profile/author.example/post/research", at: "2026-10-16T11:00:00Z" },
  { name: "ordinary-direct", group: "three", title: "Understanding citation visibility for generative search engines", summary: "A guide to understanding citations.", url: "https://guide.example/citations", at: "2026-10-16T11:00:00Z" },
  { name: "better-social", group: "three", title: "Understanding citation visibility for generative search engines", summary: "We tested 100 queries and publish our dataset.", url: "https://bsky.app/profile/author.example/post/citations", at: "2026-10-16T08:00:00Z" },
  { name: "marketing-original", group: "four", title: "Best GEO service providers: guide to options", summary: "Contact us for advice.", url: "https://agency.example/guide", at: "2026-10-16T09:00:00Z" },
  { name: "marked-reprint", group: "four", title: "Best GEO service providers: guide to options", summary: "Originally published at another publisher. Contact us for advice.", url: "https://publisher.example/reprinted-guide", at: "2026-10-16T11:00:00Z" },
];
before(async () => {
  await sql`INSERT INTO geo_public_source_status(source_id,source_name,source_url) VALUES(${source},'Round2 group','https://fixture.example')`;
  for (const item of samples) await sql`INSERT INTO geo_public_items(id,canonical_id,group_key,group_version,title,summary,url,source_id,source_name,source_url,language,published_at,collected_at) VALUES(${id(item.name)},${id(item.name)},${id(item.group)},2,${item.title},${item.summary},${item.url},${source},'Round2 group','https://fixture.example','en',${item.at},${item.at})`;
});

test("round2 same-tier direct representative keeps every URL and stable paged group order", async () => {
  const query = { source, sort: "recommended" as const, group: "title" as const };
  const first = await loadGeoPublicItems(query);
  assert.deepEqual(first.items.map(i => i.id), ["independent-social", "original", "better-social", "marketing-original"].map(id));
  const original = first.items.find(i => i.id === id("original"))!;
  assert.equal(original.publishedAt, new Date(samples[0].at).toISOString());
  assert.equal(original.url, samples[0].url);
  assert.equal(original.nearDuplicates?.count, 2);
  assert.deepEqual(original.nearDuplicates?.items.map(i => ({ id: i.id, url: i.url })), [{ id: id("discussion"), url: samples[1].url }]);
  const seen: string[] = []; let cursor: string | undefined;
  do {
    const page = await loadGeoPublicItems({ ...query, limit: 1, cursor });
    seen.push(...page.items.map(i => i.id)); cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(seen, first.items.map(i => i.id));
  assert.equal(new Set(seen).size, 4);
});

test("round2 representative preference leaves latest and ungrouped chronology intact", async () => {
  const latest = await loadGeoPublicItems({ source, sort: "latest", group: "title", groupKey: id("one") });
  assert.equal(latest.items[0].id, id("discussion"));
  const all = await loadGeoPublicItems({ source, sort: "recommended", group: "none", groupKey: id("one") });
  assert.deepEqual(all.items.map(i => i.id), [id("discussion"), id("original")]);
  const socialOnly = await loadGeoPublicItems({ source, sort: "recommended", group: "title", groupKey: id("three"), kind: "social" });
  assert.equal(socialOnly.items[0].id, id("better-social"));
  assert.equal(socialOnly.total, 1);
});

test("round2 SQL and JS group preferences agree for direct, social, HN and reprint links", async () => {
  const rows = await sql<Array<{ id: string; title: string; summary: string | null; url: string; content_kind: string; preference: number }>>`WITH i AS(SELECT i.id,i.title,i.summary,i.url,(${geoContentKindSql}) AS content_kind FROM geo_public_items i WHERE i.source_id=${source}) SELECT i.*,${geoGroupLinkPreferenceSql} AS preference FROM i`;
  for (const row of rows) assert.equal(row.preference, groupLinkPreference({ ...row, contentKind: row.content_kind }), row.id);
  assert.equal(rows.find(row => row.id === id("marked-reprint"))?.preference, 1);
});
