// Run after `npm run build -w @aihot/web`. Real production server/router, synthetic HTTP API only.
// Failure cases: the masthead numbering the newest of 405 issues 400 (the navigation index's length); an
// issue older than the index losing its number; the calendar marking that issue as not published;
// the GEO daily digest confusing source-item totals with generated report issue numbers.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { ReportDetail, ReportKind, ReportNavigationEntry } from "@aihot/contracts/site";
import { isoWeekLabel } from "@aihot/contracts/time";
import { issueNumber, periodGrid } from "../app/features/report/format.ts";
import { geoItem, geoOverview } from "./geo-fixtures.ts";
import { startWebServer, type WebServer } from "./web-server.ts";

const kinds: ReportKind[] = ["daily", "weekly", "monthly"];
const keys = Object.fromEntries(kinds.map((kind) => [kind, Array.from({ length: 405 }, (_, i) => {
  if (kind === "monthly") return new Date(Date.UTC(2020, i, 1)).toISOString().slice(0, 7);
  const day = new Date(Date.UTC(2020, 0, 6 + i * (kind === "weekly" ? 7 : 1))).toISOString().slice(0, 10);
  return kind === "weekly" ? isoWeekLabel(day) : day;
})])) as Record<ReportKind, string[]>;
/** The navigation as the api sends it: the newest 400 issues, each with its number in the whole series. */
const index = (kind: ReportKind): ReportNavigationEntry[] => keys[kind].map((key, i) => ({ key, issueNumber: i + 1, title: `第${i + 1}期` })).reverse().slice(0, 400);
function report(kind: ReportKind, key: string): ReportDetail {
  return {
    kind, key, issueNumber: keys[kind].indexOf(key) + 1, title: "测试刊物", generatedAt: "2020-01-02T00:00:00Z",
    lead: null, leadItemId: null, overview: null, highlights: [], sections: [], flashes: [], cover: null, metrics: {}, readingMinutes: 1, prev: null, next: null,
  };
}
let web: WebServer;
const upstreamPaths: string[] = [];
const latestDay = "2026-10-16";
const previousDay = "2026-10-15";
const api = createServer((req, res) => {
  upstreamPaths.push(req.url!);
  const url = new URL(req.url!, "http://api.local");
  const path = url.pathname;
  res.setHeader("Content-Type", "application/json");
  if (path === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "2026-09-28T12:00" }));
  if (path === "/api/geo/overview") {
    const selectedDay = url.searchParams.get("day") ?? latestDay;
    return res.end(JSON.stringify(geoOverview({
      days: [
        { day: latestDay, count: 405, publishedCount: 404, collectedOnlyCount: 1 },
        { day: previousDay, count: 2, publishedCount: 1, collectedOnlyCount: 1 },
      ],
      selectedDay, dailyTotal: selectedDay === latestDay ? 405 : 2,
      dailyItems: [
        geoItem({ id: "dated-geo", title: `GEO 来源 ${selectedDay}`, publishedAt: `${selectedDay}T08:00:00Z` }),
        geoItem({ id: "undated-geo", title: "发布日期未知的原始资料", url: "https://example.org/undated",
          sourceId: "community-fixture", sourceName: "社区资料", publishedAt: null, collectedAt: `${selectedDay}T08:00:00Z`, dateBasis: "collected" }),
      ],
    })));
  }
  const match = /^\/api\/site\/reports\/(weekly|monthly)\/(.+)$/.exec(path);
  if (match) {
    const kind = match[1] as ReportKind;
    const key = match[2]!;
    if (key === "latest-page") return res.end(JSON.stringify({ index: index(kind), report: report(kind, keys[kind].at(-1)!) }));
    if (key.startsWith("navigation/")) return res.end(JSON.stringify({ items: index(kind) }));
    if (keys[kind].includes(key)) return res.end(JSON.stringify(report(kind, key)));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ code: "not_found" }));
});

before(async () => { web = await startWebServer(api); });
after(() => web.stop());

/** The generated weekly/monthly report's visible masthead text. */
function masthead(html: string): string {
  const header = /<header class="pt-5 lg:pt-0">([\s\S]*?)<\/header>/.exec(html);
  assert.ok(header, "the report masthead is rendered");
  return header[1]!.replace(/<[^>]+>/g, "");
}

for (const kind of ["weekly", "monthly"] as const) {
  test(`the ${kind} masthead numbers the newest of 405 issues 405, not the navigation's 400`, async () => {
    const response = await fetch(`${web.origin}/${kind}`);
    assert.equal(response.status, 200, web.logs());
    const visible = masthead(await response.text());
    assert.match(visible, /第\s*405\s*期/);
    assert.doesNotMatch(visible, /第\s*400\s*期/);
  });

  test(`the oldest ${kind} issue, outside the navigation, keeps its number`, async () => {
    const first = keys[kind][0]!;
    assert.ok(!index(kind).some((entry) => entry.key === first));
    const response = await fetch(`${web.origin}/${kind}/${first}`);
    assert.equal(response.status, 200, web.logs());
    assert.match(masthead(await response.text()), /第\s*1\s*期/);
  });

}

for (const kind of kinds) {
  test(`the ${kind} calendar labels this issue with its own number and makes up none for others`, () => {
    const first = keys[kind][0]!;
    const { cells } = periodGrid(kind, first, index(kind), 1);
    const current = cells.find((cell) => cell.key === first)!;
    assert.equal(current.state, "current");
    assert.match(current.label, /第 1 期/);
    const unlisted = cells.find((cell) => cell.key === keys[kind][1])!;
    assert.doesNotMatch(unlisted.label, /第 \d+ 期/, "an issue the navigation does not list gets no number");
    assert.equal(issueNumber(index(kind), keys[kind].at(-1)!), 405);
    const stale = periodGrid(kind, first, [{ key: first, issueNumber: 9 }], 10);
    assert.match(stale.cells.find((cell) => cell.key === first)!.label, /第 10 期/, "the report's own number wins over an older navigation");
  });
}

async function dailyPage(path: string, day: string | null = null) {
  const start = upstreamPaths.length;
  const response = await fetch(`${web.origin}${path}`);
  assert.equal(response.status, 200, web.logs());
  const html = await response.text();
  const calls = upstreamPaths.slice(start).map((value) => new URL(value, "http://api.local"));
  const overview = calls.filter((url) => url.pathname === "/api/geo/overview");
  assert.equal(overview.length, 1, "daily pages read the GEO overview exactly once");
  assert.equal(overview[0]!.searchParams.get("day"), day);
  assert.ok(calls.every((url) => ["/api/site/meta", "/api/geo/overview"].includes(url.pathname)), "daily pages do not read generated report APIs");
  return { html, text: html.replace(/<[^>]+>/g, "") };
}

test("the GEO dated archive distinguishes 405 source items from its two displayed items and two archive dates", async () => {
  const { html, text } = await dailyPage("/daily?day=" + latestDay, latestDay);
  assert.match(html, /<h1[^>]*>GEO 日报<\/h1>/);
  assert.match(text, /2026-10-16 · 405 条资料/);
  assert.match(text, /最近有收录的日期（2 天）/);
  assert.match(text, /当前展示前 2 条，该日共 405 条/);
  assert.equal((html.match(/data-public-item=/g) ?? []).length, 2);
  assert.match(text, /发布日期未知的原始资料/);
  assert.match(html, /<time[^>]*>日期待确认<\/time>/);
  assert.doesNotMatch(text, /第\s*405\s*期|测试刊物/);
});

test("GEO daily selection passes the query date and gives a dated route priority over the query", async () => {
  const selected = await dailyPage(`/daily?day=${previousDay}`, previousDay);
  assert.match(selected.text, /2026-10-15 · 2 条资料/);
  const first = keys.daily[0]!;
  assert.ok(![latestDay, previousDay].includes(first), "the dated page can lie outside the archive list");
  const dated = await dailyPage(`/daily/${first}?day=${latestDay}`, first);
  assert.ok(dated.text.includes(`${first} · 2 条资料`));
  assert.ok(dated.text.includes(`GEO 来源 ${first}`));
});

test("the GEO daily archive counts dates and links to the matching daily digests", async () => {
  const { html, text } = await dailyPage("/daily/archive");
  assert.match(html, /<h1[^>]*>按日期看资讯<\/h1>/);
  assert.match(text, /最近有收录的日期（2 天）/);
  assert.match(html, /data-day-list=""/);
  assert.match(html, /aria-current="page"[^>]*>10月16日/);
  for (const day of [latestDay, previousDay]) assert.ok(html.includes(`href="/daily/${day}"`));
  assert.doesNotMatch(text, /共\s*405\s*期/);
  assert.equal(web.logs(), "");
});
