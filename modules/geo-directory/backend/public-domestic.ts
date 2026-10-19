import * as cheerio from "cheerio";
import { guardedFetch, type GuardedResponse } from "@aihot/backend/lib/http-fetch";
import { collapseWhitespace } from "@aihot/backend/lib/text";
import { FetchError, type Candidate, type SourceRow } from "@aihot/backend/sources/types";

export type PublicDomesticFetch = (url: string) => Promise<GuardedResponse>;

/** A public Sogou result link, not an account/API token. Never fetch it automatically. */
export function sogouWeixinResultUrl(input: string, base = "https://weixin.sogou.com/"): string | null {
  try {
    const url = new URL(input, base);
    if (url.origin !== "https://weixin.sogou.com" || url.pathname !== "/link" || url.username || url.password || url.hash) return null;
    const keys = [...url.searchParams.keys()];
    if (keys.some(key => !["url", "type", "query", "token"].includes(key)) || new Set(keys).size !== keys.length) return null;
    if (!/^[\w.-]{20,2048}$/.test(url.searchParams.get("url") ?? "") || url.searchParams.get("type") !== "2") return null;
    if (!/^[a-f0-9]{32,128}$/i.test(url.searchParams.get("token") ?? "") || (url.searchParams.get("query")?.length ?? 0) > 300) return null;
    return url.href;
  } catch { return null; }
}

/** Search-index excerpts only: no article traversal, cookies or challenge-script execution. */
export function parseSogouWeixinIndex(html: string, listingUrl: string): Candidate[] {
  const $ = cheerio.load(html);
  const items = $(".news-list > li");
  if (!items.length && /验证码|访问异常|antispider|captcha/i.test($("title").text() + $("body").text())) throw new FetchError("public search index verification required");
  if (!items.length && !/相关微信公众号文章|以下内容来自微信公众平台/.test($("title").text() + $("body").text())) throw new FetchError("public search index format mismatch");
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  items.each((_, element) => {
    const item = $(element), link = item.find("h3 a").first();
    const url = sogouWeixinResultUrl(link.attr("href") ?? "", listingUrl);
    const title = collapseWhitespace(link.text());
    if (!url || !title) return;
    const metadata = item.find(".s-p").first().clone();
    const seconds = /\btimeConvert\(\s*['"](\d{10})['"]\s*\)/.exec(metadata.html() ?? "")?.[1];
    metadata.find("script, style").remove();
    const author = collapseWhitespace(metadata.text()) || null;
    const publishedAt = seconds ? new Date(Number(seconds) * 1000) : null;
    const excerptNode = item.find(".txt-info").first().clone(); excerptNode.find("script, style").remove();
    const snippet = collapseWhitespace(excerptNode.text());
    const identity = JSON.stringify([author, title, seconds ?? null]);
    if (seen.has(identity)) return;
    seen.add(identity);
    candidates.push({ url, title, author, language: "zh", publishedAt,
      excerpt: `公众号：${author ?? "未标注"}。搜狗公开索引摘要${snippet ? `：${snippet}` : "。"}`,
      bodyStatus: "none", raw: { publicDomestic: "sogou-weixin-index", indexedPlatform: "wechat", dateBasis: seconds ? "index-timeConvert-epoch" : "unknown", publicIndexIdentity: identity, listingUrl },
    });
  });
  if (items.length && !candidates.length) throw new FetchError("public search index result format mismatch");
  return candidates;
}

const fetchPublic: PublicDomesticFetch = url => guardedFetch(url, { timeoutMs: 20_000, maxBytes: 2 * 1024 * 1024, headers: { accept: "text/html", "accept-language": "zh-CN,zh;q=0.9" } });

export async function fetchSogouWeixinIndex(source: Pick<SourceRow, "kind" | "config">, fetcher: PublicDomesticFetch = fetchPublic): Promise<Candidate[]> {
  const url = new URL(String(source.config.url ?? ""));
  if (source.kind !== "web_list" || url.origin !== "https://weixin.sogou.com" || url.pathname !== "/weixin" || url.username || url.password || url.hash || url.searchParams.get("type") !== "2") throw new FetchError("invalid public Sogou index configuration");
  const allowed = new Set(["type", "query", "ie", "tsn", "page"]);
  if ([...url.searchParams.keys()].some(key => !allowed.has(key)) || !url.searchParams.get("query")) throw new FetchError("invalid public Sogou index query");
  const response = await fetcher(url.href);
  if (response.status < 200 || response.status >= 300) throw new FetchError("public Sogou index read failed", response.status);
  if (new URL(response.url).origin !== url.origin || new URL(response.url).pathname !== "/weixin") throw new FetchError("public search index verification required");
  return parseSogouWeixinIndex(response.text(), response.url);
}

/** A site: query is not proof of provenance; require each item's declared publisher domain. */
export function parseZhihuGoogleNewsIndex(xml: string): Candidate[] {
  const $ = cheerio.load(xml, { xml: true });
  if (!$("rss > channel").length) throw new FetchError("public news index RSS format mismatch");
  const result = new Map<string, Candidate>();
  $("item").each((_, element) => {
    const item = $(element), publisher = item.find("source").first();
    const publisherUrl = publisher.attr("url");
    let url: URL, origin: URL;
    try { url = new URL(item.find("link").first().text()); origin = new URL(publisherUrl ?? ""); } catch { return; }
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.port || !["zhihu.com", "www.zhihu.com", "zhuanlan.zhihu.com"].includes(origin.hostname)) return;
    if (url.origin !== "https://news.google.com" || url.username || url.password || !/^\/(?:rss\/)?articles\/[A-Za-z0-9_-]+$/.test(url.pathname) || [...url.searchParams.keys()].some(key => key !== "oc")) return;
    const title = collapseWhitespace(item.find("title").first().text());
    if (!title) return;
    const dateText = item.find("pubDate").first().text().trim();
    const date = /(?:GMT|UTC|[+-]\d{4})$/.test(dateText) ? new Date(dateText) : null;
    const publishedAt = date && Number.isFinite(date.getTime()) ? date : null;
    const description = cheerio.load(item.find("description").first().text()); description("script,style").remove();
    const excerpt = collapseWhitespace(description.root().text());
    result.set(url.href, { url: url.href, title, language: "zh", excerpt: `Google News 收录的${publisher.text() || "知乎"}条目${excerpt ? `：${excerpt}` : "。"}`, publishedAt, bodyStatus: "none", raw: { publicDomestic: "google-news-zhihu-index", indexedPlatform: "zhihu", publisherName: publisher.text() || "知乎", publisherUrl: origin.href, dateBasis: publishedAt ? "index-pubDate" : "unknown" } });
  });
  return [...result.values()];
}

export async function fetchZhihuGoogleNewsIndex(source: Pick<SourceRow, "kind" | "config">, fetcher: PublicDomesticFetch = fetchPublic): Promise<Candidate[]> {
  const url = new URL(String(source.config.feedUrl ?? ""));
  if (source.kind !== "rss" || url.origin !== "https://news.google.com" || url.pathname !== "/rss/search" || url.username || url.password || url.hash || !/\bsite:zhihu\.com\b/.test(url.searchParams.get("q") ?? "") || [...url.searchParams.keys()].some(key => !["q", "hl", "gl", "ceid"].includes(key))) throw new FetchError("invalid public Zhihu news index configuration");
  const response = await fetcher(url.href);
  if (response.status < 200 || response.status >= 300) throw new FetchError("public news index read failed", response.status);
  if (new URL(response.url).origin !== url.origin) throw new FetchError("public news index format mismatch");
  return parseZhihuGoogleNewsIndex(response.text());
}
