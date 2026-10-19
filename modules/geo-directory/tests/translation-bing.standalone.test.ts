import test from "node:test";
import assert from "node:assert/strict";
import type { GuardedFetchOptions, GuardedResponse } from "@aihot/backend/lib/http-fetch";
import { BingContentTranslationError, BingPublicTranslator, BingTranslationError, splitBingText } from "../backend/translation-bing.ts";
import { GEO_TRANSLATION_VERSION, geoTranslationGlossary, geoTranslationIssues, geoTranslationPrefix, needsTranslationUpgrade, normalizeGeoTranslation } from "@aihot/industry/translation";

const base = "https://www.bing.com";
const textInput = { id: "fixture", title: "AI search citation study", summary: null, language: "en" };
const response = (url: string, body: string, status = 200, headers: Record<string, string> = {}): GuardedResponse => ({ url, status, body: Buffer.from(body), headers: new Headers(headers), text: () => body });
const payload = (text: string) => JSON.stringify([{ translations: [{ to: "zh-Hans", text }] }]);
function fixture(post?: (url: string, options: GuardedFetchOptions, text: string) => Promise<GuardedResponse> | GuardedResponse, page?: string) {
  let now = Date.parse("2026-10-16T00:00:00Z");
  const calls: Array<{ url: string; options: GuardedFetchOptions; at: number; text: string | null }> = [];
  const translator = new BingPublicTranslator(undefined, {
    now: () => now,
    sleep: async ms => { now += ms; },
    fetch: async (url, options) => {
      const text = options.body ? new URLSearchParams(options.body).get("text") : null;
      calls.push({ url, options, at: now, text });
      if (!options.method) return response(url, page ?? `<script>var config={IG:"fixture-ig"};var params_AbusePreventionHelper = [${now},"fixture-private-token",7200000];</script><div data-iid="translator.1"></div>`);
      return post ? post(url, options, text!) : response(url, payload(`译文 ${text}`));
    },
  });
  return { translator, calls, advance: (ms: number) => { now += ms; } };
}

test("ordinary form uses auto-detection, bounded same-origin requests and a single request per second", async () => {
  const { translator, calls } = fixture();
  const value = await translator.translate({ ...textInput, title: "帖文节选｜@researcher：AI search citation study", summary: "We measured 42% more clicks." });
  assert.equal(value.provider, GEO_TRANSLATION_VERSION); assert.equal(value.title, "帖文节选｜@researcher：译文 AI search citation study");
  assert.equal(value.summary, "译文 We measured 42% more clicks."); assert.equal(calls.length, 3);
  for (const [index, call] of calls.entries()) {
    assert.equal(new URL(call.url).origin, base);
    assert.equal(call.options.maxRedirects, 0); assert.equal(call.options.redirectPolicy, "same-origin");
    assert.equal(call.options.timeoutMs, 20_000); assert.ok(call.options.maxBytes! <= 1_500_000);
    assert.equal(call.options.headers?.["user-agent"], undefined); assert.equal(call.options.headers?.authorization, undefined);
    if (index) {
      assert.ok(call.at - calls[index - 1].at >= 1000);
      const body = new URLSearchParams(call.options.body);
      assert.equal(body.get("fromLang"), "auto-detect"); assert.equal(body.get("to"), "zh-Hans");
      assert.equal(body.get("token"), "fixture-private-token"); assert.equal(body.get("text"), call.text);
      assert.equal(new URL(call.url).searchParams.has("edgepdftranslator"), false);
      assert.equal(new URL(call.url).searchParams.has("ref"), false);
    }
  }
  translator.dispose();
});

test("translation calls serialize and repeated titles, equal summaries and text segments reuse memory cache", async () => {
  const { translator, calls } = fixture();
  await Promise.all([
    translator.translate({ ...textInput, summary: textInput.title }),
    translator.translate({ ...textInput, summary: "Independent summary" }),
    translator.translate({ ...textInput, summary: "Independent summary" }),
  ]);
  assert.equal(calls.filter(call => call.options.method === "POST").length, 2);
  assert.equal(calls.filter(call => !call.options.method).length, 1);
  for (let index = 1; index < calls.length; index++) assert.ok(calls[index].at - calls[index - 1].at >= 1000);
  translator.dispose();
});

test("source HTML entities are decoded for translation without altering the input record", async () => {
  const { translator, calls } = fixture();
  const input = { ...textInput, title: "AI search &amp; citation research", summary: "Google&#39;s data &lt; 10%" };
  await translator.translate(input);
  assert.deepEqual(calls.filter(call => call.text !== null).map(call => call.text), ["AI search & citation research", "Google's data < 10%"]);
  assert.equal(input.title, "AI search &amp; citation research"); translator.dispose();
});

test("long summaries are fully translated in sentence chunks without losing characters or splitting surrogate pairs", async () => {
  const summary = Array.from({ length: 24 }, (_, i) => `Sentence ${i}: We measured AI search citations and found 42% more clicks than the control group. `).join("") + "最后一句。";
  const chunks = splitBingText(summary);
  assert.equal(chunks.join(""), summary); assert.ok(chunks.length > 1); assert.ok(chunks.every(chunk => chunk.length <= 1000));
  assert.ok(chunks.slice(0, -1).every(chunk => /[.!?。！？]\s*$/u.test(chunk)));
  const unbroken = "x".repeat(999) + "🔍".repeat(1000) + "end";
  const unicodeChunks = splitBingText(unbroken);
  assert.equal(unicodeChunks.join(""), unbroken);
  assert.ok(unicodeChunks.every(chunk => chunk.length <= 1000 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(chunk)));
  const { translator, calls } = fixture();
  const result = await translator.translate({ ...textInput, summary });
  assert.deepEqual(calls.filter(call => call.options.method === "POST").slice(1).map(call => call.text), chunks.map(chunk => chunk.trim()));
  assert.equal(result.summary, chunks.map(chunk => `译文 ${chunk.trim()}`).join("\n"));
  assert.match(result.summary!, /最后一句/); translator.dispose();
});

test("403 and 429 responses stop immediately, hide response details, and respect retry-after", async () => {
  for (const status of [401, 403, 429]) {
    const { translator, calls } = fixture(url => response(url, "private-token and source text must not leak", status, { "retry-after": "3600" }));
    await assert.rejects(translator.translate(textInput), error => {
      assert.ok(error instanceof BingTranslationError); assert.equal(error.kind, "blocked"); assert.equal(error.status, status);
      assert.equal(error.retryAfterMs, 3_600_000); assert.equal(error.message, "bing_blocked");
      assert.doesNotMatch(error.stack!, /private-token|source text|citation study/); return true;
    });
    await assert.rejects(translator.translate(textInput), BingTranslationError);
    assert.equal(calls.length, 2, "a second call must not retry while the server cooldown is active"); translator.dispose();
  }
  const { translator } = fixture(url => response(url, "", 429, { "retry-after": "Fri, 16 Oct 2026 00:30:00 GMT" }));
  await assert.rejects(translator.translate(textInput), error => error instanceof BingTranslationError && error.retryAfterMs >= 1_790_000);
  translator.dispose();
});

test("captcha, access-check HTML and redirects are never treated as translated text or followed", async () => {
  for (const make of [
    (url: string) => response(url, JSON.stringify({ ShowCaptcha: true })),
    (url: string) => response(url, JSON.stringify({ StatusCode: 429 })),
    (url: string) => response(url, "<html><title>Verify you are human</title></html>"),
    (url: string) => response(url, "", 302, { location: "https://login.example" }),
    () => response("https://login.example", payload("假译文")),
  ]) {
    const { translator, calls } = fixture(make);
    await assert.rejects(translator.translate(textInput), error => error instanceof BingTranslationError && error.kind === "blocked" && error.retryAfterMs >= 900_000);
    assert.equal(calls.length, 2); translator.dispose();
  }
  const { translator, calls } = fixture(undefined, '<title>Access denied</title><input type="password">');
  await assert.rejects(translator.translate(textInput), error => error instanceof BingTranslationError && error.kind === "blocked");
  assert.equal(calls.length, 1); translator.dispose();
});

test("empty, HTML, wrong-language and malformed results fail closed with fixed error codes", async () => {
  for (const body of ["<html>Hello</html>", "", "not json", "[]", "{}", payload("   "), JSON.stringify([{ translations: [{ to: "en", text: "Wrong language" }] }]), payload("<script>fake</script>"), JSON.stringify([{ translations: [] }])]) {
    const { translator } = fixture(url => response(url, body));
    await assert.rejects(translator.translate(textInput), error => error instanceof BingTranslationError && error.kind === "invalid" && error.message === "bing_invalid");
    translator.dispose();
  }
  const { translator, calls } = fixture(undefined, "<html>Missing form data</html>");
  await assert.rejects(translator.translate(textInput), error => error instanceof BingTranslationError && error.kind === "invalid");
  assert.equal(calls.length, 1); translator.dispose();
});

test("network and server errors defer at least one minute without automatic request retries", async () => {
  for (const post of [() => { throw new Error("private token must never be logged"); }, (url: string) => response(url, "Unavailable", 503)]) {
    const { translator, calls } = fixture(post);
    await assert.rejects(translator.translate(textInput), error => error instanceof BingTranslationError && error.kind === "unavailable" && error.retryAfterMs >= 60_000 && error.message === "bing_unavailable");
    assert.equal(calls.length, 2); translator.dispose();
  }
});

test("expired form fields refresh normally and disposal stops further network work", async () => {
  const { translator, calls, advance } = fixture();
  await translator.translate(textInput);
  advance(3_600_001);
  await translator.translate({ ...textInput, title: "A second distinct title" });
  assert.equal(calls.filter(call => !call.options.method).length, 2);
  const count = calls.length; translator.dispose();
  await assert.rejects(translator.translate(textInput), BingTranslationError);
  assert.equal(calls.length, count);
});

test("social prefixes never swallow ordinary English prose before a colon", async () => {
  const { translator, calls } = fixture();
  for (const text of ["帖文节选｜New on my Substack: GEO research", "帖文节选｜Focus on Local? Gemini's New Map tool… I just tested it out: Results", "帖文节选｜Dataset note from Ahrefs: 66.6M responses"])
    await translator.translate({ ...textInput, title: text });
  assert.deepEqual(calls.filter(call => call.text !== null).map(call => call.text), ["New on my Substack: GEO research", "Focus on Local? Gemini's New Map tool… I just tested it out: Results", "Dataset note from Ahrefs: 66.6M responses"]);
  assert.equal(geoTranslationPrefix("帖文节选｜r/SEO: AI search"), "帖文节选｜r/SEO: ");
  assert.equal(geoTranslationPrefix("帖文节选｜@author.bsky.social：AI search"), "帖文节选｜@author.bsky.social：");
  translator.dispose();
});

test("source-conditioned glossary repairs real domain mistranslations and preserves all other text", () => {
  const cases: Array<[string, string, string]> = [
    ["How Gemini searches and chooses its citations", "双子座如何搜索并选择其引用", "Gemini如何搜索并选择其引用"],
    ["Generative Engine Optimization (GEO) for Academic Journals", "学术期刊的生成引擎优化（GEO）", "学术期刊的生成式引擎优化（GEO）"],
    ["How ChatGPT Does Query Fan-Out (15 Million Queries Studied)", "ChatGPT 如何执行查询分发（研究了 1500 万次查询）", "ChatGPT 如何执行查询扇出（研究了 1500 万次查询）"],
    ["Bing lists grounding queries", "必应列出基础查询", "必应列出用于检索依据的查询"],
    ["organic search is one of the highest-value channels", "天然搜索是价值最高的渠道之一", "自然搜索是价值最高的渠道之一"],
    ["A recent manual action caused a drop in Google AI Overviews", "最近的一次人工操作导致 Google AI 概览下降", "最近的一次人工处置措施导致 Google AI 概览下降"],
    ["GEO plans for ChatGPT", "ChatGPT 的地理计划", "ChatGPT 的GEO计划"],
    ["Increasing Importance of Geo vs. SEO", "地理位置相对于 SEO 的日益重要性", "GEO相对于 SEO 的日益重要性"],
    ["Google Discover changes", "Google 发现发生变化", "Google 探索发生变化"],
    ["Google AI Overviews et les Aperçus IA", "Google AI概述和AI预览", "Google AI 概览和AI 概览"],
    ["Introducing Topics Portfolio (Beta) in AI Performance", "在 AI 性能中推出主题组合（测试版）", "在 AI Performance中推出Topics Portfolio（测试版）"],
    ["Topics Portfolio shows Topic Size, Sites Cited, and Queries", "主题组合显示主题规模、引用该主题的网站和查询", "Topics Portfolio显示主题规模、被引用网站数和查询"],
  ];
  for (const [source, before, after] of cases) {
    const input = { title: source, summary: null }, output = { title: before, summary: null, provider: "bing" };
    assert.equal(normalizeGeoTranslation(input, output).title, after, source);
    assert.deepEqual(normalizeGeoTranslation(input, normalizeGeoTranslation(input, output)), normalizeGeoTranslation(input, output), "repair is idempotent");
    assert.equal(needsTranslationUpgrade(input, output), false, "terminology repair needs no network request");
  }
});

test("glossary excludes substrings, ordinary meanings, URLs and correctly preserved brands", () => {
  for (const source of ["Gemini constellation in the zodiac", "Perplexity is a model loss metric", "Discover the research", "Geographic SEO and GEO", "GEO alone", "geometry and Geminiature search", "https://example.org/Gemini/GEO/organic-search"]) {
    const output = { title: "双子座 地理信息 困惑度 发现 天然搜索", summary: null };
    assert.deepEqual(normalizeGeoTranslation({ title: source, summary: null }, output), output, source);
  }
  const input = { title: "Gemini searches Google, cites 42% of 1,000 pages. https://example.org/双子座/GEO", summary: "GEO search geography" };
  const output = { title: "双子座搜索谷歌，引用了1,000页中的42%。 https://example.org/双子座/GEO @双子座 `双子座`", summary: "GEO搜索地理信息" };
  const corrected = normalizeGeoTranslation(input, output);
  assert.match(corrected.title, /^Gemini搜索/); assert.match(corrected.title, /@双子座/);
  assert.match(corrected.title, /https:\/\/example.org\/双子座\/GEO/);
  assert.match(corrected.title, /`双子座`/); assert.match(corrected.title, /1,000/); assert.match(corrected.title, /42%/);
  assert.equal(corrected.summary, output.summary);
  const unchanged = { title: "Gemini 研究 AI Mode 和 AI 概览", summary: "  原文格式\n 保持不变。" };
  assert.deepEqual(normalizeGeoTranslation({ title: "Gemini research AI Mode and AI Overviews", summary: "ordinary text" }, unchanged), unchanged);
  assert.deepEqual(geoTranslationGlossary("https://example.org/GEO"), []);
  assert.equal(normalizeGeoTranslation({ title: "AI agent for GEO", summary: null }, { title: "用于地理分析的AI代理", summary: null }).title, "用于地理分析的AI代理", "ambiguous compounds require review, not partial substitution");
});

test("upgrade signals distinguish cached term repair, untranslated prose and invented years", () => {
  const input = { title: "帖文节选｜Dataset note from Ahrefs: 66.6M responses", summary: "We studied queries from August and September." };
  assert.deepEqual(geoTranslationIssues(input, { title: "帖文节选｜Dataset note from Ahrefs: 6660万回复", summary: "我们研究了2023年8月和9月的查询。" }), ["untranslated-prefix", "invented-year"]);
  assert.equal(needsTranslationUpgrade(input, { title: "帖文节选｜Ahrefs 数据集说明：6660万回复", summary: "我们研究了8月和9月的查询。" }), false);
  assert.equal(needsTranslationUpgrade({ title: "帖文节选｜@author: GEO search", summary: null }, { title: "帖文节选｜@author: GEO 搜索", summary: null }), false);
  assert.equal(needsTranslationUpgrade({ title: "帖文节选｜Perplexity SEO: cited pages", summary: null }, { title: "帖文节选｜Perplexity SEO: 被引用的页面", summary: null }), false);
  assert.deepEqual(geoTranslationIssues({ title: "2026 AI study", summary: "We counted 2,023 pages and 42%." }, { title: "2026年AI研究", summary: "我们统计了2023个页面和42%。" }), []);
  assert.deepEqual(geoTranslationIssues({ title: "AI in 2026.", summary: "Aug-Sept 2026, measured 42%." }, { title: "2026年的AI", summary: "2026年8月至9月，测得42%。" }), []);
});

test("new mistranslations are normalized and content errors do not cool down other items", async () => {
  const { translator, calls } = fixture((url, _options, source) => response(url, payload(source.includes("August") ? "2023年8月的查询" : "双子座搜索谷歌")));
  const good = await translator.translate({ ...textInput, title: "Gemini searches Google" });
  assert.equal(good.title, "Gemini搜索谷歌");
  await assert.rejects(translator.translate({ ...textInput, title: "Queries from August" }), error => error instanceof BingContentTranslationError && error.kind === "invalid" && !("retryAfterMs" in error));
  await translator.translate({ ...textInput, title: "Gemini searches citations" });
  assert.equal(calls.filter(call => call.options.method === "POST").length, 3);
  translator.dispose();
});
