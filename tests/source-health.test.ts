// Failure cases: fresh hot signals hide an editorial collection outage; intermittent failures vanish
// after one success; zero-output counts stop at the display limit; publisher attribution makes a
// working discovery source look idle; missing dates/repeated edits in signals are called bad articles.
// And the quiet judgment reads each source's own rhythm: a monthly blog is not late after a week, a
// daily one is, and a source with too little history stays visible rather than being called healthy.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { collectFindings } from "@aihot/backend/operations/alerts";
import { sourceHealthWeekly } from "@aihot/backend/operations/reports";
import { sourceHealth, rhythmText } from "@aihot/backend/sources/health";

const T = tag();
const now = Date.now();
const old = new Date(now - 8 * 86400_000);
process.env.COLLECT_ENABLED = "true";
process.env.MODEL_CALLS_ENABLED = "false";
process.env.FEISHU_INTERNAL_ENABLED = "false";
before(async () => { await getBoss(); });
after(async () => { await stopBoss(); await closeDb(); });
async function source(id: string, mode = "editorial", created = old) {
  id = `${T}-${id}`;
  await sql`INSERT INTO sources(id,name,kind,participation_mode,health,created_at,last_ok_at,next_fetch_at)
    VALUES(${id},${id},'rss',${mode},'ok',${created},${new Date(now)},'2100-01-01')`;
  return id;
}
async function material(sourceId: string, suffix: string, publishedAt: Date | null = new Date(now)) {
  return upsertMaterial({ sourceId, title: suffix, url: `https://example.test/${T}/${suffix}`, via: "fetch", publishedAt, bodyStatus: "none" });
}
/** Items this source's own output is dated to, on the given days before now (old enough not to count as
 * fresh discoveries): the only thing its rhythm is read from. */
async function datedItems(sourceId: string, daysAgo: number[]) {
  for (const [i, days] of daysAgo.entries()) {
    const at = new Date(now - days * 86400_000);
    const url = `https://example.test/${sourceId}/${i}`;
    await sql`INSERT INTO articles(id,source_id,identity_key,url,title,published_at,discovered_at,timeline_at)
      VALUES(${`${sourceId}-d${i}`},${sourceId},${`url:${url}`},${url},${`${sourceId} ${i}`},${at},${new Date(now - 30 * 86400_000)},${at})`;
  }
}
async function failedRuns(sourceId: string, times: number, error = "HTTP 503") {
  await sql`INSERT INTO fetch_runs(source_id,started_at,finished_at,status,found_count,new_count,error)
    SELECT ${sourceId}, ${new Date(now)}::timestamptz - i * interval '1 hour', ${new Date(now)}::timestamptz - i * interval '1 hour',
      'failed', 1, 0, ${error} FROM generate_series(1,${times}) i`;
}
/** A first import: history that arrived in one delivery, so its publication dates reach further back
 * than the day the source started producing anything we could see. */
async function firstImport(sourceId: string, publishedDaysAgo: number[], discoveredDaysAgo: number) {
  for (const [i, days] of publishedDaysAgo.entries()) {
    const at = new Date(now - days * 86400_000);
    const url = `https://example.test/${sourceId}/import-${i}`;
    await sql`INSERT INTO articles(id,source_id,identity_key,url,title,published_at,discovered_at,timeline_at,backfill,backfill_reason)
      VALUES(${`${sourceId}-i${i}`},${sourceId},${`url:${url}`},${url},${`${sourceId} import ${i}`},${at},
        ${new Date(now - discoveredDaysAgo * 86400_000)},${at},true,'first-import')`;
  }
}
const quietGroup = async (mode = "editorial") => (await sourceHealth(now)).find(g => g.mode === mode)!;

test("hot-signal activity does not hide editorial collection stopping", async () => {
  const editorial = await source("editorial", "editorial", new Date(now));
  const signal = await source("signal", "hot_signal", new Date(now));
  await material(signal, "signal");
  const finding = (await collectFindings(now)).find(f => f.key === "content.collect");
  assert.equal(finding?.level, "now");
  assert.match(finding!.title, /文章|编辑/);
  await material(editorial, "editorial");
  assert.equal((await collectFindings(now)).find(f => f.key === "content.collect"), undefined);
});

test("daily follow-ups retain chronic failures after a successful run, separately by use", async () => {
  const editorial = await source("chronic");
  const signal = await source("signal-intermittent", "hot_signal");
  const budget = await source("budget-limited", "editorial", new Date(now));
  await sql`INSERT INTO fetch_runs(source_id,started_at,finished_at,status,error)
    SELECT ${budget},${new Date(now)},${new Date(now)},'failed','Budget for test exhausted (day)' FROM generate_series(1,20)`;
  for (const id of [editorial, signal]) {
    await sql`INSERT INTO fetch_runs(source_id,started_at,finished_at,status,found_count,new_count,error)
      SELECT ${id}, ${new Date(now)}::timestamptz - i * interval '1 hour', ${new Date(now)}::timestamptz - i * interval '1 hour',
        CASE WHEN i BETWEEN 1 AND 5 THEN 'failed' ELSE 'ok' END, 1, 0,
        CASE WHEN i BETWEEN 1 AND 5 THEN 'HTTP 503' ELSE NULL END FROM generate_series(0,19) i`;
  }
  const findings = await collectFindings(now);
  for (const [mode, id, other] of [["editorial", editorial, signal], ["hot_signal", signal, editorial]]) {
    const f = findings.find(f => f.key === `sources.unstable.${mode}`);
    assert.equal(f?.level, "later");
    assert.ok(f!.detail!.includes(id!));
    assert.ok(!f!.detail!.includes(other!));
    assert.ok(!f!.detail!.includes(budget), "a spent budget is not a failing source");
    assert.match(f!.detail!, /5\/20/);
  }
});

test("weekly totals count every silent source and include successful attributed discoveries", async () => {
  for (let i = 0; i < 18; i++) await source(`silent-${i}`);
  const publisher = await source("publisher", "editorial", new Date(now));
  const collector = await source("collector");
  const { articleId } = await material(publisher, "shared");
  await sql`INSERT INTO article_discoveries(article_id,source_id,via,discovered_at) VALUES(${articleId},${collector},'fetch',${new Date(now)})`;
  const lines: string[] = [];
  const log = console.log;
  console.log = (value: unknown) => { lines.push(String(value)); };
  try {
    const result = await sourceHealthWeekly(now);
    assert.equal(result.silent, 20, "18 silent plus two chronic sources, not the display limit or the collector");
  } finally { console.log = log; }
  const text = lines.join("\n");
  assert.match(text, /编辑内容/);
  assert.match(text, /热度信号/);
  assert.doesNotMatch(text, new RegExp(`· ${collector}`));
});

test("quality follow-ups count undated editorial articles and edits without judging signal bodies", async () => {
  const editorial = await source("quality", "editorial", new Date(now));
  const signal = await source("quality-signal", "hot_signal", new Date(now));
  const article = await material(editorial, "undated-editorial", null);
  await material(signal, "undated-signal", null);
  await sql`INSERT INTO article_revisions(article_id,revision,title,created_at)
    SELECT ${article.articleId},i,'changed',${new Date(now)} FROM generate_series(2,6) i`;
  const findings = await collectFindings(now);
  const quality = findings.find(f => f.key === "sources.quality.editorial");
  assert.equal(quality?.level, "later");
  assert.ok(quality!.detail!.includes(editorial));
  assert.match(quality!.detail!, /缺发布时间 1/);
  assert.match(quality!.detail!, /反复修订 1/);
  assert.equal(findings.find(f => f.key === "sources.quality.hot_signal"), undefined);
});

test("saved detail budget waits and shutdowns do not alert, while HTTP errors and timeouts do", async () => {
  const budget = await source("detail-budget", "editorial", new Date(now));
  const shutdown = await source("detail-shutdown", "editorial", new Date(now));
  const mixed = await source("detail-mixed", "editorial", new Date(now));
  const legacy = await source("detail-counter", "editorial", new Date(now));
  const error = "Budget for jina exhausted (minute)";
  for (const [id, detail] of [
    [budget, { detailFailures: 2, detailErrors: [{ error }, { error: "Budget for jina exhausted (day)" }] }],
    [shutdown, { detailFailures: 15, detailErrors: Array.from({ length: 15 }, () => ({ error: "This operation was aborted" })) }],
    [mixed, { detailFailures: 4, detailErrors: [{ error }, { error: "This operation was aborted" },
      { error: "HTTP 500 for detail" }, { error: "The operation was aborted due to timeout" }] }],
    [legacy, { detailFailures: 1 }],
  ] as const) {
    await sql`INSERT INTO fetch_runs(source_id,started_at,finished_at,status,detail)
      VALUES(${id},${new Date(now)},${new Date(now)},'ok',${sql.json(detail)})`;
  }
  const finding = (await collectFindings(now)).find(f => f.key === "sources.details.editorial");
  assert.ok(finding);
  assert.ok(!finding.detail!.includes(budget));
  assert.ok(!finding.detail!.includes(shutdown));
  assert.ok(finding.detail!.includes(`${mixed}）：近 7 天 2 次`));
  assert.ok(finding.detail!.includes(`${legacy}）：近 7 天 1 次`));
});

test("a low-frequency source quiet for a week is not late, while a daily one is", async () => {
  const monthly = await source("monthly");
  const daily = await source("daily");
  // One item a month, the newest ten days ago: quiet, but inside its own rhythm.
  await datedItems(monthly, [10, 40, 70, 89]);
  // One a day until a week ago: the same silence is seven times its own gap.
  await datedItems(daily, [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const group = await quietGroup();
  assert.ok(!group.overdue.includes(group.sources.find(s => s.id === monthly)!), "a monthly blog is not overdue after ten days");
  assert.ok(!group.silent.some(s => s.id === monthly), "and it is not reported at all");
  assert.ok(group.overdue.some(s => s.id === daily), "a daily source quiet for a week is overdue");
  const finding = (await collectFindings(now)).find(f => f.key === "sources.overdue.editorial");
  assert.match(finding!.title, /超出自身更新节奏/);
  assert.match(finding!.detail!, new RegExp(`${daily}）：近 7 天没有新内容，平时约 1 天一条（7 倍）`));
  assert.match(finding!.detail!, /先对照原站/);
});

test("a source without enough history to have a rhythm stays visible instead of being called fine", async () => {
  const thin = await source("thin");
  const never = await source("never");
  await datedItems(thin, [8, 38]);
  const group = await quietGroup();
  assert.ok(group.unknown.some(s => s.id === thin), "two dated days are not a rhythm");
  assert.ok(group.unknown.some(s => s.id === never), "a source that never produced anything is visible too");
  assert.ok(!group.overdue.some(s => s.id === thin || s.id === never));
  assert.match(rhythmText(group.unknown.find(s => s.id === thin)!), /近 7 天 \d+ 次抓取、0 条新内容；窗口内可比较的历史只有 2 天/);
  assert.match(rhythmText(group.unknown.find(s => s.id === never)!), /近 7 天 \d+ 次抓取、0 条新内容；从未收到过内容/);
  const finding = (await collectFindings(now)).find(f => f.key === "sources.silent.editorial");
  assert.match(finding!.title, /7 天没有新内容/);
  assert.match(finding!.detail!, /判断不了节奏，仍需留意/);
});

test("one first import is one output day, not one day per publication date", async () => {
  const imported = await source("import-batch");
  // Four historical articles delivered in one go: published 8, 9, 10 and 11 days ago, all found 8 days ago.
  await firstImport(imported, [8, 9, 10, 11], 8);
  const group = await quietGroup();
  const row = group.sources.find(s => s.id === imported)!;
  assert.equal(row.evidence_days, 1, "一次首次导入是一天产出");
  assert.equal(row.median_gap_days, null, "一天没有间隔可算");
  assert.ok(!group.overdue.some(s => s.id === imported), "不该按「超出自身节奏」处理");
  assert.ok(group.unknown.some(s => s.id === imported), "而是历史不足，仍然列出来");
  assert.match(rhythmText(row), /窗口内可比较的历史只有 1 天/);
});

test("a first import spread over months cannot hide a source that has since gone quiet", async () => {
  const spread = await source("import-spread");
  // The import reaches months back (80, 50 and 20 days ago) but arrived 20 days ago: one output day, so
  // the silence since then is unmeasurable rather than "inside a wide rhythm".
  await firstImport(spread, [80, 50, 20], 20);
  const group = await quietGroup();
  assert.equal(group.sources.find(s => s.id === spread)!.evidence_days, 1);
  assert.ok(group.silent.some(s => s.id === spread), "判断不了节奏的源仍要看得见");
  assert.ok(!group.overdue.some(s => s.id === spread));
});

test("output older than the window is not comparable history, and reads apart from never receiving anything", async () => {
  const lapsed = await source("lapsed");
  const never = await source("never-any");
  // Delivered 120 days ago, nothing since: its only output day sits outside the window.
  await firstImport(lapsed, [120], 120);
  const group = await quietGroup();
  const lapsedRow = group.sources.find(s => s.id === lapsed)!;
  const neverRow = group.sources.find(s => s.id === never)!;
  assert.equal(lapsedRow.evidence_days, 0, "窗口外的一天不计入产出日");
  assert.equal(lapsedRow.ever_output, true, "但它确实产出过");
  assert.match(rhythmText(lapsedRow), /近 90 天窗口内没有可比较的产出/);
  assert.doesNotMatch(rhythmText(lapsedRow), /从未收到过内容/);
  assert.equal(neverRow.ever_output, false);
  assert.match(rhythmText(neverRow), /从未收到过内容/);
  const finding = (await collectFindings(now)).find(f => f.key === "sources.silent.editorial")!;
  assert.match(finding.detail!, /\d+ 个在近 90 天内的产出历史不足以判断节奏、\d+ 个从未收到过内容/);
});

test("collection failures stay reported on their own, also when the source is past its rhythm", async () => {
  const broken = await source("broken");
  await datedItems(broken, [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  await failedRuns(broken, 6);
  await sql`UPDATE sources SET health = 'failing', fail_count = 6 WHERE id = ${broken}`;
  const group = await quietGroup();
  assert.ok(group.failing.some(s => s.id === broken), "consecutive failures keep their own follow-up");
  assert.ok(group.unstable.some(s => s.id === broken), "and the intermittent-failure one");
  assert.ok(group.overdue.some(s => s.id === broken), "a failed source past its rhythm is not excused by its silence");
  const findings = await collectFindings(now);
  assert.ok(findings.find(f => f.key === "sources.failing.editorial")!.detail!.includes(broken));
  assert.ok(findings.find(f => f.key === "sources.overdue.editorial")!.detail!.includes(broken));
});


test("an attributed discovery is historical output even without publisher-owned articles", async () => {
  const publisher = await source("history-publisher");
  const collector = await source("history-collector");
  await datedItems(publisher, [20]);
  await sql`INSERT INTO article_discoveries(article_id,source_id,via,discovered_at)
    VALUES(${`${publisher}-d0`},${collector},'fetch',${new Date(now - 20 * 86400_000)})`;
  const row = (await quietGroup()).sources.find(s => s.id === collector)!;
  assert.equal(row.evidence_days, 1);
  assert.equal(row.ever_output, true);
  assert.doesNotMatch(rhythmText(row), /从未收到过内容/);
  await sql`UPDATE article_discoveries SET discovered_at = ${new Date(now - 120 * 86400_000)} WHERE source_id = ${collector}`;
  const outside = (await quietGroup()).sources.find(s => s.id === collector)!;
  assert.equal(outside.evidence_days, 0);
  assert.equal(outside.ever_output, true);
  assert.match(rhythmText(outside), /窗口内没有可比较的产出/);
});

test("rhythm bounds publication days independently of discovery time", async () => {
  const oldpub = await source("old-publication");
  await datedItems(oldpub, [120]);
  const futurepub = await source("future-publication");
  await datedItems(futurepub, [-1]);
  const olddiscovery = await source("old-discovery");
  await datedItems(olddiscovery, [10]);
  await sql`UPDATE articles SET discovered_at = ${new Date(now - 120 * 86400_000)} WHERE source_id = ${olddiscovery}`;
  const group = await quietGroup();
  assert.equal(group.sources.find(s => s.id === oldpub)!.evidence_days, 0);
  assert.equal(group.sources.find(s => s.id === futurepub)!.evidence_days, 0);
  assert.equal(group.sources.find(s => s.id === olddiscovery)!.evidence_days, 1);
});
