import test, { after } from "node:test";
import assert from "node:assert/strict";
import { sql, closeDb } from "@aihot/backend/db";
import { completePublicDates } from "../backend/public-dates.ts";
import { toPublicCandidates, type PublicSource } from "../backend/public-source.ts";
import { savePublicCandidates } from "../backend/store-public.ts";

after(closeDb);
test("stored publication dates are reused only for the same source and id and survive the next upsert", async () => {
  const source: PublicSource = { id: "geo-date-cache", name: "Date research", kind: "rss", config: { feedUrl: "https://date.example/feed", detail: { publishedAtRegex: '"datePublished":"([^"]+)"', publishedAtAuthoritative: true } }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://date.example", languageHint: "en" };
  const items = toPublicCandidates([{ title: "AI search date research", url: "https://date.example/paper" }], source);
  const date = new Date("2026-10-01T00:00:00Z");
  await sql.begin(tx => savePublicCandidates(tx, [{ ...items[0], publishedAt: date }]));
  const got = await completePublicDates(items, source, { readDetail: async () => { throw new Error("cache was not used"); } });
  assert.equal(got.metadata.cacheHits, 1);
  assert.equal(got.metadata.attempted, 0);
  assert.equal(got.items[0].publishedAt?.toISOString(), date.toISOString());
  await sql.begin(tx => savePublicCandidates(tx, got.items));
  assert.equal((await sql<{ published_at: Date }[]>`SELECT published_at FROM geo_public_items WHERE id = ${items[0].id}`)[0].published_at.toISOString(), date.toISOString());
  const other = { ...source, id: "geo-other-date-cache" };
  const mismatch = await completePublicDates([{ ...items[0], sourceId: other.id }], other, { readDetail: async () => ({ publishedAt: null, title: null, summary: null, body: null }) });
  assert.equal(mismatch.metadata.cacheHits, 0);
  assert.equal(mismatch.metadata.attempted, 1);
  assert.equal(mismatch.items[0].publishedAt, null);
});
