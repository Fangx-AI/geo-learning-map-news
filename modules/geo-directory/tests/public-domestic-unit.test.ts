import test from "node:test";
import assert from "node:assert/strict";
import { fetchSogouWeixinIndex, parseSogouWeixinIndex, sogouWeixinResultUrl, parseZhihuGoogleNewsIndex, fetchZhihuGoogleNewsIndex } from "../backend/public-domestic.ts";
import { toPublicCandidates, type PublicSource } from "../backend/public-source.ts";

const listing = "https://weixin.sogou.com/weixin?type=2&query=GEO";
const result = "/link?url=public-result-opaque-id-1234567890&type=2&query=GEO&token=0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";
const item = `<li><h3><a href="${result}">GEO &amp; 引用研究</a></h3><p class="txt-info">公开摘要，不是全文</p><div class="s-p"><span>研究公众号</span><script>document.write(timeConvert('1791690741'))</script></div></li>`;
const page = `<title>GEO的相关微信公众号文章</title><ul class="news-list">${item}${item}</ul>`;

test("keeps index attribution and explicit epoch date without executing scripts or reading articles", async () => {
  let calls = 0;
  const found = await fetchSogouWeixinIndex({ kind: "web_list", config: { url: listing } }, async url => {
    calls++; assert.equal(url, listing);
    return { status: 200, url, headers: new Headers(), body: Buffer.from(page), text: () => page };
  });
  assert.equal(calls, 1); assert.equal(found.length, 1);
  assert.equal(found[0].title, "GEO & 引用研究"); assert.equal(found[0].author, "研究公众号");
  assert.equal(found[0].publishedAt?.toISOString(), "2026-10-11T03:52:21.000Z");
  assert.equal(found[0].bodyStatus, "none"); assert.match(found[0].excerpt!, /搜狗公开索引摘要/);
  assert.ok(found[0].url.startsWith("https://weixin.sogou.com/link?"));
  assert.equal(found[0].bodyHtml, undefined);
});

test("does not invent dates from snippet text or today's collection time", () => {
  const found = parseSogouWeixinIndex(page.replaceAll("<script>document.write(timeConvert('1791690741'))</script>", "今天 12:30"), listing);
  assert.equal(found[0].publishedAt, null);
});

test("only accepts the exact public index redirect shape; credentials and other hosts remain invalid", () => {
  assert.ok(sogouWeixinResultUrl(result));
  for (const input of [result + "&cookie=value", result + "&token=duplicate", result.replace("type=2", "type=1"), "https://evil.example" + result, "https://user:pass@weixin.sogou.com" + result, "/link?url=https://127.0.0.1&token=secret", result + "#fragment"]) assert.equal(sogouWeixinResultUrl(input), null, input);
});

test("verification pages and unexpected pages fail visibly; empty normal search results stay empty", async () => {
  assert.throws(() => parseSogouWeixinIndex("<title>搜狗验证码</title><body>需要您协助验证</body>", listing), /verification/);
  assert.throws(() => parseSogouWeixinIndex("<title>Login</title>", listing), /format/);
  assert.throws(() => parseSogouWeixinIndex('<ul class="news-list"><li><h3>Links changed</h3></li></ul>', listing), /format/);
  assert.deepEqual(parseSogouWeixinIndex("<title>GEO的相关微信公众号文章</title><p>暂无结果</p>", listing), []);
  await assert.rejects(fetchSogouWeixinIndex({ kind: "web_list", config: { url: listing + "&cookie=bad" } }, async () => { throw new Error("must not fetch"); }), /configuration|query/);
});

test("refreshing a public index token updates its link without creating another article", () => {
  const source: PublicSource = { id: "web-wechat-sogou-geo", name: "搜狗微信 · GEO 公开索引", kind: "web_list", config: { url: listing }, tier: "T2", participation_mode: "hot_signal", first_party: false, interval_minutes: 180, enabled: true, cursor: null, fail_count: 0, sourceUrl: listing, languageHint: "zh", geoFocused: true };
  const first = toPublicCandidates(parseSogouWeixinIndex(page, listing), source);
  const second = toPublicCandidates(parseSogouWeixinIndex(page.replaceAll("0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF", "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789"), listing), source);
  assert.equal(first.length, 1); assert.equal(second.length, 1);
  assert.notEqual(first[0].url, second[0].url);
  assert.equal(first[0].canonicalId, second[0].canonicalId); assert.equal(first[0].id, second[0].id);
});

const newsItem = (publisher = "https://zhuanlan.zhihu.com") => `<item><title>GEO 引用研究 - 知乎专栏</title><link>https://news.google.com/rss/articles/CBMiFakePublicId?oc=5</link><source url="${publisher}">知乎专栏</source><pubDate>Wed, 14 Oct 2026 09:05:00 GMT</pubDate><description><![CDATA[<a href="https://example.com">摘要</a>]]></description></item>`;
const newsFeed = (body: string) => `<rss version="2.0"><channel>${body}</channel></rss>`;

test("Zhihu attribution requires the actual RSS publisher domain, not the title or site query", () => {
  const found = parseZhihuGoogleNewsIndex(newsFeed(newsItem() + newsItem("https://not-zhihu.example") + newsItem("https://zhihu.com.evil.example")));
  assert.equal(found.length, 1); assert.equal(found[0].publishedAt?.toISOString(), "2026-10-14T09:05:00.000Z");
  assert.match(found[0].excerpt!, /Google News 收录的知乎专栏条目/);
  assert.ok(found[0].url.startsWith("https://news.google.com/")); assert.equal(found[0].bodyStatus, "none");
  assert.deepEqual(parseZhihuGoogleNewsIndex(newsFeed(newsItem("https://not-zhihu.example"))), []);
  assert.throws(() => parseZhihuGoogleNewsIndex("<html>verify</html>"), /format/);
});

test("news-index dates remain unknown without a declared timezone and only the configured public feed is fetched", async () => {
  const xml = newsFeed(newsItem()).replace("Wed, 14 Oct 2026 09:05:00 GMT", "2026-10-14 09:05:00");
  assert.equal(parseZhihuGoogleNewsIndex(xml)[0].publishedAt, null);
  let calls = 0;
  const url = "https://news.google.com/rss/search?q=site%3Azhihu.com+GEO&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans";
  const items = await fetchZhihuGoogleNewsIndex({ kind: "rss", config: { feedUrl: url } }, async requested => {
    calls++; assert.equal(requested, url);
    return { status: 200, url, headers: new Headers(), body: Buffer.from(xml), text: () => xml };
  });
  assert.equal(calls, 1); assert.equal(items.length, 1);
});
