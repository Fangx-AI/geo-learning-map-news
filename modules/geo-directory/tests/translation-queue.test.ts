import test, { after } from "node:test";
import assert from "node:assert/strict";
import { sql, closeDb } from "@aihot/backend/db";
import { translatePublicBatch, translationHash, PublicTranslationError, type TranslationInput } from "../backend/translate-public.ts";

after(closeDb);
async function fixture(id: string, title: string, summary: string | null = "We tested 1,000 AI search queries.", language = "en") {
  await sql`INSERT INTO geo_public_source_status (source_id,source_name,source_url,enabled) VALUES ('translation-queue','Research','https://example.com',true) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO geo_public_items (id,title,summary,language,url,source_id,source_name,source_url) VALUES (${id},${title},${summary},${language},${'https://example.com/'+id},'translation-queue','Research','https://example.com')`;
}
const output = async (_input: TranslationInput) => ({ title: "AI 搜索实验结果", summary: "我们测试了 1,000 条 AI 搜索查询。", provider: "fixture" });

test("durable queue reuses duplicate text, skips Chinese and retranslates revised excerpts", async () => {
  await fixture("q-a", "AI search experiment");
  await fixture("q-b", "AI search experiment");
  await fixture("q-cn", "AI 搜索研究", "中文原文", "zh");
  let calls = 0;
  const translate = async (input: TranslationInput) => { calls++; return output(input); };
  const first = await translatePublicBatch({ translate });
  assert.equal(first.translated, 1); assert.equal(first.reused, 1); assert.equal(calls, 1);
  assert.equal((await translatePublicBatch({ translate })).attempted, 0);
  await sql`UPDATE geo_public_items SET summary='We retested 2,000 AI search queries.' WHERE id='q-a'`;
  assert.equal((await translatePublicBatch({ translate })).translated, 1);
  assert.equal(calls, 2);
  assert.equal(translationHash({ id: "a", title: "ab", summary: "c", language: "en" }), translationHash({ id: "b", title: "ab", summary: "c", language: "en" }));
  assert.notEqual(translationHash({ id: "a", title: "ab", summary: "c", language: "en" }), translationHash({ id: "a", title: "a", summary: "bc", language: "en" }));
});

test("failed and incomplete translations back off while an unavailable runtime leaves the queue pending", async () => {
  await fixture("q-fail", "AI search translation failure");
  assert.equal((await translatePublicBatch({ translate: async () => ({ title: "中文标题", summary: null, provider: "fixture" }) })).failed, 1);
  assert.equal((await translatePublicBatch({ translate: output })).attempted, 0);
  const [failure] = await sql`SELECT status,title_zh,last_error,attempts,next_attempt_at > now() AS cooling FROM geo_public_translations WHERE item_id='q-fail'`;
  assert.equal(failure.status, "error"); assert.equal(failure.title_zh, null); assert.equal(failure.last_error, "invalid"); assert.equal(failure.cooling, true);
  await sql`UPDATE geo_public_translations SET next_attempt_at=now()-interval '1 minute' WHERE item_id='q-fail'`;
  await assert.rejects(translatePublicBatch({ translate: async () => { throw new PublicTranslationError("unavailable"); } }), /unavailable/);
  assert.equal((await sql`SELECT attempts FROM geo_public_translations WHERE item_id='q-fail'`)[0].attempts, 1);
  await assert.rejects(translatePublicBatch({ translate: async () => { throw new Error("must not retry during persisted cooldown"); } }), /unavailable/);
  await sql`UPDATE geo_public_translation_runtime SET retry_after=now()-interval '1 second'`;
  assert.equal((await translatePublicBatch({ translate: output })).translated, 1);
});

test("invented dates and missing percentages hold only the affected item, without stopping other translations", async () => {
  await fixture("q-invented", "AI search study in August", "AI search increased 25%.");
  await fixture("q-percent", "AI search percentages", "AI search increased 25%.");
  await fixture("q-good", "AI search reliable translation", "AI search increased 25%.");
  const result=await translatePublicBatch({translate:async input=>({title:input.id==='q-invented'?'2023年8月AI搜索研究':'AI搜索研究',
    summary:input.id==='q-percent'?'AI搜索增长了35%。':'AI搜索增长了25%。',provider:'fixture'})});
  assert.equal(result.failed,2);assert.equal(result.translated,1);
  assert.equal((await sql`SELECT count(*)::int AS n FROM geo_public_translation_runtime WHERE retry_after>now()`)[0].n,0);
});

test("concurrent source edits never receive an old translation, and disabled sources stay untouched", async () => {
  await fixture("q-race", "AI search concurrent experiment");
  const result = await translatePublicBatch({ translate: async input => {
    await sql`UPDATE geo_public_items SET title='AI search revised experiment' WHERE id=${input.id}`;
    return output(input);
  } });
  assert.equal(result.stale, 1);
  assert.equal((await sql`SELECT item_id FROM geo_public_translations WHERE item_id='q-race'`).length, 0);
  await sql`UPDATE geo_public_source_status SET enabled=false WHERE source_id='translation-queue'`;
  assert.equal((await translatePublicBatch({ translate: async () => { throw new Error("must not run"); } })).attempted, 0);
});
