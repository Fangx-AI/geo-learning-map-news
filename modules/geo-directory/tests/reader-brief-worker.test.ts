import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sql, closeDb } from "@aihot/backend/db";
import { loadGeoPublicItem } from "@aihot/backend/publication/geo-public";
import type { GuardedResponse } from "@aihot/backend/lib/http-fetch";
import { draftPublicReaderBriefs, extractReaderArticle, readerRetryAfter, ReaderArticleError, type ReaderBriefGenerator, type ReaderBriefDraft } from "../backend/reader-brief-worker.ts";
import { readerBriefInputHash } from "../backend/reader-brief.ts";
import { acquireCollectorLock } from "../backend/collector-runtime.ts";
import { briefClaims } from "../backend/reader-brief-model.ts";

after(closeDb);
beforeEach(async () => { process.env.PUBLIC_READER_BRIEFS_ENABLED = "true"; process.env.PUBLIC_READER_BRIEF_PUBLISH_ENABLED = "false"; await sql`DELETE FROM geo_public_items`; await sql`DELETE FROM geo_public_source_status`; });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function fixture(name: string, canonical = hash(name)) {
  const row = { id: hash(name), canonical_id: canonical, title: "AI search citation research", summary: "We tested 100 queries to study citations in AI search.",
    url: "https://research.example/study", source_id: name, source_name: "Research source", source_url: "https://research.example", language: "en" };
  await sql`INSERT INTO geo_public_source_status (source_id,source_name,source_url) VALUES (${row.source_id},${row.source_name},${row.source_url})`;
  await sql`INSERT INTO geo_public_items ${sql(row)}`;
  return row;
}
const html = (suffix = "") => `<html><head><title>AI search citation research</title><link rel="canonical" href="https://research.example/study"/></head><body><article><h1>AI search citation research</h1>${Array.from({ length: 6 }, (_, index) => `<p>In experiment ${index+1}, we tested 100 queries and recorded the cited source URLs across multiple AI search systems. This describes our sampling method and the scope of the findings. ${suffix}</p>`).join("")}</article></body></html>`;
function response(body = html(), overrides: Partial<GuardedResponse> = {}): GuardedResponse { return { status: 200, url: "https://research.example/study", headers: new Headers({ "content-type": "text/html" }), body: Buffer.from(body), text: () => body, ...overrides }; }
const claim = (text: string) => ({ text, evidenceIds: ["p1"] });
const draft = (): ReaderBriefDraft => ({ conclusion: claim("这项研究说明，AI 搜索引用需要按平台分别追踪。"), findings: [claim("研究以一百个查询为样本，记录了不同平台的引用来源。")], geoValue: [claim("实际监测时可以保留提示词和引用网址，比较不同平台的变化。")], caveats: [claim("样本范围有限，不能据此推断全部用户行为。")], model: "fake-local", promptVersion: "test-v1", inputTokens: 400 });
function generator(options: { max?: number; generate?: ReaderBriefGenerator["generate"] } = {}) {
  const counts = { created: 0, generated: 0, closed: 0 };
  const createModel = async (): Promise<ReaderBriefGenerator> => {
    counts.created++;
    return { model: "fake-local", maxInputChars: options.max ?? 100_000,
      generate: async (...args) => { counts.generated++; return options.generate ? options.generate(...args) : draft(); },
      close: async () => { counts.closed++; } };
  };
  return { createModel, counts };
}

test("disabled reader worker does not fetch, start a model or create jobs", async () => {
  await fixture("disabled"); process.env.PUBLIC_READER_BRIEFS_ENABLED = "false";
  const model = generator(); let fetches = 0;
  assert.equal((await draftPublicReaderBriefs({ ...model, fetcher: async () => { fetches++; return response(); } })).attempted, 0);
  assert.equal(fetches, 0); assert.equal(model.counts.created, 0);
  assert.equal((await sql`SELECT 1 FROM geo_public_reader_jobs`).length, 0);
});

test("a canonical article produces one private full-body draft and never a public brief", async () => {
  const row = await fixture("canonical-first"); await fixture("canonical-second", row.canonical_id);
  let fetches = 0; const model = generator();
  const options = { ...model, fetcher: async () => { fetches++; return response(); } };
  assert.equal((await draftPublicReaderBriefs(options)).drafted, 1);
  assert.equal((await draftPublicReaderBriefs(options)).attempted, 0);
  assert.equal(fetches, 1); assert.equal(model.counts.generated, 1); assert.equal(model.counts.closed, 1);
  const [job] = await sql`SELECT * FROM geo_public_reader_jobs`;
  assert.equal(job.status, "ready-draft"); assert.equal(job.input_hash, readerBriefInputHash(row));
  assert.ok(job.private_body.includes("experiment 6")); assert.ok(job.paragraphs.length > 5);
  const published = await loadGeoPublicItem(row.id);
  assert.equal(published?.brief, undefined); assert.ok(!JSON.stringify(published).includes("experiment 6"));
  assert.equal((await sql`SELECT 1 FROM geo_public_reader_briefs`).length, 0);
});

test("changing the source snapshot invalidates a draft and fetches the new complete body", async () => {
  const row = await fixture("changed"); let fetches = 0; const model = generator();
  const options = { ...model, fetcher: async () => response(html(`revision ${++fetches}`)) };
  await draftPublicReaderBriefs(options);
  const [before] = await sql`SELECT body_hash FROM geo_public_reader_jobs`;
  await sql`UPDATE geo_public_items SET summary='We tested 120 queries in AI search.' WHERE id=${row.id}`;
  assert.equal((await draftPublicReaderBriefs(options)).drafted, 1);
  const [after] = await sql`SELECT * FROM geo_public_reader_jobs`;
  assert.notEqual(after.body_hash, before.body_hash); assert.equal(fetches, 2); assert.equal(model.counts.generated, 2);
  assert.equal(after.input_hash, readerBriefInputHash({ ...row, summary: "We tested 120 queries in AI search." }));
});

test("a full article over the context budget is retained privately and never truncated for generation", async () => {
  await fixture("long"); const model = generator({ max: 500 });
  const result = await draftPublicReaderBriefs({ ...model, fetcher: async () => response() });
  assert.equal(result.failed, 1); assert.equal(model.counts.generated, 0); assert.equal(model.counts.closed, 1);
  const [job] = await sql`SELECT * FROM geo_public_reader_jobs`;
  assert.equal(job.error, "too_long"); assert.equal(job.draft, null); assert.ok(job.private_body.includes("experiment 6"));
  assert.ok(job.next_attempt_at.getTime() > Date.now()+6*24*60*60*1000);
});

test("429 retry-after is durable and prevents another request before the server deadline", async () => {
  await fixture("rate-limit"); await fixture("same-host-another-article"); let fetches = 0; const model = generator();
  const options = { ...model, fetcher: async () => { fetches++; return response("", { status: 429, headers: new Headers({ "retry-after": "21600" }) }); } };
  const started = Date.now(); assert.equal((await draftPublicReaderBriefs(options)).failed, 1);
  assert.equal((await draftPublicReaderBriefs(options)).attempted, 0);
  const [job] = await sql`SELECT * FROM geo_public_reader_jobs`;
  assert.equal(job.error, "http-429"); assert.ok(job.next_attempt_at.getTime() >= started+21600_000);
  assert.equal(fetches, 1); assert.equal(model.counts.generated, 0);
});

test("missing local assets halt the whole draft queue before downloading any article", async () => {
  await fixture("missing-assets-a"); await fixture("missing-assets-b"); let fetches = 0, factories = 0;
  const options = { createModel: async (): Promise<ReaderBriefGenerator> => { factories++; throw new ReaderArticleError("unavailable"); }, fetcher: async () => { fetches++; return response(); } };
  assert.equal((await draftPublicReaderBriefs(options)).failed, 1);
  assert.equal((await draftPublicReaderBriefs(options)).attempted, 0);
  assert.equal(fetches, 0); assert.equal(factories, 1);
  assert.equal((await sql`SELECT error FROM geo_public_reader_jobs`)[0].error, "unavailable");
});

test("a failed model retry uses the complete private body without re-fetching", async () => {
  await fixture("retry-body"); let fetches = 0;
  const broken = generator({ generate: async () => { throw new ReaderArticleError("invalid"); } });
  const fetcher = async () => { fetches++; return response(); };
  assert.equal((await draftPublicReaderBriefs({ ...broken, fetcher })).failed, 1);
  await sql`UPDATE geo_public_reader_jobs SET next_attempt_at=now()`;
  const repaired = generator();
  assert.equal((await draftPublicReaderBriefs({ ...repaired, fetcher })).drafted, 1);
  assert.equal(fetches, 1); assert.equal(repaired.counts.generated, 1);
});

test("a private body cached by an older extractor is re-read instead of reused", async () => {
  await fixture("retry-old-extractor"); let fetches = 0;
  const fetcher = async () => { fetches++; return response(); };
  assert.equal((await draftPublicReaderBriefs({ ...generator({ generate: async () => { throw new ReaderArticleError("invalid"); } }), fetcher })).failed, 1);
  await sql`UPDATE geo_public_reader_jobs SET next_attempt_at=now(),body_hash=encode(sha256(convert_to(private_body,'UTF8')),'hex')`;
  assert.equal((await draftPublicReaderBriefs({ ...generator(), fetcher })).drafted, 1);
  assert.equal(fetches, 2);
});

test("losing the reader lease cancels generation and releases the owned model", async () => {
  await fixture("lease-loss");
  const model = generator({ generate: async (_input, signal) => {
    const [{ name }] = await sql<{ name: string }[]>`SELECT current_database() AS name`;
    assert.match(name, /_(?:test|ci)$/);
    const locks = await sql<{ pid: number }[]>`SELECT l.pid FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database()
      AND l.locktype='advisory' AND l.granted AND l.classid=hashtext('geo-public-collector')::oid AND l.objid=hashtext('reader-brief')::oid AND l.objsubid=2`;
    assert.equal(locks.length, 1);
    const cancelled = new Promise<void>(resolve => { if (signal?.aborted) resolve(); else signal?.addEventListener("abort", () => resolve(), { once: true }); });
    await sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid=${locks[0].pid} AND datname=current_database()`;
    await cancelled; signal?.throwIfAborted(); return draft();
  } });
  const result = await draftPublicReaderBriefs({ ...model, fetcher: async () => response() });
  assert.equal(result.drafted, 0); assert.equal(model.counts.closed, 1);
  assert.equal((await sql`SELECT draft FROM geo_public_reader_jobs`)[0].draft, null);
  const release = await acquireCollectorLock("reader-brief"); await release();
});

test("model shutdown errors cannot retain the reader lease", async () => {
  await fixture("close-error"); const model = generator();
  await assert.rejects(draftPublicReaderBriefs({ createModel: async () => ({ ...await model.createModel(), close: async () => { throw new Error("shutdown failed"); } }), fetcher: async () => response() }), /shutdown failed/);
  const release = await acquireCollectorLock("reader-brief"); await release();
});

test("disabled or changed input during extraction cannot start a model", async () => {
  const row = await fixture("disabled-during-fetch"); const model = generator();
  const result = await draftPublicReaderBriefs({ ...model, fetcher: async () => { await sql`UPDATE geo_public_source_status SET enabled=false WHERE source_id=${row.source_id}`; return response(); } });
  assert.equal(result.stale, 1); assert.equal(model.counts.generated, 0);
  assert.equal((await sql`SELECT draft FROM geo_public_reader_jobs`)[0].draft, null);
});

test("changed input while generation is running cannot overwrite the next source version", async () => {
  const row = await fixture("changed-during-generation");
  const model = generator({ generate: async () => { await sql`UPDATE geo_public_items SET summary='A changed source excerpt.' WHERE id=${row.id}`; return draft(); } });
  assert.equal((await draftPublicReaderBriefs({ ...model, fetcher: async () => response() })).stale, 1);
  assert.equal((await sql`SELECT draft FROM geo_public_reader_jobs`)[0].draft, null); assert.equal(model.counts.closed, 1);
});

test("article extraction rejects identity mismatches, non-HTML and restricted pages", () => {
  for (const reply of [response(html(), { url: "https://research.example/other" }), response(html().replace('href="https://research.example/study"', 'href="https://research.example/other"')), response(html(), { headers: new Headers({ "content-type": "application/pdf" }) }), response(html().replace("<h1>", "<p>Subscribe to read the full article.</p><h1>")), response(html().replace("<title>AI search citation research</title>", "<title>Just a moment</title>"))]) assert.throws(() => extractReaderArticle("https://research.example/study", reply));
  assert.equal(readerRetryAfter("120", 0), 120_000);
  assert.equal(readerRetryAfter("Thu, 01 Jan 1970 00:02:00 GMT", 0), 120_000);
  assert.equal(readerRetryAfter("invalid", 0), undefined);
  assert.throws(() => extractReaderArticle("https://arxiv.org/abs/2306.00001", response()), /unsupported-abstract/);
});

const approval = (value: ReaderBriefDraft, complete = true) => ({ checks: briefClaims(value).map(claim => ({ id: claim.id, reason: "内容与对应段落的证据一致", supported: true })), complete, issues: [] });

test("automatic publication requires a complete successful review and exposes only a short labeled brief", async () => {
  const row = await fixture("auto-publish"); process.env.PUBLIC_READER_BRIEF_PUBLISH_ENABLED = "true";
  const model = generator();
  const result = await draftPublicReaderBriefs({ fetcher: async () => response(), createModel: async () => ({ ...await model.createModel(), review: async (_input, value) => approval(value) }) });
  assert.equal(result.published, 1);
  const item = await loadGeoPublicItem(row.id);
  assert.equal(item?.brief?.automated, true); assert.equal(item?.brief?.conclusion, draft().conclusion.text);
  assert.ok(!JSON.stringify(item).includes("evidenceIds")); assert.ok(!JSON.stringify(item).includes("experiment 6"));
  const [saved] = await sql`SELECT provenance,body_hash,evidence FROM geo_public_reader_briefs`;
  assert.equal(saved.provenance, "local-model"); assert.ok(saved.body_hash); assert.equal(saved.evidence.review.complete, true);
});

test("rejected, missing and malformed semantic reviews cannot publish", async () => {
  for (const kind of ["missing", "rejected", "malformed"]) {
    await sql`DELETE FROM geo_public_items`; await fixture(`auto-${kind}`); process.env.PUBLIC_READER_BRIEF_PUBLISH_ENABLED = "true";
    const model = generator();
    const result = await draftPublicReaderBriefs({ fetcher: async () => response(), createModel: async () => ({ ...await model.createModel(),
      ...(kind === "missing" ? {} : { review: async (_input: unknown, value: ReaderBriefDraft) => kind === "malformed" ? { ...approval(value), checks: [] } : approval(value, false) }) }) });
    assert.equal(result.published, 0); assert.equal((await sql`SELECT 1 FROM geo_public_reader_briefs`).length, 0);
  }
});

test("a rejected draft gets one repair and must pass a new complete review", async () => {
  await fixture("repair"); process.env.PUBLIC_READER_BRIEF_PUBLISH_ENABLED = "true";
  const model = generator(); let reviews = 0, repairs = 0;
  const result = await draftPublicReaderBriefs({ fetcher: async () => response(), createModel: async () => ({ ...await model.createModel(),
    review: async (_input, value) => approval(value, ++reviews > 1), repair: async (_input, value, issues) => { repairs++; assert.ok(issues.length); return value; } }) });
  assert.equal(result.published, 1); assert.equal(reviews, 2); assert.equal(repairs, 1);
});

test("a source change during semantic review cannot publish stale content", async () => {
  const row = await fixture("review-race"); process.env.PUBLIC_READER_BRIEF_PUBLISH_ENABLED = "true"; const model = generator();
  const result = await draftPublicReaderBriefs({ fetcher: async () => response(), createModel: async () => ({ ...await model.createModel(),
    review: async (_input, value) => { await sql`UPDATE geo_public_items SET title='Revised research' WHERE id=${row.id}`; return approval(value); } }) });
  assert.equal(result.stale, 1); assert.equal(result.published, 0); assert.equal((await sql`SELECT 1 FROM geo_public_reader_briefs`).length, 0);
});

test("failed repair preserves the rejected review privately for diagnosis", async () => {
  await fixture("repair-error"); process.env.PUBLIC_READER_BRIEF_PUBLISH_ENABLED = "true";
  const model = generator();
  const result = await draftPublicReaderBriefs({ fetcher: async () => response(), createModel: async () => ({ ...await model.createModel(),
    review: async (_input, value) => approval(value, false), repair: async () => { throw new Error("Invalid repair"); } }) });
  assert.equal(result.published, 0);
  const [job] = await sql`SELECT draft FROM geo_public_reader_jobs`;
  assert.equal(job.draft.review.complete, false);
  assert.ok(job.draft.review.checks.length > 0);
  assert.equal((await sql`SELECT 1 FROM geo_public_reader_briefs`).length, 0);
});
