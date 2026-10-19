import test, { after } from "node:test";
import assert from "node:assert/strict";
import { sql, closeDb } from "@aihot/backend/db";
import { loadGeoOverviewInput } from "@aihot/backend/publication/geo-overview";
import { buildGeoOverview } from "../backend/overview.ts";

after(closeDb);

test("overview reads enabled unique URLs and includes an explicitly selected historical day beyond the recent sample", async () => {
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url, enabled, status, last_success_at) VALUES
    ('overview-a', 'Source A', 'https://a.example', true, 'ok', now()),
    ('overview-b', 'Source B', 'https://b.example', true, 'ok', now()),
    ('overview-off', 'Disabled source', 'https://off.example', false, 'ok', now())`;
  await sql`INSERT INTO geo_public_items (id, canonical_id, title, url, source_id, source_name, source_url, published_at, collected_at)
    SELECT encode(sha256(convert_to('sample-' || n, 'UTF8')), 'hex'), encode(sha256(convert_to('sample-' || n, 'UTF8')), 'hex'),
      'AI search study ' || n, 'https://a.example/article/' || n, 'overview-a', 'Source A', 'https://a.example', '2025-01-01T00:00:00Z', '2026-10-01T00:00:00Z'
    FROM generate_series(1, 4005) n`;
  await sql`INSERT INTO geo_public_items (id, canonical_id, title, url, source_id, source_name, source_url, published_at, collected_at) VALUES
    (${"e".repeat(64)}, ${"1".repeat(64)}, 'Historical AI search published', 'https://a.example/old', 'overview-a', 'Source A', 'https://a.example', '2001-01-01T16:30:00Z', '2001-01-03T00:00:00Z'),
    (${"f".repeat(64)}, ${"1".repeat(64)}, 'Duplicate from B', 'https://a.example/old', 'overview-b', 'Source B', 'https://b.example', '2001-01-01T16:30:00Z', '2001-01-04T00:00:00Z'),
    (${"a".repeat(64)}, ${"2".repeat(64)}, 'Historical AI search unknown date', 'https://a.example/unknown', 'overview-a', 'Source A', 'https://a.example', NULL, '2001-01-01T17:00:00Z'),
    (${"b".repeat(64)}, ${"3".repeat(64)}, 'Hidden AI search', 'https://off.example/old', 'overview-off', 'Disabled source', 'https://off.example', '2001-01-02T00:00:00Z', '2001-01-02T00:00:00Z')`;
  const data = await loadGeoOverviewInput("2001-01-02");
  assert.equal(data.total, 4007);
  assert.equal(data.items.length, 4002);
  assert.equal(data.dailyTotal, 2);
  assert.equal(data.selectedDay, "2001-01-02");
  assert.deepEqual(data.days.find(day => day.day === "2001-01-02"), { day: "2001-01-02", count: 2, publishedCount: 1, collectedOnlyCount: 1 });
  assert.ok(!data.items.some(item => item.sourceId === "overview-off" || item.sourceId === "overview-b"));
  const overview = buildGeoOverview(data, Date.parse("2026-10-16T00:00:00Z"));
  assert.equal(overview.stats.truncated, true);
  assert.equal(overview.dailyItems.length, 2);
  assert.deepEqual(overview.dailyItems.map(item => item.dateBasis).sort(), ["collected", "published"]);
  assert.equal((await loadGeoOverviewInput("1990-01-01")).dailyTotal, 0);
});
