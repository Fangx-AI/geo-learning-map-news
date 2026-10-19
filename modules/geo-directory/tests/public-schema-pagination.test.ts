import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";
import { loadGeoPublicItems } from "@aihot/backend/publication/geo-public";

after(closeDb);

test("a warm public read pool keeps complete pagination after additive schema changes", async t => {
  const source = "schema-pagination-fixture";
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url) VALUES (${source}, 'Schema pagination', 'https://schema.example')`;
  await sql`INSERT INTO geo_public_items (id, canonical_id, title, url, source_id, source_name, source_url, language, published_at, collected_at, group_key, group_version)
    SELECT lpad(to_hex(n), 64, '0'), lpad(to_hex(n), 64, '0'), 'AI search original citation study ' || n,
      'https://schema.example/article/' || n, ${source}, 'Schema pagination', 'https://schema.example', 'en',
      CASE WHEN n % 13 = 0 THEN NULL ELSE '2026-10-16T08:00:00Z'::timestamptz + (n % 30) * interval '1 microsecond' END,
      '2026-10-16T08:00:00Z'::timestamptz + (n % 30) * interval '1 microsecond',
      lpad(to_hex(CASE WHEN n <= 130 THEN (n - 1) / 2 ELSE n END), 64, '0'), 2
    FROM generate_series(1,1309) AS n`;
  const walk = async (group: "none" | "title", phase: string) => {
    let cursor: string | undefined;
    const ids: string[] = [], members = new Set<string>();
    let pages = 0;
    do {
      const page = await loadGeoPublicItems({ source, group, limit: 50, cursor });
      assert.equal(page.total, 1309, phase);
      assert.equal(page.totalGroups, group === "none" ? 1309 : 1244, phase);
      ids.push(...page.items.map(item => item.id));
      for (const item of page.items) { members.add(item.id); for (const other of item.nearDuplicates?.items ?? []) members.add(other.id); }
      cursor = page.nextCursor ?? undefined;
      assert.ok(++pages < 35, "cursor must terminate");
    } while (cursor);
    t.diagnostic(`${phase} ${group}: ${ids.length} representatives, ${members.size} members in ${pages} pages`);
    assert.equal(new Set(ids).size, ids.length, phase + " duplicate representatives");
    assert.equal(ids.length, group === "none" ? 1309 : 1244, phase + " missing representatives");
    assert.equal(members.size, 1309, phase + " missing members");
  };
  await walk("none", "warm"); await walk("title", "warm");
  // Exercise the same prepared SQL across the pool, not just one reserved connection.
  await Promise.all(Array.from({ length: 12 }, () => loadGeoPublicItems({ source, group: "none", limit: 50 })));
  for (let pass = 1; pass <= 3; pass++) {
    await sql`ALTER TABLE geo_public_items ADD COLUMN ${sql(`pagination_schema_probe_${pass}`)} integer NOT NULL DEFAULT 0`;
    await walk("none", `after ADD ${pass}`); await walk("title", `after ADD ${pass}`);
  }
});
