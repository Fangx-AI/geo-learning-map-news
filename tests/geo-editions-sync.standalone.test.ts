import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { editionsFromThread, mergeEditionThreads } from "../modules/geo-directory/backend/editions.ts";

const threadId = "00000000-0000-4000-8000-000000000001";
process.env.GEO_DAILY_SOURCE_THREAD_ID = threadId;
const source = "https://chatgpt.com/share/example";
const body = "# 全球 GEO 全景情报\n## 2026 年 10 月 22 日｜第 006 期\n" + "这是带来源、适用范围和方法的完整报告内容。".repeat(60) + "\n[来源](https://example.com/research)";
const part = (n: number, total = 2, text = body) => ({ type: "agentMessage", id: randomUUID(), text: `<!-- GEO-EDITION date=2026-10-22 issue=6 part=${n} total=${total} -->\n${text}\n<!-- GEO-PART-END -->${n === total ? '\n<!-- GEO-EDITION-END -->' : ''}` });
const wrap = (items: object[]) => ({ thread: { id: threadId }, turns: [{ status: "completed", items }] });

test("different polls accumulate exact parts, duplicate polls do not duplicate publication", () => {
  const first = wrap([part(1)]), second = wrap([part(2, 2, "## 末尾\n最后一节完整保留。")]);
  const pending = editionsFromThread(first, source);
  assert.deepEqual(pending.gaps[0]?.missing, [2]);
  const result = editionsFromThread(mergeEditionThreads([first, second, first]), source);
  assert.equal(result.editions.length, 1);
  assert.match(result.editions[0]!.markdown, /最后一节完整保留/);
});

test("truncation, changed source messages and foreign conversations cannot become complete reports", () => {
  const a = part(1, 1);
  assert.equal(editionsFromThread(wrap([{ ...a, truncated: true }]), source).editions.length, 0);
  assert.throws(() => mergeEditionThreads([wrap([a]), wrap([{ ...a, text: a.text + 'changed' }])]), /Source message changed/);
  assert.throws(() => mergeEditionThreads([{ ...wrap([a]), thread: { id: randomUUID() } }]), /Unexpected/);
  assert.equal(editionsFromThread(wrap([{ ...a, text: a.text.replace('<!-- GEO-EDITION-END -->', '') }]), source).editions.length, 0);
});

test("complete single-message repair can replace a missing tail-only set, but two conflicting repairs are rejected", () => {
  const tail = part(5, 5, "## 原消息的最后一节\n未取得前四段。");
  const full = part(1, 1);
  assert.equal(editionsFromThread(wrap([tail, full]), source).editions.length, 1);
  assert.throws(() => editionsFromThread(wrap([full, part(1, 1, body + '\n修订正文')]), source), /Conflicting/);
});

test("partial import archives raw JSON and records gaps without requiring an available database", async () => {
  const base = path.resolve(tmpdir());
  const dir = await mkdtemp(path.join(base, "geo-edition-sync-"));
  assert.equal(path.dirname(path.resolve(dir)), base);
  try {
    const raw = JSON.stringify(wrap([part(2)]), null, 2);
    await writeFile(path.join(dir, "input.json"), raw);
    const script = path.resolve(import.meta.dirname, "../scripts/import-geo-editions.ts");
    const run = () => promisify(execFile)(process.execPath, [script, "input.json", source], { cwd: dir, windowsHide: true, timeout: 10000, env: { ...process.env, DATABASE_URL: "postgres://nobody@127.0.0.1:1/unavailable" } });
    const result = JSON.parse((await run()).stdout);
    assert.equal(result.complete, 0); assert.deepEqual(result.gaps[0].missing, [1]);
    await run();
    const archive = path.join(dir, ".data/daily-sync/snapshots");
    const files = await readdir(archive);
    assert.equal(files.length, 1);
    assert.equal(await readFile(path.join(archive, files[0]!), "utf8"), raw);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
