import test, { after } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";
import { loadGeoPublicItems } from "@aihot/backend/publication/geo-public";

after(closeDb);

test("undated backlog from a source's first crawl follows dated news, while later undated finds keep their collection time", async () => {
  const source = "latest-order-fixture";
  await sql`INSERT INTO geo_public_source_status (source_id, source_name, source_url) VALUES (${source}, 'Latest order', 'https://order.example')`;
  const rows: Array<[string, string | null, string]> = [
    ["backlog", null, "2026-10-20T00:00:00Z"],
    ["dated-old", "2026-10-01T00:00:00Z", "2026-10-20T00:00:05Z"],
    ["dated-new", "2026-10-21T00:00:00Z", "2026-10-21T01:00:00Z"],
    ["undated-new", null, "2026-10-21T02:00:00Z"],
  ];
  for (const [name, publishedAt, collectedAt] of rows) {
    const id = createHash("sha256").update(name).digest("hex");
    await sql`INSERT INTO geo_public_items (id, canonical_id, title, url, source_id, source_name, source_url, language, published_at, collected_at)
      VALUES (${id}, ${id}, ${`AI search ${name}`}, ${`https://order.example/${name}`}, ${source}, 'Latest order', 'https://order.example', 'en', ${publishedAt}, ${collectedAt})`;
  }
  const order = ["undated-new", "dated-new", "dated-old", "backlog"];
  const page = await loadGeoPublicItems({ source, sort: "latest" });
  assert.deepEqual(page.items.map(item => item.title.replace("AI search ", "")), order);
  const walked: string[] = [];
  let cursor: string | undefined;
  do {
    const next = await loadGeoPublicItems({ source, sort: "latest", limit: 1, cursor });
    walked.push(...next.items.map(item => item.title.replace("AI search ", "")));
    cursor = next.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(walked, order);
});
