import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closeDb, sql } from "@aihot/backend/db";
import { reconcilePublicSources } from "../backend/collect-public.ts";
import { parseEdition, saveEdition, editionsFromThread } from "../backend/editions.ts";
import { loadGeoEdition, listGeoEditions } from "@aihot/backend/publication/geo-editions";
after(closeDb);
process.env.GEO_DAILY_SOURCE_THREAD_ID = "00000000-0000-4000-8000-000000000001";
const source = "https://chatgpt.com/share/example";
const body = "# 全球 GEO 全景情报\n## 2026 年 10 月 19 日｜第 003 期\n\n## 核心结论\n" + "研究需要核对样本、时间和原始数据，观察不能等同于因果。".repeat(40) + "\n[来源](https://research.example/study)\n\n## 最后一节\n完整保留末尾结论。";
const msg = (text = body) => ({ id: randomUUID(), author: { role: "assistant" }, status: "finished_successfully", content: { parts: [text] } });
test("edition import is idempotent, immutable on conflict, complete and sanitised", async () => {
  const e = parseEdition(msg(body + '\n<script>evil()</script><img src=x onerror="evil()">'), source);
  assert.equal(await saveEdition(e), "created");
  assert.equal(await saveEdition(e), "unchanged");
  await assert.rejects(saveEdition({ ...e, hash: "changed" }), /conflict/);
  const page = await loadGeoEdition(e.id);
  assert(page);
  assert(page.html.includes("完整保留末尾结论"));
  assert(!/script|onerror|evil\(/.test(page.html));
  assert.equal(page.outline.length, 2);
  assert.doesNotMatch(JSON.stringify(page), /source_message_id|content_hash/);
  assert.equal((await listGeoEditions()).length, 1);
  assert.equal(await loadGeoEdition("1900-01-01"), null);
});
test("reject user prompts, interrupted output and unresolved citations", () => {
  assert.throws(() => parseEdition({ ...msg(), author: { role: "user" } }, source));
  assert.throws(() => parseEdition({ ...msg(), status: "in_progress" }, source));
  assert.throws(() => parseEdition(msg(body + "\n[truncated]"), source));
  assert.throws(() => parseEdition(msg(body + "citeturn1search0"), source), /Unresolved/);
});
test("retain all citations in a grouped reference and support reversed date heading", () => {
  const m = { ...msg(body.replace("2026 年 10 月 19 日｜第 003 期", "第 003 期｜2026 年 10 月 19 日") + "citeab"), metadata: { content_references: [{ matched_text: "citeab", safe_urls: ["https://one.example/", "https://two.example/"] }] } };
  const result = parseEdition(m, source);
  assert(result.links.includes("https://one.example/") && result.links.includes("https://two.example/"));
});
test("multipart sync requires complete boundaries, final marker and consistent metadata", () => {
  const part = (n: number, text: string) => ({ type: "agentMessage", id: randomUUID(), text: `<!-- GEO-EDITION date=2026-10-19 issue=3 part=${n} total=2 -->\n${text}\n<!-- GEO-PART-END -->${n === 2 ? '\n<!-- GEO-EDITION-END -->' : ''}` });
  const items = [part(1, body), part(2, "## 延伸发现\n完整的最后一段。")];
  const data = (parts: typeof items) => ({ thread: { id: "00000000-0000-4000-8000-000000000001" }, turns: [{ status: "completed", items: parts }] });
  assert.equal(editionsFromThread(data(items), source).editions.length, 1);
  assert.equal(editionsFromThread(data([items[0]!, { ...items[1]!, text: items[1]!.text + '\n' }]), source).editions.length, 1);
  assert.deepEqual(editionsFromThread(data([{ type: 'agentMessage', id: items[0]!.id, text: body }]), source).unframed, [items[0]!.id]);
  assert.deepEqual(editionsFromThread(data(items.slice(0, 1)), source).pending, ["2026-10-19"]);
  assert.equal(editionsFromThread(data([items[0]!, { ...items[1]!, text: items[1]!.text.replace('<!-- GEO-EDITION-END -->', '') }]), source).editions.length, 0);
  assert.equal(editionsFromThread(data([items[0]!, { ...items[1]!, text: items[1]!.text.replace('issue=3', 'issue=4') }]), source).editions.length, 0);
});
test("feed reconciliation preserves reviewed edition references without preserving removed feeds", async () => {
  await sql`INSERT INTO geo_public_source_status(source_id,source_name,source_url) VALUES ('geo-daily-references','Edition references','https://example.com'),('removed-edition-fixture','Removed','https://example.com')`;
  await reconcilePublicSources([], []);
  const rows = await sql`SELECT source_id,enabled FROM geo_public_source_status ORDER BY source_id`;
  assert.equal(rows.find(r => r.source_id === 'geo-daily-references')?.enabled, true);
  assert.equal(rows.find(r => r.source_id === 'removed-edition-fixture')?.enabled, false);
});
