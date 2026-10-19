import { readFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { z } from "zod";
import { REPO_ROOT } from "@aihot/backend/config";
import { guardedFetch, type GuardedResponse } from "@aihot/backend/lib/http-fetch";
import { collapseWhitespace, stripTags, truncate } from "@aihot/backend/lib/text";
import { fetchRss } from "@aihot/backend/sources/rss";
import { FetchError, type Candidate } from "@aihot/backend/sources/types";
import { publicSourceIssue, safePublicUrl, type PublicSource } from "./public-source.ts";
import { publicImageUrl } from "./public-image.ts";

export type PublicSocialPlatform = "x" | "reddit";
const discoverySchema = z.object({
  kind: z.enum(["rss", "html"]), url: z.string().url(),
  articleSelector: z.string().max(250).optional(), articlePathPrefix: z.string().optional(),
  maxArticlePages: z.number().int().min(0).max(10).default(0),
  articleRefreshHours: z.number().int().min(6).max(720).optional(),
}).strict();
const sourceSchema = z.object({
  id: z.string().regex(/^public-(?:x|reddit)-[a-z0-9-]+$/), name: z.string().min(1).max(200),
  platform: z.enum(["x", "reddit"]), url: z.string().url(), enabled: z.boolean(),
  seedUrls: z.array(z.string().url()), discovery: z.array(discoverySchema),
  maxPostsPerRun: z.number().int().min(1).max(40).default(12),
  refreshHours: z.number().int().min(6).max(720).default(168),
}).strict();
export type PublicSocialSource = z.infer<typeof sourceSchema>;
export type PublicSocialDiscovery = z.infer<typeof discoverySchema>;
export type PublicSocialFetch = (url: string) => Promise<GuardedResponse>;
export interface PublicSocialLink { url: string; discoveredFrom: string }
export interface PublicSocialDiscoveryResult { links: PublicSocialLink[]; articles: string[] }

/** Only canonical public post URLs; never login/search routes, redirectors or account credentials. */
export function publicSocialUrl(input: string, platform?: PublicSocialPlatform): string | null {
  const safe = safePublicUrl(input);
  if (!safe) return null;
  const u = new URL(safe);
  if (u.protocol !== "https:" || u.port) return null;
  const host = u.hostname.replace(/^www\./, "");
  if ((!platform || platform === "x") && ["x.com", "twitter.com"].includes(host)) {
    const match = /^\/([a-z0-9_]{1,15})\/status\/(\d{5,25})(?:\/.*)?$/i.exec(u.pathname);
    if (match) return `https://x.com/${match[1].toLowerCase()}/status/${match[2]}`;
  }
  if ((!platform || platform === "reddit") && ["reddit.com", "old.reddit.com"].includes(host)) {
    const match = /^\/r\/([a-z0-9_]{1,21})\/comments\/([a-z0-9]{3,16})(?:\/.*)?$/i.exec(u.pathname);
    if (match) return `https://www.reddit.com/r/${match[1].toLowerCase()}/comments/${match[2].toLowerCase()}/`;
  }
  return null;
}

export async function loadPublicSocialSources(): Promise<PublicSocialSource[]> {
  const pack = z.object({ schemaVersion: z.literal(1), sources: z.array(sourceSchema) }).strict().parse(JSON.parse(await readFile(path.join(REPO_ROOT, "industry/public-social.json"), "utf8")));
  const ids = new Set<string>();
  for (const source of pack.sources) {
    if (ids.has(source.id) || !safePublicUrl(source.url) || source.seedUrls.some(url => !publicSocialUrl(url, source.platform))) throw new Error("公开社交来源配置无效");
    ids.add(source.id);
    const discoveryUrls = new Set<string>();
    for (const entry of source.discovery) {
      if (discoveryUrls.has(entry.url)) throw new Error("公开社交发现入口重复");
      discoveryUrls.add(entry.url);
      if (publicSourceIssue({ kind: entry.kind === "rss" ? "rss" : "web_list", config: entry.kind === "rss" ? { feedUrl: entry.url } : { url: entry.url } })) throw new Error("公开社交发现入口不是公开免密钥网页");
      if (entry.maxArticlePages && ((entry.kind === "html" && !entry.articleSelector) || !entry.articlePathPrefix?.startsWith("/"))) throw new Error("文章发现须指定同站路径范围；HTML 入口还须指定选择器");
    }
  }
  return pack.sources.filter(source => source.enabled);
}

export function socialPublicationSource(source: PublicSocialSource): PublicSource {
  // This is only the module's publication metadata. It is never installed as a main-pipeline source.
  return { id: source.id, name: source.name, kind: "external", config: {}, tier: "T2", participation_mode: "editorial", first_party: false, interval_minutes: 30, enabled: source.enabled, cursor: null, fail_count: 0, sourceUrl: source.url, languageHint: null, geoFocused: true };
}

export function socialLinksInHtml(html: string, platform: PublicSocialPlatform): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a[href]").each((_, element) => { const url = publicSocialUrl($(element).attr("href") ?? "", platform); if (url) links.add(url); });
  // Some feeds expose a plain-text original URL instead of an anchor.
  for (const match of stripTags(html).matchAll(/https:\/\/[^\s<>"']+/g)) { const url = publicSocialUrl(match[0].replace(/[),.;]+$/, ""), platform); if (url) links.add(url); }
  return [...links];
}

const fetchPublic: PublicSocialFetch = url => guardedFetch(url, { timeoutMs: 20_000, maxBytes: 4 * 1024 * 1024, headers: { accept: "application/json,text/html,application/rss+xml", "accept-language": "en" } });
async function readPublic(url: string, fetcher: PublicSocialFetch): Promise<GuardedResponse> {
  const response = await fetcher(url);
  if (response.status < 200 || response.status >= 300) throw new FetchError("public social read failed", response.status);
  return response;
}

/** Article identity preserves the host/path scope and removes only known tracking parameters. */
export function publicSocialArticleUrl(input: string, entry: PublicSocialDiscovery): string | null {
  if (!entry.maxArticlePages || !entry.articlePathPrefix) return null;
  try {
    const base = new URL(entry.url), url = new URL(input, base);
    if (!safePublicUrl(url.href) || url.origin !== base.origin || !url.pathname.startsWith(entry.articlePathPrefix)) return null;
    if (/(?:^|\/)(?:login|signin|sign-in|auth|account)(?:\/|$)/i.test(url.pathname)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || /^(?:fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    return url.href === base.href ? null : url.href;
  } catch { return null; }
}

/** Read one public index only. All scoped article links become durable work in the collector. */
export async function discoverPublicSocial(entry: PublicSocialDiscovery, platform: PublicSocialPlatform, fetcher: PublicSocialFetch = fetchPublic, rssReader = fetchRss): Promise<PublicSocialDiscoveryResult> {
  const links = new Map<string, string>();
  const articles = new Set<string>();
  const add = (html: string, from: string) => { for (const url of socialLinksInHtml(html, platform)) if (!links.has(url)) links.set(url, from); };
  if (entry.kind === "rss") {
    const source: PublicSource = { ...socialPublicationSource({ id: "public-x-discovery", name: "Public discovery", platform: "x", url: entry.url, enabled: true, seedUrls: [], discovery: [], maxPostsPerRun: 1, refreshHours: 168 }), kind: "rss", config: { feedUrl: entry.url } };
    const result = await rssReader(source, { allowUpdatedAsPublished: false });
    for (const candidate of result.candidates) {
      add(`${candidate.bodyHtml ?? ""}\n${candidate.excerpt ?? ""}\n${candidate.bodyText ?? ""}`, safePublicUrl(candidate.url) ?? entry.url);
      const original = publicSocialUrl(candidate.url, platform);
      if (original) links.set(original, entry.url);
      const article = publicSocialArticleUrl(candidate.url, entry);
      if (article) articles.add(article);
    }
  } else {
    const response = await readPublic(entry.url, fetcher);
    const html = response.text(); add(html, entry.url);
    if (entry.articleSelector && entry.articlePathPrefix && entry.maxArticlePages) {
      const $ = cheerio.load(html);
      $(entry.articleSelector).each((_, element) => {
        const href = $(element).attr("href");
        const article = href ? publicSocialArticleUrl(href, entry) : null;
        if (article) articles.add(article);
      });
    }
  }
  return { links: [...links].map(([url, discoveredFrom]) => ({ url, discoveredFrom })), articles: [...articles] };
}

export async function readPublicSocialArticle(url: string, entry: PublicSocialDiscovery, platform: PublicSocialPlatform, fetcher: PublicSocialFetch = url => guardedFetch(url, { timeoutMs: 20_000, maxBytes: 4 * 1024 * 1024, redirectPolicy: "same-origin", headers: { accept: "text/html" } })): Promise<PublicSocialLink[]> {
  if (publicSocialArticleUrl(url, entry) !== url) throw new FetchError("public article outside discovery scope");
  const response = await readPublic(url, fetcher);
  if (!publicSocialArticleUrl(response.url, entry)) throw new FetchError("public article redirected outside discovery scope");
  const html = response.text();
  if (cheerio.load(html)("input[type='password']").length) throw new FetchError("public article requires login");
  return socialLinksInHtml(html, platform).map(post => ({ url: post, discoveredFrom: url }));
}

/** The public checksum used by X's embed endpoint, as implemented by vercel/react-tweet.
 * It is derived entirely from the public post ID; no account token, cookie or API key is read. */
export function xSyndicationUrl(id: string): string {
  if (!/^\d{5,25}$/.test(id)) throw new Error("无效的 X 帖子 ID");
  const url = new URL("https://cdn.syndication.twimg.com/tweet-result");
  url.searchParams.set("id", id); url.searchParams.set("lang", "en");
  url.searchParams.set("token", ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ""));
  return url.href;
}

export function xPublicCandidate(input: unknown, originalUrl: string): Candidate {
  const data = z.object({ __typename: z.literal("Tweet"), id_str: z.string(), text: z.string().min(1), created_at: z.string(), lang: z.string().optional(), user: z.object({ screen_name: z.string().regex(/^[a-z0-9_]{1,15}$/i) }) }).passthrough().safeParse(input);
  const id = originalUrl.split("/").at(-1);
  if (!data.success || data.data.id_str !== id) throw new FetchError("public post unavailable or format mismatch");
  const post = data.data, date = new Date(post.created_at);
  if (!/Z$|[+-]\d\d:\d\d$/.test(post.created_at) || !Number.isFinite(date.getTime())) throw new FetchError("public post date parse failed");
  const text = collapseWhitespace(stripTags(post.text));
  // Public own-post photos, matching react-tweet's TweetPhoto contract. Never borrow an avatar/quoted tweet.
  const photos = z.array(z.object({ url: z.string(), width: z.number().positive(), height: z.number().positive() })).safeParse(post.photos);
  const media: Candidate["media"] = photos.success ? photos.data.slice(0, 4).flatMap(photo => {
    const url = publicImageUrl(photo.url, originalUrl, photo.width, photo.height);
    return url ? [{ kind: "image" as const, url, width: photo.width, height: photo.height }] : [];
  }) : [];
  // Keep the returned public text in memory for relevance matching; toPublicCandidates
  // applies the short, sentence-aware excerpt boundary after checking the whole candidate.
  return { url: `https://x.com/${post.user.screen_name.toLowerCase()}/status/${id}`, title: `帖文节选｜@${post.user.screen_name}：${truncate(text, 160)}`, excerpt: text, publishedAt: date, language: post.lang ?? null, author: `@${post.user.screen_name}`, media, raw: { titleIsExcerpt: true, publicSocial: "x-syndication", dateBasis: "created_at" } };
}

export function redditPublicCandidate(html: string, originalUrl: string): Candidate {
  const $ = cheerio.load(html);
  const id = /\/comments\/([a-z0-9]+)\//.exec(originalUrl)?.[1];
  if (!id) throw new FetchError("invalid public Reddit post URL");
  const wrapper = $(`[id='t3_${id}-embed-wrapper']`);
  const title = collapseWhitespace(wrapper.find("h1, shreddit-embed-title").first().text());
  const header = wrapper.find("[data-testid='embed-header']");
  const timestamp = header.find("faceplate-timeago[ts]").first().attr("ts");
  const date = timestamp ? new Date(timestamp) : null;
  const linked = publicSocialUrl(wrapper.find(`embed-event-handler[id='t3_${id}']`).attr("link") ?? "", "reddit") === originalUrl;
  let metadataMatches = false;
  $("shreddit-screenview-data[data]").each((_, element) => {
    try { const data = JSON.parse($(element).attr("data")!); if (data.post?.id === `t3_${id}` && data.post.created_timestamp === date?.getTime()) metadataMatches = true; } catch { /* Require valid metadata for the target post. */ }
  });
  if (!title || !linked || !metadataMatches || !date || !Number.isFinite(date.getTime())) throw new FetchError("public Reddit embed format or date parse failed");
  const excerpt = collapseWhitespace(wrapper.find(`[id='t3_${id}-post-rtjson-content'], .md, [slot='text-body']`).first().text());
  let author: string | null = null;
  header.find("a[href]").each((_, element) => {
    try { const u = new URL($(element).attr("href")!); const name = /^\/user\/([a-z0-9_-]+)\/?$/i.exec(u.pathname)?.[1]; if (u.hostname === "www.reddit.com" && name) author = `u/${name}`; } catch { /* Not a public author link. */ }
  });
  return { url: originalUrl, title, author, excerpt: excerpt || null, publishedAt: date, raw: { publicSocial: "reddit-embed", dateBasis: "target-post-header + created_timestamp" } };
}

export async function readPublicSocialPost(input: string, platform: PublicSocialPlatform, fetcher: PublicSocialFetch = fetchPublic): Promise<Candidate> {
  const url = publicSocialUrl(input, platform);
  if (!url) throw new FetchError("invalid public social post URL");
  if (platform === "x") {
    const response = await readPublic(xSyndicationUrl(url.split("/").at(-1)!), fetcher);
    let data: unknown; try { data = JSON.parse(response.text()); } catch { throw new FetchError("public X embed is not JSON"); }
    return xPublicCandidate(data, url);
  }
  const embed = new URL(url); embed.hostname = "embed.reddit.com";
  return redditPublicCandidate((await readPublic(embed.href, fetcher)).text(), url);
}
