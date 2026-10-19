import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";
import { loadGeoCollectionStatus } from "@aihot/backend/publication/geo-public";
import { loadPublicSources } from "../backend/collect-public.ts";

after(closeDb);

test("public source health uses the collector's current intervals without writing attempt or error state", async () => {
  const sources = await loadPublicSources();
  const scheduled = [120, 180, 360, 1440].map(interval => {
    const source = sources.find(row => row.interval_minutes === interval);
    assert.ok(source, `a real ${interval}-minute fixture must exist`);
    return source;
  });
  const now = Date.now();
  for (const source of scheduled) {
    await sql`INSERT INTO geo_public_source_status(source_id,source_name,source_url,status,last_attempt_at,last_success_at,error)
      VALUES(${source.id},${source.name},${source.sourceUrl},'error',${new Date(now - (source.interval_minutes + 15) * 60_000)},${new Date(now - 3 * 86400_000)},'来源返回 HTTP 429')`;
  }
  for (const id of ["public-reddit", "source-stale-unknown"])
    await sql`INSERT INTO geo_public_source_status(source_id,source_name,source_url,status,last_attempt_at)
      VALUES(${id},${id},'https://example.invalid/','ok',${new Date(now - 121 * 60_000)})`;

  const before = await sql`SELECT * FROM geo_public_source_status ORDER BY source_id`;
  const first = await loadGeoCollectionStatus();
  for (const source of scheduled) {
    const result = first.sources.find(row => row.id === source.id)!;
    assert.equal(result.stale, false, `${source.interval_minutes}-minute source is within its scheduled grace period`);
    assert.equal(result.status, "error", "waiting does not hide an existing fetch error");
    assert.equal(result.error, "来源返回 HTTP 429");
  }
  for (const id of ["public-reddit", "source-stale-unknown"]) assert.equal(first.sources.find(row => row.id === id)?.stale, true);
  assert.deepEqual(await sql`SELECT * FROM geo_public_source_status ORDER BY source_id`, before);

  for (const source of scheduled)
    await sql`UPDATE geo_public_source_status SET last_attempt_at=${new Date(now - (source.interval_minutes + 31) * 60_000)} WHERE source_id=${source.id}`;
  const overdue = await loadGeoCollectionStatus();
  for (const source of scheduled) assert.equal(overdue.sources.find(row => row.id === source.id)?.stale, true);
});
