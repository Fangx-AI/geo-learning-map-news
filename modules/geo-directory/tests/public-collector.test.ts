import test, { after } from "node:test";
import assert from "node:assert/strict";
import { sql, closeDb } from "@aihot/backend/db";
import { collectSource, reconcilePublicSources } from "../backend/collect-public.ts";
import { completePublicDates } from "../backend/public-dates.ts";
import type { PublicSource } from "../backend/public-source.ts";
import { toPublicCandidates } from "../backend/public-source.ts";
import { savePublicCandidates } from "../backend/store-public.ts";

after(closeDb);

test("switching an existing source to a day-only listing preserves its original ID, precise date and collection time", async () => {
  const configured: PublicSource = {...source,id:'public-collector-day-precision',kind:'web_list',publicDatePrecision:'day',config:{url:'https://research.example/search'}};
  await reconcilePublicSources([configured], []);
  const candidate={url:'https://research.example/precision',title:'AI search citation research',excerpt:'An original AI search study.',publishedAt:new Date('2025-07-22T13:54:17Z')};
  const original=toPublicCandidates([candidate],configured);
  await sql.begin(tx=>savePublicCandidates(tx,original,new Date('2026-10-16T00:00:00Z')));
  const [before]=await sql`SELECT id,published_at,collected_at,title,summary FROM geo_public_items WHERE id=${original[0].id}`;
  const result=await collectSource(configured,{readWebList:async()=>[{...candidate,publishedAt:new Date('2025-07-22T00:00:00Z')}]});
  assert.equal(result.status,'ok');
  assert.equal(result.matched,1);
  assert.deepEqual((await sql`SELECT id,published_at,collected_at,title,summary FROM geo_public_items WHERE source_id=${configured.id}`)[0],before);
});

test("scheduled collection waits through failures without hiding them; manual reads remain explicit", async () => {
  const scheduled = { ...source, id: "public-collector-schedule", interval_minutes: 360 };
  await reconcilePublicSources([scheduled], []);
  await sql`UPDATE geo_public_source_status SET status='error',last_attempt_at=now(),last_success_at=now()-interval '1 day',error='来源返回 HTTP 429',fetched_count=30,matched_count=28 WHERE source_id=${scheduled.id}`;
  const [before] = await sql`SELECT * FROM geo_public_source_status WHERE source_id=${scheduled.id}`;
  let reads = 0;
  const readRss: typeof import('@aihot/backend/sources/rss').fetchRss = async () => {
    reads++;
    return { candidates: [], notModified: false, validator: { configHash: 'schedule-fixture', responseUrl: scheduled.config.feedUrl, etag: null, lastModified: null } };
  };
  assert.equal((await collectSource(scheduled, {readRss, respectInterval:true})).status, 'skipped');
  assert.equal(reads, 0);
  assert.deepEqual((await sql`SELECT * FROM geo_public_source_status WHERE source_id=${scheduled.id}`)[0], before);
  await sql`UPDATE geo_public_source_status SET last_attempt_at=now()-interval '7 hours' WHERE source_id=${scheduled.id}`;
  assert.equal((await collectSource(scheduled, {readRss, respectInterval:true})).status, 'ok');
  assert.equal(reads, 1);
  assert.equal((await collectSource(scheduled, {readRss, respectInterval:true})).status, 'skipped');
  assert.equal(reads, 1);
  assert.equal((await collectSource(scheduled, {readRss})).status, 'ok');
  assert.equal(reads, 2);
});
const source: PublicSource = { id: "public-collector-dates", name: "Date research", kind: "rss", config: { feedUrl: "https://research.example/feed", publishedAfter: "2026-01-01T00:00:00Z", detail: { publishedAtRegex: '"datePublished":"([^"]+)"', publishedAtAuthoritative: true } }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://research.example/", languageHint: "en" };
const candidates = [
  { url: "https://research.example/current", title: "ChatGPT cites pages" },
  { url: "https://research.example/history", title: "AI search historical research" },
  { url: "https://research.example/retry", title: "Generative engine optimization study" },
  { url: "https://research.example/unrelated", title: "A day at the beach" },
];

test("collector matches GEO before detail requests, applies publication window after enrichment, and retries unfinished RSS dates", async () => {
  await reconcilePublicSources([source], []);
  const detailCalls: string[] = [], validators: boolean[] = [];
  let recovered = false;
  const dependencies: NonNullable<Parameters<typeof collectSource>[1]> = {
    readRss: async configured => {
      validators.push(Boolean(configured.cursor?.rss));
      return { candidates: configured.cursor?.rss ? [] : candidates, notModified: Boolean(configured.cursor?.rss), validator: { configHash: "fixture", responseUrl: source.config.feedUrl, etag: '"same-feed"', lastModified: null } };
    },
    completeDates: (items, configured, options) => completePublicDates(items, configured, { ...options, readDetail: async url => {
      detailCalls.push(url);
      if (url.endsWith("/retry") && !recovered) throw new Error("temporary fixture detail failure");
      return { publishedAt: new Date(url.endsWith("/history") ? "2025-01-01T00:00:00Z" : "2026-02-01T00:00:00Z"), title: null, summary: null, body: null };
    } }),
  };
  const first = await collectSource(source, dependencies);
  assert.equal(first.status, "partial"); assert.equal(first.fetched, 4); assert.equal(first.matched, 1);
  assert.ok(detailCalls.every(url => !url.endsWith("/unrelated")), "unrelated material must not cause detail requests");
  let items = await sql`SELECT url, published_at FROM geo_public_items WHERE source_id = ${source.id}`;
  assert.deepEqual(items.map(item => item.url), [candidates[0].url]);
  assert.equal(items[0].published_at.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal((await sql`SELECT cursor FROM geo_public_source_status WHERE source_id = ${source.id}`)[0].cursor.publicDates.failed, 1);
  recovered = true;
  const second = await collectSource(source, dependencies);
  assert.equal(second.status, "ok"); assert.equal(second.matched, 2);
  assert.deepEqual(validators, [false, false], "unfinished dates must not be frozen behind a 304 response");
  assert.equal(detailCalls.filter(url => url.endsWith("/current")).length, 1, "the stored date avoids another successful detail request");
  items = await sql`SELECT url FROM geo_public_items WHERE source_id = ${source.id} ORDER BY url`;
  assert.deepEqual(items.map(item => item.url), [candidates[0].url, candidates[2].url]);
});

test("collector persists the date cursor and reports deferred work until every record gets a turn", async () => {
  const bounded = { ...source, id: "public-collector-date-budget", config: { ...source.config, detail: { ...source.config.detail, maxFetches: 1 } } };
  await reconcilePublicSources([source, bounded], []);
  const eligible = candidates.slice(0, 3), calls: string[] = [];
  const dependencies: NonNullable<Parameters<typeof collectSource>[1]> = {
    readRss: async configured => {
      assert.equal(configured.cursor?.rss, undefined, "deferred dates must keep feed processing active");
      return { candidates: eligible, notModified: false, validator: { configHash: "fixture", responseUrl: source.config.feedUrl, etag: '"unchanged"', lastModified: null } };
    },
    completeDates: (items, configured, options) => completePublicDates(items, configured, { ...options, readDetail: async url => {
      calls.push(url);
      if (url.endsWith("/current")) throw new Error("persistent first-item failure");
      return { publishedAt: new Date("2026-02-01T00:00:00Z"), title: null, summary: null, body: null };
    } }),
  };
  const first = await collectSource(bounded, dependencies);
  assert.equal(first.status, "partial"); assert.equal(first.matched, 0);
  const second = await collectSource(bounded, dependencies);
  assert.equal(second.status, "partial"); assert.equal(second.matched, 1);
  const third = await collectSource(bounded, dependencies);
  assert.equal(third.status, "partial"); assert.equal(third.matched, 2);
  assert.deepEqual(calls, eligible.map(item => item.url));
  const [state] = await sql`SELECT cursor FROM geo_public_source_status WHERE source_id = ${bounded.id}`;
  assert.equal(state.cursor.publicDates.deferred, 1);
  assert.equal(state.cursor.publicDates.failed, 0);
  assert.equal(state.cursor.rss, undefined);
});
