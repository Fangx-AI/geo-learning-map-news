import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertSupportedConfig } from "../../../packages/backend/src/sources/config-keys.ts";
import { ingestEndpoint, originalUrl, parseInput, prepareImport, publicationDate, sendImport, type Platform } from "../scripts/social-ingest.ts";

const sample = { platform: "reddit", title: "GEO 测量实验", url: "https://www.reddit.com/r/SEO/comments/abc123/geo_measurement/", publishedAt: "2026-10-16T08:30:00+08:00", author: "researcher" };

test("JSON/JSONL parse without executing CLI; calendar validation preserves timezone and unknown dates", () => {
  assert.equal(parseInput(JSON.stringify({ schemaVersion: 1, items: [sample] }), "json").length, 1);
  assert.equal(parseInput(`\uFEFF${JSON.stringify(sample)}\n\n${JSON.stringify(sample)}\n`, "jsonl").length, 2);
  assert.throws(() => parseInput('{"secret":"do-not-echo"}', "json"), error => error instanceof Error && !error.message.includes("do-not-echo"));
  assert.equal(publicationDate(sample.publishedAt), "2026-10-16T00:30:00.000Z");
  assert.equal(publicationDate(null), null);
  for (const invalid of [undefined, "2026-10-16", "2026-10-16T08:30:00", "2026-02-30T08:30:00Z", "2025-02-29T08:30:00Z", "2026-10-16T24:00:00Z", "2026-10-16T08:30:60Z"]) assert.throws(() => publicationDate(invalid));
  assert.equal(publicationDate("2024-02-29T23:59:59.5Z"), "2024-02-29T23:59:59.500Z");
});

test("content URLs match their platforms; reject profiles, lookalike hosts, redirects and credentials", () => {
  const urls: Record<Platform, string> = {
    x: "https://x.com/researcher/status/12345678", reddit: sample.url,
    youtube: "https://www.youtube.com/watch?v=abcdefghijk", linkedin: "https://www.linkedin.com/posts/researcher_geo-study-123",
    bluesky: "https://bsky.app/profile/researcher.bsky.social/post/3abc123",
    mastodon: "https://mastodon.social/@researcher/123456789", wechat: "https://mp.weixin.qq.com/s/public-article",
    zhihu: "https://zhuanlan.zhihu.com/p/123456", xiaohongshu: "https://www.xiaohongshu.com/explore/abc123",
    weibo: "https://weibo.com/1234567890/Abc123Def", bilibili: "https://www.bilibili.com/video/BV1abc123def",
    douyin: "https://www.douyin.com/video/12345678", juejin: "https://juejin.cn/post/123456789",
    csdn: "https://blog.csdn.net/researcher/article/details/123456", v2ex: "https://www.v2ex.com/t/123456",
  };
  for (const [platform, url] of Object.entries(urls)) assert.equal(originalUrl(url, platform as Platform), url);
  assert.equal(originalUrl(`${sample.url}?utm_source=test#comment`, "reddit"), sample.url);
  for (const url of ["https://reddit.com.evil.invalid/r/SEO/comments/abc123/", "https://user:password@reddit.com/r/SEO/comments/abc123/", "https://reddit.com/r/SEO/", "https://redd.it/abc123", `${sample.url}?access_token=secret`, "http://www.reddit.com/r/SEO/comments/abc123/"]) assert.throws(() => originalUrl(url, "reddit"));
  assert.throws(() => originalUrl("https://127.0.0.1/@a/123", "mastodon"));
  assert.throws(() => originalUrl("https://weibo.com/username", "weibo"));
  assert.throws(() => originalUrl("https://x.com/researcher", "x"));
});

test("validate all records, deduplicate canonical URLs, preserve provenance, backfill and API batch cap", () => {
  const records = Array.from({ length: 51 }, (_, i) => ({ ...sample, url: `https://www.reddit.com/r/SEO/comments/abc${i}/test/` }));
  const plan = prepareImport([...records, { ...records[0], url: `${records[0].url}?utm_source=feed` }, { ...sample, publishedAt: null }], true);
  assert.deepEqual(plan.batches.map(b => b.items.length), [50, 2]);
  assert.equal(plan.duplicates, 1);
  assert.equal(plan.unknownDates, 1);
  assert.equal(plan.batches[0].sourceId, "geo-social-reddit");
  assert.equal(plan.batches[0].items[0].raw._geo.platform, "reddit");
  assert.equal(plan.batches[0].items[0].raw._aihot?.backfill, true);
  assert.throws(() => prepareImport([sample, { ...sample, publishedAt: "bad" }]), /第 2 条/);
  assert.throws(() => prepareImport([{ ...sample, bodyText: "unsupported" }]), /只包含/);
  assert.throws(() => prepareImport([{ ...sample, sourceId: "UPPER_CASE" }]), /sourceId/);
  assert.throws(() => prepareImport([sample, { ...sample, url: `${sample.url}second/`, sourceName: "different" }]), /必须一致/);
  assert.throws(() => prepareImport([{ ...sample, backfill: "false" }]), /布尔/);
});

test("send only to the configured ingestion API, no redirects, rate paced and no secret echoed on errors", async () => {
  const token = "local-test-ingestion-token";
  const plan = prepareImport(Array.from({ length: 51 }, (_, i) => ({ ...sample, url: `https://reddit.com/r/SEO/comments/post${i}/test/` })));
  const calls: string[] = [], waits: number[] = [];
  const created = await sendImport(plan, {
    base: "http://127.0.0.1:3001", token, wait: async ms => { waits.push(ms); },
    fetcher: (async (url, init) => {
      calls.push(String(url));
      assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "manual");
      assert.equal((init?.headers as Record<string, string>).authorization, `Bearer ${token}`);
      const body = JSON.parse(String(init?.body));
      assert.ok(body.items.length <= 50);
      return Response.json({ ok: true, created: body.items.length });
    }) as typeof fetch,
  });
  assert.equal(created, 51); assert.deepEqual(waits, [6100]);
  assert.deepEqual(calls, Array(2).fill("http://127.0.0.1:3001/api/ingest/items"));
  await assert.rejects(sendImport(plan, { base: "https://geo.example", token, fetcher: (async () => new Response(token, { status: 429, headers: { "retry-after": "60" } })) as typeof fetch }), error => error instanceof Error && /429/.test(error.message) && !error.message.includes(token));
  await assert.rejects(sendImport(plan, { base: "https://geo.example", token, fetcher: (async () => new Response(null, { status: 307, headers: { location: "https://other.example" } })) as typeof fetch }), /307/);
  for (const base of ["http://remote.example", "https://user:pass@geo.example", "https://geo.example/path", "https://geo.example?token=secret"]) assert.throws(() => ingestEndpoint(base));
});

test("CLI defaults to dry-run without a token or network; --send still requires INGEST_TOKEN", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "geo-social-test-"));
  try {
    const file = path.join(dir, "items.jsonl"); writeFileSync(file, JSON.stringify(sample));
    const script = new URL("../scripts/social-ingest.ts", import.meta.url);
    const run = (extra: string[]) => spawnSync(process.execPath, [fileURLToPath(script), "--file", file, "--api-base", "http://127.0.0.1:1", ...extra], { encoding: "utf8", env: { ...process.env, INGEST_TOKEN: "" } });
    const dry = run([]);
    assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /DRY RUN/);
    const sent = run(["--send"]);
    assert.equal(sent.status, 1); assert.match(sent.stderr, /INGEST_TOKEN/);
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    assert.ok(path.basename(dir).startsWith("geo-social-test-"));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("social source templates only use supported configs, remain disabled and do not contain secrets", () => {
  const pack = JSON.parse(readFileSync(new URL("../../../industry/social-sources.json", import.meta.url), "utf8"));
  const ids = new Set<string>();
  for (const source of pack.sources) {
    assert.equal(source.enabled, false); assert.equal(source.site_fulltext, false); assert.equal(source.syndicate_fulltext, false);
    assert.ok(!ids.has(source.id)); ids.add(source.id);
    assertSupportedConfig(source.kind, source.config);
    if (source.kind === "x_search") { assert.equal(source.config.searchType, "Latest"); assert.ok(source.config.query.length < 470); }
    assert.ok(!/api_key|access_token|authorization|ghid/i.test(JSON.stringify(source.config)));
  }
  assert.ok(pack.sources.filter((s: { kind: string }) => s.kind === "x_search").length >= 12);
});
