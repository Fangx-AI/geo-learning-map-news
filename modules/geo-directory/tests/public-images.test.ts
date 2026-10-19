import test, { after } from "node:test";
import assert from "node:assert/strict";
import { sql, closeDb } from "@aihot/backend/db";
import { collectPublicImages, readPublicCover } from "../backend/collect-images.ts";
import { toPublicCandidates, type PublicSource } from "../backend/public-source.ts";
import { savePublicCandidates } from "../backend/store-public.ts";

after(closeDb);
const source: PublicSource = { id: "image-fixture", name: "Image research", kind: "rss", config: { feedUrl: "https://research.example/feed" }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://research.example/", languageHint: "en" };
test("cover backlog is bounded, retries after cooldown and never replaces a feed cover", async () => {
  await sql`INSERT INTO geo_public_source_status (source_id,source_name,source_url,enabled) VALUES (${source.id},${source.name},${source.sourceUrl},true)`;
  const items = toPublicCandidates(["found", "none", "error", "rss", "race"].map((name, index) => ({ title: `AI search ${name}`, url: `https://research.example/${name}`, publishedAt: new Date(Date.UTC(2026, 0, 5 - index)), ...(name === "rss" ? { media: [{ kind: "image" as const, url: "https://cdn.example/original.jpg" }] } : {}) })), source);
  await sql.begin(tx => savePublicCandidates(tx, items));
  const calls: string[] = [];
  const read = async (url: string): Promise<string | null> => {
    calls.push(url);
    if (url.endsWith("error")) throw new Error("timeout with secret raw payload");
    if (url.endsWith("race")) await sql`UPDATE geo_public_items SET image_url = 'https://cdn.example/new-feed.jpg', image_origin = 'rss' WHERE url = ${url}`;
    return url.endsWith("none") ? null : "https://cdn.example/cover.jpg";
  };
  assert.deepEqual(await collectPublicImages({ sourceId: source.id, limit: 2, read }), { attempted: 2, found: 1, noCover: 1, failed: 0, reused: 0 });
  assert.deepEqual(await collectPublicImages({ sourceId: source.id, limit: 2, read }), { attempted: 2, found: 1, noCover: 0, failed: 1, reused: 0 });
  assert.equal((await collectPublicImages({ sourceId: source.id, read })).attempted, 0);
  assert.equal(calls.length, 4);
  const rows = await sql`SELECT url,image_url,image_error FROM geo_public_items WHERE source_id = ${source.id}`;
  assert.equal(rows.find(row => row.url.endsWith("rss"))?.image_url, "https://cdn.example/original.jpg");
  assert.equal(rows.find(row => row.url.endsWith("race"))?.image_url, "https://cdn.example/new-feed.jpg");
  assert.equal(rows.find(row => row.url.endsWith("error"))?.image_error, "请求超时，本轮未完成");
  await sql.begin(tx => savePublicCandidates(tx, items.map(item => ({ ...item, imageUrl: null, imageOrigin: null }))));
  assert.equal((await collectPublicImages({ sourceId: source.id, read })).attempted, 0, "feed refresh must retain cover cooldown");
  await sql`UPDATE geo_public_items SET image_checked_at = now() - interval '2 days' WHERE image_status IN ('none','error') AND source_id = ${source.id}`;
  assert.equal((await collectPublicImages({ sourceId: source.id, read })).attempted, 1, "error retries daily; absence retries weekly");
});

test("existing canonical covers are reused and genuine Google documentation is eligible", async () => {
  const copySource = { ...source, id: "image-copy" };
  await sql`INSERT INTO geo_public_source_status (source_id,source_name,source_url,enabled) VALUES (${copySource.id},${source.name},${source.sourceUrl},true)`;
  const items = toPublicCandidates([
    { title: "AI search rss", url: "https://research.example/rss" },
    { title: "AI search official change", url: "https://developers.google.com/search/blog/change" },
    { title: "AI search index result", url: "https://news.google.com/rss/articles/index" },
  ], copySource);
  await sql.begin(tx => savePublicCandidates(tx, items));
  const calls: string[] = [];
  const result = await collectPublicImages({ sourceId: copySource.id, read: async url => { calls.push(url); return null; } });
  assert.equal(result.reused, 1);
  assert.deepEqual(calls, ["https://developers.google.com/search/blog/change"]);
  const [row] = await sql`SELECT image_url FROM geo_public_items WHERE source_id = ${copySource.id} AND url = 'https://research.example/rss'`;
  assert.equal(row.image_url, "https://cdn.example/original.jpg");
});

test("cover reader keeps bounded public requests and rejects HTTP/access checks", async () => {
  const response = (html: string, status = 200) => ({ status, url: "https://research.example/article", headers: new Headers({ "content-type": "text/html" }), body: Buffer.from(html), text: () => html });
  assert.equal(await readPublicCover("https://research.example/article", async (_url, opts) => {
    assert.equal(opts?.redirectPolicy, "same-origin"); assert.equal(opts?.maxBytes, 2 * 1024 * 1024); assert.equal(opts?.timeoutMs, 12_000);
    return response('<meta property="og:image" content="/graph.jpg">');
  }), "https://research.example/graph.jpg");
  await assert.rejects(readPublicCover("https://research.example/article", async () => response("Forbidden", 403)));
  await assert.rejects(readPublicCover("https://research.example/article", async () => response('<title>Verify you are human</title>')));
  assert.equal(await readPublicCover("http://127.0.0.1/article", async () => { throw new Error("must not fetch"); }), null);
});

test("existing X posts recover only their own public photos with the same request budget", async () => {
  const json = JSON.stringify({ __typename: "Tweet", id_str: "123456789", created_at: "2026-10-01T00:00:00Z", text: "AI search experiment", user: { screen_name: "research", profile_image_url: "https://cdn.example/avatar.jpg" }, photos: [{ url: "https://pbs.twimg.com/media/result.jpg", width: 1200, height: 800 }] });
  const image = await readPublicCover("https://x.com/research/status/123456789", async (url, opts) => {
    assert.equal(new URL(url).hostname, "cdn.syndication.twimg.com");
    assert.equal(opts?.timeoutMs, 12_000); assert.equal(opts?.maxBytes, 2 * 1024 * 1024);
    return { status: 200, url, headers: new Headers({ "content-type": "application/json" }), body: Buffer.from(json), text: () => json };
  });
  assert.equal(image, "https://pbs.twimg.com/media/result.jpg");
});
