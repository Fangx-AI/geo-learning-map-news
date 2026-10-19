import test, { after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { config } from "@aihot/backend/config";
import { fetchDetail } from "@aihot/backend/sources/web-list";
import { completePublicDates } from "../backend/public-dates.ts";
import { toPublicCandidates, type PublicSource } from "../backend/public-source.ts";

const now = Date.parse("2026-10-16T00:00:00Z");
const source: PublicSource = { id: "geo-date-test", name: "Research", kind: "web_list", config: { url: "https://research.example/news", detail: { publishedAtRegex: "发布时间：(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2})", publishedAtAuthoritative: true, publishedAtUtcOffset: "+08:00" } }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://research.example", languageHint: "en" };
const candidates = (count = 1) => toPublicCandidates(Array.from({ length: count }, (_, n) => ({ title: "AI search research", url: `https://research.example/article/${n}` })), source, now);
const noCache = async () => new Map<string, Date>();
const result = (date: Date | null) => ({ publishedAt: date, title: null, summary: null, body: null });

test("no authoritative rule, paid source, unsafe URL and unmatched candidates perform no I/O", async () => {
  const blocked = async () => { throw new Error("unexpected I/O"); };
  for (const config of [{ url: source.config.url }, { ...source.config, detail: { publishedAtRegex: "date=(.*)" } }, { ...source.config, url: "https://r.jina.ai/https://research.example" }, { ...source.config, url: "https://research.example/?token=secret" }]) {
    const got = await completePublicDates(candidates(), { ...source, config }, { loadCachedDates: blocked, readDetail: blocked });
    assert.equal(got.metadata.enabled, false);
    assert.equal(got.items.length, 1);
  }
  const badItems = [{ ...candidates()[0], url: "https://r.jina.ai/https://research.example" }, { ...candidates()[0], matchedTerms: [] }, { ...candidates()[0], sourceId: "different-source" }, { ...candidates()[0], url: "http://localhost/internal" }];
  assert.equal((await completePublicDates(badItems, source, { loadCachedDates: blocked, readDetail: blocked })).metadata.eligible, 0);
});

test("cached dates avoid requests; failures and future dates retain original items without leaking errors", async () => {
  const items = candidates(4);
  const inputSnapshot = JSON.stringify(items);
  const valid = new Date("2026-10-15T01:30:00Z");
  const got = await completePublicDates(items, source, { now, loadCachedDates: async (ids, sourceId) => { assert.equal(sourceId, source.id); assert.equal(ids.length, 4); return new Map([[items[0].id, valid]]); }, readDetail: async url => {
    if (url.endsWith("/0")) throw new Error("cached item fetched");
    if (url.endsWith("/1")) return result(new Date(now + 48 * 3600_000));
    if (url.endsWith("/2")) throw new Error("secret token in provider response");
    return result(valid);
  } });
  assert.deepEqual(got.metadata, { enabled: true, eligible: 4, cacheHits: 1, attempted: 3, completed: 2, failed: 2, deferred: 0, cacheFailed: false, lastAttemptedId: items[3].id });
  assert.equal(got.items.length, 4);
  assert.equal(got.items[1].publishedAt, null);
  assert.equal(got.items[2].publishedAt, null);
  assert.equal(JSON.stringify(items), inputSnapshot, "input remains unchanged");
  assert.ok(!JSON.stringify(got).includes("secret"));
});

test("date fetch budgets default to 8 and cap at 20; cached dates do not consume budget", async () => {
  const items = candidates(23);
  for (const [maxFetches, expected] of [[undefined, 8], [100, 20], [0, 0]] as const) {
    const got = await completePublicDates(items, { ...source, config: { ...source.config, detail: { ...source.config.detail, maxFetches } } }, { now, loadCachedDates: async () => new Map([[items[0].id, new Date(now)]]), readDetail: async () => result(new Date(now)) });
    assert.equal(got.metadata.attempted, expected);
    assert.equal(got.metadata.completed, expected + 1);
    assert.equal(got.metadata.deferred, 22 - expected);
    assert.equal(got.items.length, 23);
  }
});

test("cache and parsing failures are reported without discarding source content", async () => {
  const got = await completePublicDates(candidates(), source, { now, loadCachedDates: async () => { throw new Error("database unavailable"); }, readDetail: async () => result(null) });
  assert.equal(got.metadata.cacheFailed, true);
  assert.equal(got.metadata.failed, 1);
  assert.equal(got.items.length, 1);
  assert.equal(got.items[0].publishedAt, null);
});

test("failed early detail pages cannot starve later records across collection rounds", async () => {
  const items = candidates(6), calls: string[] = [];
  const limited = { ...source, config: { ...source.config, detail: { ...source.config.detail, maxFetches: 2 } } };
  const cache = new Map<string, Date>([[items[3].id, new Date(now)]]);
  const readDetail = async (url: string) => { calls.push(url); return result(null); };
  const first = await completePublicDates(items, limited, { now, loadCachedDates: async () => cache, readDetail });
  assert.deepEqual(calls, [items[0].url, items[1].url]);
  assert.equal(first.metadata.failed, 2); assert.equal(first.metadata.deferred, 3);
  const second = await completePublicDates(items, limited, { now, startAfterId: first.metadata.lastAttemptedId, loadCachedDates: async () => cache, readDetail });
  assert.deepEqual(calls.slice(2), [items[2].url, items[4].url], "rotation happens before cache filtering and the cached date costs no request");
  const third = await completePublicDates(items, limited, { now, startAfterId: second.metadata.lastAttemptedId, loadCachedDates: async () => cache, readDetail });
  assert.deepEqual(calls.slice(4), [items[5].url, items[0].url], "all eligible uncached records get a turn before retrying the first failure");
  assert.equal(third.metadata.lastAttemptedId, items[0].id);
});

const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  // A publication byline and unrelated metadata/update dates reproduce ordinary publisher HTML.
  res.end(`<html><head><meta property="article:published_time" content="2026-10-16T00:00:00Z"></head><body><time datetime="2026-10-16T00:00:00Z">更新时间</time>${req.url === "/with-date" ? "<div class=byline>发布时间：2026-10-15 09:30</div>" : ""}<main>AI search research content that must not be saved as body.</main></body></html>`);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const previousPrivate = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => { config.allowPrivateNetworkFetch = previousPrivate; await new Promise<void>(resolve => server.close(() => resolve())); });

test("ordinary HTML regex reads only the declared publication byline and never extracts body or falls back to update time", async () => {
  const fixtureRoot = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const [path, expected] of [["/with-date", "2026-10-15T01:30:00.000Z"], ["/without-date", null]] as const) {
    const got = await completePublicDates(candidates(), { ...source, config: { ...source.config, detail: { ...source.config.detail, publishedAtSelector: "time", summarySelector: "main" } } }, { now, loadCachedDates: noCache, readDetail: async (_url, configuredSource, need) => {
      assert.deepEqual(need, { date: true, title: false, summary: false, body: false });
      assert.equal(configuredSource.config.detail.publishedAtSelector, undefined);
      const read = await fetchDetail(fixtureRoot + path, configuredSource, need);
      assert.equal(read.body, null); assert.equal(read.summary, null); assert.equal(read.title, null);
      return read;
    } });
    assert.equal(got.items[0].publishedAt?.toISOString() ?? null, expected);
    assert.equal(got.items[0].summary, null);
    assert.equal(got.metadata.failed, expected ? 0 : 1);
  }
});
