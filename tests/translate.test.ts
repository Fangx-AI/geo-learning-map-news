// Full-text translations follow the text: an article corrected while the model was translating the old
// wording is translated again, and a translation of an older revision is never shown as the current one.
// Links and images inside a paragraph survive the model, and the post an X item quotes is translated.
import { gate, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { translateArticle, translatePending } from "@aihot/backend/editorial/translate";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `test-translate-${T}`;
const URL_ = `https://example.com/translate-${T}`;

// The model: one Chinese sentence per segment. `hold` keeps an answer back while the test revises the text.
let hold: ReturnType<typeof gate<void>> | null = null;
const asked = gate();
const asks = new Map<string, number>();
// Return a schema-valid response with the wrong segment count for selected inputs.
const misalignedAnswers = new Map<string, number>();
const provider = await stub(async (_hit, req) => {
  const { segments } = JSON.parse(JSON.parse(req.body).messages[1].content) as { segments: string[] };
  if (hold) {
    asked.open();
    await hold.promise;
  }
  const bad = [...misalignedAnswers.entries()].find(([marker, remaining]) => remaining > 0 && segments.some((s) => s.includes(marker)));
  if (bad) {
    misalignedAnswers.set(bad[0], bad[1] - 1);
    return { id: "stub-bad-alignment", choices: [{ message: { content: '{"t":[]}' } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
  }
  const t = segments.map((s) => {
    // A block with a link and an image: the first answer drops the link, the second keeps everything.
    if (s.includes("Neuroglancer")) {
      const n = (asks.get(s) ?? 0) + 1;
      asks.set(s, n);
      return n === 1 ? "解释 Neuroglancer 的文字 ⟦0⟧。" : '解释 <a id="L0">Neuroglancer</a> 的文字 ⟦0⟧。';
    }
    if (s.includes("never keeps")) return "丢了链接。";
    if (s.includes("Introducing")) return "隆重推出 Sonnet 5.5。";
    return s.includes("twenty") ? "价格是二十美元。" : s.includes("ten") ? "价格是十美元。" : "译文";
  });
  return { id: "stub", choices: [{ message: { content: JSON.stringify({ t }) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
});
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";
const app = await buildApp();

// Discovered "later" than anything else in the test database, so a one-item run takes this article. The
// tag keeps the text unique: identical input would reuse an earlier run's paid answer.
const material = (price: string) =>
  upsertMaterial({
    sourceId: SOURCE, url: URL_, title: `Price update ${T}`, language: "en", bodyText: `The price is ${price} dollars (${T}).`,
    bodyHtml: `<p>The price is ${price} dollars (${T}).</p>`, bodyStatus: "ok", via: "fetch", publishedAt: new Date(), discoveredAt: new Date(Date.now() + 600_000),
  });

async function detail(id: string) {
  const res = await app.inject({ method: "GET", url: `/api/site/items/${id}` });
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body) as { body: { zh: string | null; original: string | null; complete: boolean } };
}

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, syndicate_fulltext, next_fetch_at)
            VALUES (${SOURCE}, 'Test translate', 'rss', 'T1', 'editorial', true, false, '2100-01-01')`;
});
after(async () => {
  await app.close();
  await provider.close();
  await stopBoss();
  await closeDb();
});

test("a text corrected while its translation was running is translated again, and the old translation is not shown", async () => {
  const { articleId: id } = await material("ten");
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'platform-updates', ${`价格更新-${T}`}, '摘要', '理由', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });

  // The model is asked about revision 1; the source corrects the price before it answers.
  hold = gate();
  const running = translatePending({ limit: 1 });
  await Promise.race([asked.promise, running.then(() => assert.fail("the run ended without asking the model"))]);
  const revised = await material("twenty");
  assert.equal(revised.revised, true);
  hold.open();
  hold = null;
  await running;

  const [attempt] = await sql<{ revision: number; outcome: string }[]>`SELECT revision, outcome FROM translation_attempts WHERE article_id = ${id}`;
  assert.deepEqual({ ...attempt }, { revision: 1, outcome: "translated" }, "the attempt is booked on the revision translated");
  const stale = await detail(id);
  assert.equal(stale.body.zh, null, "a translation of the old wording is not shown");
  assert.ok(stale.body.original?.includes("twenty"));

  // The corrected material waits for its own analysis and identity decision before another paid
  // translation. Install that completed current-revision fixture, as the processing chain does.
  assert.equal((await sql`SELECT selected FROM publications WHERE article_id=${id}`)[0]!.selected, false);
  await sql`UPDATE analyses SET input_revision=2 WHERE article_id=${id}`;
  await sql`UPDATE articles SET processing_state='analyzed',grouping_status='complete',grouped_at=now() WHERE id=${id}`;
  await publishArticle(id);
  await translatePending({ limit: 1 });
  const [tr] = await sql<{ revision: number }[]>`SELECT revision FROM translations WHERE article_id = ${id}`;
  assert.equal(tr?.revision, 2, "the corrected text is translated on the next run");
  const current = await detail(id);
  assert.ok(current.body.zh?.includes("二十美元") && current.body.complete, "the page shows the translation of the corrected text");
});

test("links and images inside a paragraph survive the translation, or the paragraph stays in the original", async () => {
  // Google's fly-brain post lost its link to the Neuroglancer docs; a GPU price post lost two charts.
  const html = `<p>Explaining <a href="https://neuroglancer.dev/docs">Neuroglancer</a> in text ${T} <img src="https://example.com/chart-${T}.png" alt="B200 prices"></p>` +
    `<p>A paragraph the model <a href="https://example.com/kept">never keeps</a> whole ${T}.</p>`;
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `${URL_}-links`, title: `Links ${T}`, language: "en", bodyText: `Explaining Neuroglancer. ${T}`, bodyHtml: html,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(), discoveredAt: new Date(Date.now() + 1_200_000),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'platform-updates', ${`链接-${T}`}, '摘要', '理由', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  await translatePending({ limit: 1 });
  const [tr] = await sql<{ body_html: string; complete: boolean }[]>`SELECT body_html, complete FROM translations WHERE article_id = ${id}`;
  assert.ok(tr!.body_html.includes('<a href="https://neuroglancer.dev/docs">Neuroglancer</a>'), tr!.body_html);
  assert.ok(tr!.body_html.includes(`chart-${T}.png`), "the chart stays");
  assert.ok(tr!.body_html.includes('<a href="https://example.com/kept">never keeps</a>'), "a paragraph that loses its link stays in the original");
  assert.equal(tr!.complete, false);
  const receipts = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'translate_body' AND subject LIKE ${`article:${id}@1#%`}`;
  assert.ok(receipts.length >= 2, "the initial batch and fallback/retry batches are retained");
  assert.ok(receipts.every((receipt) => receipt.status === "completed"), "every paid batch covered by the committed translation is completed");
});

test("translation storage and receipt completion commit together, then reuse the saved answer", async () => {
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `${URL_}-receipt`, title: `Receipt ${T}`, language: "en",
    bodyText: `Receipt lifecycle ${T}.`, bodyHtml: `<p>Receipt lifecycle ${T}.</p>`,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(), discoveredAt: new Date(Date.now() + 1_500_000),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'platform-updates', ${`回执-${T}`}, '摘要', '理由', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });

  await sql.unsafe(`CREATE FUNCTION fail_translation_receipt() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN
    IF NEW.status = 'completed' AND NEW.purpose = 'translate_body' THEN RAISE EXCEPTION 'receipt commit interrupted'; END IF;
    RETURN NEW; END $body$`);
  await sql`CREATE TRIGGER fail_translation_receipt BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION fail_translation_receipt()`;
  const before = provider.hits();
  try {
    await assert.rejects(translateArticle(id), /receipt commit interrupted/);
  } finally {
    await sql`DROP TRIGGER fail_translation_receipt ON receipts`;
    await sql`DROP FUNCTION fail_translation_receipt()`;
  }
  assert.equal(provider.hits(), before + 1);
  assert.equal((await sql`SELECT 1 FROM translations WHERE article_id = ${id}`).length, 0, "translation write rolls back with receipt completion");
  const [received] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'translate_body' AND subject = ${`article:${id}@1#0`}`;
  assert.equal(received!.status, "received");

  const retried = await translateArticle(id);
  assert.equal(retried.status, "translated");
  assert.equal(provider.hits(), before + 1, "retry reuses the already received provider answer");
  const [completed] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'translate_body' AND subject = ${`article:${id}@1#0`}`;
  assert.equal(completed!.status, "completed");
  assert.equal((await sql`SELECT 1 FROM translations WHERE article_id = ${id}`).length, 1);
});

test("the post a selected X post quotes is translated once and shown with the item", async () => {
  const tweetId = `7${Date.now()}`;
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `https://x.com/bcherny/status/8${Date.now()}`, title: `Sonnet ${T}`, language: "en", bodyText: "Try it!", bodyStatus: "ok",
    via: "fetch", publishedAt: new Date(), discoveredAt: new Date(Date.now() + 1_800_000),
    xPost: { tweetId: `8${Date.now()}`, authorName: "Boris", handle: "bcherny", text: "Try it!", quoted: { authorName: "Anthropic", handle: "AnthropicAI", text: `Introducing Claude Sonnet 5.5 ${T}`, url: `https://x.com/AnthropicAI/status/${tweetId}` } },
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'platform-updates', ${`引用-${T}`}, '摘要', '理由', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  const run = await translatePending({ limit: 1 });
  assert.ok(run.quotes >= 1);
  const [q] = await sql<{ text_zh: string; origin: string }[]>`SELECT text_zh, origin FROM quote_translations WHERE tweet_id = ${tweetId}`;
  assert.deepEqual({ ...q }, { text_zh: "隆重推出 Sonnet 5.5。", origin: "model" });
  const res = await app.inject({ method: "GET", url: `/api/site/items/${id}` });
  const item = JSON.parse(res.body) as { x: { quoted: { text: string; translation: string | null } } };
  assert.deepEqual([item.x.quoted.text, item.x.quoted.translation], [`Introducing Claude Sonnet 5.5 ${T}`, "隆重推出 Sonnet 5.5。"]);
  await translatePending({ limit: 1 });
  const receipts = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'translate_quoted' AND subject = ${`quote:${tweetId}`}`;
  assert.equal(receipts.length, 1, "translated once");
  assert.equal(receipts[0]!.status, "completed");
});


test("an unusable X translation gets a bounded fresh attempt instead of terminal skipped", async () => {
  const marker = `alignment-x-${T}`;
  const text = `A new model release with practical improvements and detailed availability notes ${marker}. This post explains the new behavior and user-visible changes.`;
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `https://x.com/example/status/9${Date.now()}`, title: `Alignment X ${T}`, language: "en",
    bodyText: text, bodyStatus: "ok", via: "fetch", publishedAt: new Date(), discoveredAt: new Date(Date.now() + 3_600_000),
    xPost: { tweetId: `9${Date.now()}`, authorName: "Test", handle: "example", text },
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'platform-updates', ${`校验-X-${T}`}, '摘要', '理由', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  misalignedAnswers.set(marker, 1);
  const before = provider.hits();
  const first = await translatePending({ limit: 1 });
  assert.equal(first.done.find((r) => r.articleId === id)?.status, "failed");
  const [failed] = await sql<{ attempts: number; outcome: string; reason: string }[]>`SELECT attempts, outcome, reason FROM translation_attempts WHERE article_id = ${id}`;
  assert.deepEqual({ ...failed }, { attempts: 1, outcome: "failed", reason: "translation did not line up" });
  assert.equal(provider.hits() - before, 1, "the failed model answer was saved once");

  const second = await translatePending({ limit: 1 });
  assert.equal(second.done.find((r) => r.articleId === id)?.status, "translated");
  assert.equal(provider.hits() - before, 2, "the second attempt paid for a new answer");
  const [attempt] = await sql<{ attempts: number; outcome: string }[]>`SELECT attempts, outcome FROM translation_attempts WHERE article_id = ${id}`;
  assert.deepEqual({ ...attempt }, { attempts: 2, outcome: "translated" });
  const receipts = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'translate_body' AND subject LIKE ${`article:${id}@1#%`} ORDER BY id`;
  assert.deepEqual(receipts.map((r) => r.status), ["received", "completed"], "a failed business result cannot complete the first receipt");
  assert.equal((await detail(id)).body.complete, true);
});

test("fully unusable body translations stop after three recorded attempts", async () => {
  const marker = `alignment-body-${T}`;
  const text = `One complete English paragraph ${marker} that requires a Chinese translation.`;
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `${URL_}-alignment`, title: `Alignment body ${T}`, language: "en",
    bodyText: text, bodyHtml: `<p>${text}</p>`, bodyStatus: "ok", via: "fetch",
    publishedAt: new Date(), discoveredAt: new Date(Date.now() + 7_200_000),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'platform-updates', ${`校验正文-${T}`}, '摘要', '理由', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  misalignedAnswers.set(marker, 10);
  const before = provider.hits();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const run = await translatePending({ limit: 1 });
    assert.equal(run.done.find((r) => r.articleId === id)?.status, "failed");
    const [saved] = await sql<{ attempts: number; outcome: string }[]>`SELECT attempts, outcome FROM translation_attempts WHERE article_id = ${id}`;
    assert.deepEqual({ ...saved }, { attempts: attempt, outcome: "failed" });
  }
  assert.equal(provider.hits() - before, 6, "one initial batch and one fallback per bounded attempt");
  const exhausted = await translatePending({ limit: 1 });
  assert.equal(exhausted.done.some((r) => r.articleId === id), false, "the fourth automatic attempt is blocked");
  assert.equal(provider.hits() - before, 6);
  assert.equal((await sql`SELECT 1 FROM translations WHERE article_id = ${id}`).length, 0, "no invalid translation is published");
});

test("a received alignment retry survives a failed translation commit without paying again", async () => {
  const marker = `alignment-recovery-${T}`;
  const post = `This detailed English announcement ${marker} describes a new public release and its availability. The main changes are supported by documented examples and clear usage notes.`;
  const tweetId = `9${Date.now()}`;
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `https://x.com/example/status/${tweetId}`, title: `Recovery ${T}`, language: "en",
    bodyText: post, bodyStatus: "ok", via: "fetch", publishedAt: new Date(), discoveredAt: new Date(Date.now() + 10_800_000),
    xPost: { tweetId, authorName: "Test", handle: "example", text: post },
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'platform-updates', ${`恢复测试-${T}`}, '摘要', '理由', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  misalignedAnswers.set(marker, 1);
  const before = provider.hits();
  const first = await translatePending({ limit: 1 });
  assert.equal(first.done.find((r) => r.articleId === id)?.status, "failed");
  const [one] = await sql<{ attempts: number; outcome: string; request_tag: string | null }[]>`
    SELECT attempts, outcome, request_tag FROM translation_attempts WHERE article_id = ${id}`;
  assert.deepEqual({ ...one }, { attempts: 1, outcome: "failed", request_tag: null });

  await sql.unsafe(`CREATE FUNCTION fail_translation_receipt() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN
    IF NEW.status = 'completed' AND NEW.purpose = 'translate_body' THEN RAISE EXCEPTION 'receipt commit interrupted'; END IF;
    RETURN NEW; END $body$`);
  await sql`CREATE TRIGGER fail_translation_receipt BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION fail_translation_receipt()`;
  try {
    const second = await translatePending({ limit: 1 });
    assert.equal(second.done.some((r) => r.articleId === id), true, "the paid response arrived before the storage failure");
    const [failed] = await sql<{ attempts: number; outcome: string; reason: string; request_tag: string | null }[]>`
      SELECT attempts, outcome, reason, request_tag FROM translation_attempts WHERE article_id = ${id}`;
    assert.equal(failed!.attempts, 2);
    assert.equal(failed!.outcome, "failed");
    assert.match(failed!.reason, /receipt commit interrupted/);
    assert.equal(failed!.request_tag, "alignment-retry-1", "the used request identity survives a changed failure reason");
    const [answer] = await sql<{ status: string }[]>`
      SELECT status FROM receipts WHERE purpose = 'translate_body' AND subject = ${`article:${id}@1#0`} ORDER BY id DESC LIMIT 1`;
    assert.equal(answer!.status, "received", "the valid paid answer is saved even though the business write rolled back");
    assert.equal(provider.hits() - before, 2);
    assert.equal((await sql`SELECT 1 FROM translations WHERE article_id = ${id}`).length, 0);
  } finally {
    await sql`DROP TRIGGER fail_translation_receipt ON receipts`;
    await sql`DROP FUNCTION fail_translation_receipt()`;
  }

  const recovered = await translatePending({ limit: 1 });
  assert.equal(recovered.done.find((r) => r.articleId === id)?.status, "translated");
  assert.equal(provider.hits() - before, 2, "recovery reuses the second already paid answer");
  const [attempt] = await sql<{ attempts: number; outcome: string; request_tag: string | null }[]>`
    SELECT attempts, outcome, request_tag FROM translation_attempts WHERE article_id = ${id}`;
  assert.deepEqual({ ...attempt }, { attempts: 3, outcome: "translated", request_tag: "alignment-retry-1" });
  assert.equal((await detail(id)).body.complete, true);
});
