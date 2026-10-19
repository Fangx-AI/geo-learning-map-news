import test, { after } from "node:test";
import assert from "node:assert/strict";
import { sql, closeDb } from "@aihot/backend/db";
import { reconcilePublicSources } from "../backend/collect-public.ts";
import { collectPublicSocial } from "../backend/collect-social.ts";
import { socialPublicationSource, type PublicSocialSource } from "../backend/public-social.ts";

after(closeDb);
const source: PublicSocialSource = { id: "public-x-test", name: "X public test", platform: "x", url: "https://x.com/", enabled: true, maxPostsPerRun: 1, refreshHours: 168, seedUrls: ["https://x.com/researcher/status/12345", "https://x.com/researcher/status/12346"], discovery: [] };

test("reconciliation retains ordinary and social sources together, and disables removed social configurations", async () => {
  const ordinary = { ...socialPublicationSource(source), id: "rss-test", kind: "rss" as const, config: { feedUrl: "https://research.example/feed" } };
  await reconcilePublicSources([ordinary], [source]);
  await reconcilePublicSources([ordinary], [source]);
  assert.deepEqual((await sql`SELECT source_id, enabled FROM geo_public_source_status ORDER BY source_id`).map(row => [row.source_id, row.enabled]), [[source.id, true], [ordinary.id, true]]);
  await reconcilePublicSources([ordinary], []);
  assert.equal((await sql`SELECT enabled FROM geo_public_source_status WHERE source_id = ${source.id}`)[0].enabled, false);
});

test("social discovery persists overflow, checks each due post once, and leaves last success unchanged when idle", async () => {
  await reconcilePublicSources([], [source]);
  const calls: string[] = [];
  const read = async (url: string) => { calls.push(url); return { url, title: "AI search citation study", publishedAt: new Date("2026-01-01T00:00:00Z") }; };
  assert.equal((await collectPublicSocial(source, { read })).matched, 1);
  assert.equal((await collectPublicSocial(source, { read })).matched, 1);
  assert.equal(new Set(calls).size, 2, "a per-round cap must not strand pending links or repeat the first link");
  const success = (await sql`SELECT last_success_at FROM geo_public_source_status WHERE source_id = ${source.id}`)[0].last_success_at.toISOString();
  assert.equal((await collectPublicSocial(source, { read })).status, "skipped");
  assert.equal((await sql`SELECT last_success_at FROM geo_public_source_status WHERE source_id = ${source.id}`)[0].last_success_at.toISOString(), success);
  assert.equal((await sql`SELECT count(*)::int AS count FROM geo_public_items WHERE source_id = ${source.id}`)[0].count, 2);
});

test("a failed public read stays visibly failed and does not publish or claim success", async () => {
  const failed = { ...source, id: "public-x-failed", seedUrls: ["https://x.com/researcher/status/22345"] };
  await reconcilePublicSources([], [source, failed]);
  const result = await collectPublicSocial(failed, { read: async () => { throw new Error("private-token-must-not-appear"); } });
  assert.equal(result.status, "error"); assert.equal(result.matched, 0); assert.ok(!result.error?.includes("private-token"));
  const [status] = await sql`SELECT status, last_success_at FROM geo_public_source_status WHERE source_id = ${failed.id}`;
  assert.equal(status.status, "error"); assert.equal(status.last_success_at, null);
  const [link] = await sql`SELECT last_attempt_at, last_success_at, error FROM geo_public_social_links WHERE source_id = ${failed.id}`;
  assert.ok(link.last_attempt_at); assert.equal(link.last_success_at, null); assert.ok(!link.error.includes("private-token"));
  let calls = 0;
  const read = async (url: string) => { calls++; return { url, title: "ChatGPT cites sources", publishedAt: new Date("2026-01-01T00:00:00Z") }; };
  assert.equal((await collectPublicSocial(failed, { read })).status, "error", "backoff retains the unresolved failure state");
  assert.equal(calls, 0, "failed posts are not hammered on every watch iteration");
  await sql`UPDATE geo_public_social_links SET last_attempt_at = now() - interval '61 minutes' WHERE source_id = ${failed.id}`;
  assert.equal((await collectPublicSocial(failed, { read })).matched, 1);
  assert.equal(calls, 1, "failures retry after one hour rather than the seven-day successful refresh");
  await sql`UPDATE geo_public_social_links SET last_attempt_at = now() - interval '61 minutes' WHERE source_id = ${failed.id}`;
  assert.equal((await collectPublicSocial(failed, { read })).status, "skipped");
  assert.equal(calls, 1, "successful posts retain the configured refresh interval");
});

test("successive watch rounds discover new posts", async () => {
  const dynamic = { ...source, id: "public-x-dynamic", seedUrls: [], discovery: [{ kind: "html" as const, url: "https://research.example/", maxArticlePages: 0 }] };
  await reconcilePublicSources([], [source, dynamic]);
  let iteration = 0;
  const discover = async () => ({ links: [{ url: `https://x.com/researcher/status/${iteration++ ? "32346" : "32345"}`, discoveredFrom: "https://research.example/post" }], articles: [] });
  const read = async (url: string) => ({ url, title: "AI search citation study", publishedAt: new Date("2026-01-01T00:00:00Z") });
  const first = await collectPublicSocial(dynamic, { discover, read });
  assert.equal(first.status, "ok"); assert.equal(first.matched, 1);
  const second = await collectPublicSocial(dynamic, { discover, read });
  assert.equal(second.status, "ok"); assert.equal(second.matched, 1);
  assert.equal((await sql`SELECT count(*)::int AS count FROM geo_public_items WHERE source_id = ${dynamic.id}`)[0].count, 2);
});

test("article queue survives index changes and outages, keeps the per-round cap, and caches successful checks", async () => {
  const entry = { kind: "rss" as const, url: "https://research.example/feed", articlePathPrefix: "/blog/", maxArticlePages: 1 };
  const dynamic = { ...source, id: "public-x-articles", seedUrls: [], discovery: [entry] };
  await reconcilePublicSources([], [dynamic]);
  const articleCalls: string[] = [];
  const readArticle = async (url: string) => {
    articleCalls.push(url);
    return [{ url: `https://x.com/researcher/status/4234${url.at(-1)}`, discoveredFrom: url }];
  };
  const read = async (url: string) => ({ url, title: "AI search citation study", publishedAt: new Date("2026-01-01T00:00:00Z") });
  const initial = { links: [], articles: ["1", "2", "3"].map(id => `https://research.example/blog/${id}`) };
  const first = await collectPublicSocial(dynamic, { discover: async () => initial, readArticle, read });
  assert.equal(first.matched, 1); assert.equal(articleCalls.length, 1);
  const summary = async () => (await sql`SELECT cursor FROM geo_public_source_status WHERE source_id = ${dynamic.id}`)[0].cursor.socialDiscovery;
  assert.equal((await summary()).articlesQueued, 3); assert.equal((await summary()).articlesPending, 2);
  const second = await collectPublicSocial(dynamic, { discover: async () => { throw new Error("index down"); }, readArticle, read });
  assert.equal(second.status, "partial"); assert.equal(second.matched, 1, "saved articles remain processable during an index outage");
  await collectPublicSocial(dynamic, { discover: async () => ({ links: [], articles: [] }), readArticle, read });
  assert.equal(new Set(articleCalls).size, 3, "an article removed from the latest feed remains queued");
  await collectPublicSocial(dynamic, { discover: async () => initial, readArticle, read });
  assert.equal(articleCalls.length, 3, "successfully checked articles are not fetched again every watch round");
  assert.equal((await summary()).articlesPending, 0);
  assert.equal((await summary()).postsDiscovered, 3);
  await sql`UPDATE geo_public_social_articles SET last_attempt_at = now() - interval '169 hours' WHERE source_id = ${dynamic.id} AND url = ${initial.articles[0]}`;
  await collectPublicSocial(dynamic, { discover: async () => initial, readArticle, read });
  assert.equal(articleCalls.length, 4, "published articles can gain new references and are periodically rechecked");
});

test("article failures preserve other results, remain visible through backoff, and retry after one hour", async () => {
  const entry = { kind: "html" as const, url: "https://research.example/", articleSelector: "a", articlePathPrefix: "/blog/", maxArticlePages: 2 };
  const dynamic = { ...source, id: "public-x-article-retry", seedUrls: [], discovery: [entry], maxPostsPerRun: 5 };
  await reconcilePublicSources([], [dynamic]);
  const good = "https://research.example/blog/1", bad = "https://research.example/blog/2";
  const discover = async () => ({ links: [], articles: [good, bad, "https://outside.example/blog/3"] });
  let fail = true, calls = 0;
  const readArticle = async (url: string) => { calls++; if (url === bad && fail) throw new Error("credential-must-not-leak"); return [{ url: `https://x.com/researcher/status/5234${url.at(-1)}`, discoveredFrom: url }]; };
  const read = async (url: string) => ({ url, title: "AI search citation study", publishedAt: new Date("2026-01-01T00:00:00Z") });
  const first = await collectPublicSocial(dynamic, { discover, readArticle, read });
  assert.equal(first.status, "partial"); assert.equal(first.matched, 1); assert.equal(calls, 2);
  const [failed] = await sql`SELECT error, last_success_at FROM geo_public_social_articles WHERE source_id = ${dynamic.id} AND url = ${bad}`;
  assert.ok(failed.error); assert.ok(!failed.error.includes("credential")); assert.equal(failed.last_success_at, null);
  assert.equal((await collectPublicSocial(dynamic, { discover, readArticle, read })).status, "partial");
  assert.equal(calls, 2, "the failed detail is not retried during its one-hour backoff");
  await sql`UPDATE geo_public_social_articles SET last_attempt_at = now() - interval '61 minutes' WHERE source_id = ${dynamic.id} AND url = ${bad}`;
  fail = false;
  const recovered = await collectPublicSocial(dynamic, { discover, readArticle, read });
  assert.equal(recovered.status, "ok"); assert.equal(recovered.matched, 1); assert.equal(calls, 3);
  const [status] = await sql`SELECT cursor FROM geo_public_source_status WHERE source_id = ${dynamic.id}`;
  assert.equal(status.cursor.socialDiscovery.articlesFailed, 0); assert.equal(status.cursor.socialDiscovery.articlesQueued, 2);
});
