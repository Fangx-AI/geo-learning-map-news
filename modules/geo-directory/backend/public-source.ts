import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { normalizeUrl } from "@aihot/backend/lib/url";
import { collapseWhitespace, stripTags } from "@aihot/backend/lib/text";
import type { Candidate, SourceRow } from "@aihot/backend/sources/types";
import { inferLanguage, matchGeoTerms, matchPaperTerms } from "./relevance.ts";
import { sogouWeixinResultUrl } from "./public-domestic.ts";
import { candidateImage, type PublicImageOrigin } from "./public-image.ts";
import { makePublicSummary, summaryPlainText, type PublicSummaryOrigin } from "./public-summary.ts";

export interface PublicSource extends SourceRow { sourceUrl: string; languageHint: string | null; geoFocused?: boolean; publicEntryIdentity?: "feed-id"; publicDatePrecision?: "day" }
export interface PublicCandidate {
  id: string; canonicalId: string; title: string; url: string; summary: string | null;
  sourceId: string; sourceName: string; sourceUrl: string; language: string;
  publishedAt: Date | null; matchedTerms: string[];
  publisherName?: string | null; publisherUrl?: string | null;
  imageUrl?: string | null; imageOrigin?: PublicImageOrigin | null;
  summaryRaw?: string | null; summaryVersion?: number; summaryOrigin?: PublicSummaryOrigin | null; summarySourceUrl?: string | null;
}
const SECRET_PARAMETER = /(?:token|secret|password|cookie|session|authorization|api[_-]?key)/i;
const PAID_HOST = /(?:^|\.)(?:jina\.ai|socialdata\.tools|dajiala\.com)$/i;

function publicWechatIndexLink(u: URL): boolean {
  // Sogou publishes this redirect token in anonymous search result anchors. It is an
  // article-link parameter, not a user's credential. No other token-bearing URL is allowed.
  return sogouWeixinResultUrl(u.href) !== null;
}

/** Syntactic check only. The shared fetcher also validates DNS and each connection/redirect. */
export function safePublicUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  try {
    const u = new URL(input);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || isIP(u.hostname) || !u.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal)$/.test(u.hostname)) return null;
    if ([...u.searchParams.keys()].some(key => SECRET_PARAMETER.test(key)) && !publicWechatIndexLink(u)) return null;
    return u.href;
  } catch { return null; }
}

/** Only ordinary public GET listings; never credentials, paid readers, platform login or model calls. */
export function publicSourceIssue(source: Pick<PublicSource, "kind" | "config" | "publicEntryIdentity" | "publicDatePrecision">): string | null {
  if (!["rss", "web_list", "json_list"].includes(source.kind)) return "此采集类型不属于公开免密钥模式";
  if (source.publicEntryIdentity !== undefined && (source.kind !== "rss" || source.publicEntryIdentity !== "feed-id")) return "公开条目标识仅支持 RSS/Atom 的 feed-id 模式";
  if (source.publicDatePrecision !== undefined && (source.kind !== "web_list" || source.publicDatePrecision !== "day")) return "公开列表日期精度仅支持网页列表的 day 模式";
  const address = source.kind === "rss" ? source.config.feedUrl : source.config.url;
  const url = safePublicUrl(address);
  if (!url) return "信源地址不是无凭据的公开 HTTP(S) 地址";
  if (PAID_HOST.test(new URL(url).hostname)) return "公开模式跳过付费或凭据型采集服务";
  if (String(source.config.method ?? "GET").toUpperCase() !== "GET" || source.config.bodyJson !== undefined) return "公开模式仅允许无请求正文的 GET 列表";
  const allowedHeaders = new Set(["accept", "accept-language", "user-agent", "cache-control"]);
  if (source.config.headers && Object.keys(source.config.headers).some(key => !allowedHeaders.has(key.toLowerCase()))) return "公开模式不读取认证或自定义凭据请求头";
  return null;
}

export function toPublicCandidates(candidates: Candidate[], source: PublicSource, now = Date.now()): PublicCandidate[] {
  const found = new Map<string, PublicCandidate>();
  for (const candidate of candidates) {
    const url = safePublicUrl(candidate.url);
    if (!url) continue;
    const canonical = normalizeUrl(url);
    if (!canonical) continue;
    const title = collapseWhitespace(stripTags(candidate.title ?? "")).slice(0, 600);
    const raw = candidate.raw && typeof candidate.raw === "object" ? candidate.raw as Record<string, unknown> : {};
    const summaryText = typeof raw.summaryOriginalText === "string" ? raw.summaryOriginalText : candidate.excerpt || candidate.bodyText || "";
    const suppliedSummary = summaryPlainText(summaryText);
    if (!title) continue;
    const matchedTerms = /^https?:\/\/(?:export\.)?arxiv\.org\//.test(url) ? matchPaperTerms(title, suppliedSummary) : matchGeoTerms(`${title}\n${suppliedSummary}`);
    if (!matchedTerms.length && source.geoFocused && /\b(?:GEO|AEO|LLMO)\b/i.test(title)) matchedTerms.push("GEO / AEO 专题来源");
    if (!matchedTerms.length) continue;
    const date = candidate.publishedAt;
    if (date && Number.isFinite(date.getTime()) && date.getTime() > now + 24 * 60 * 60 * 1000) continue;
    const fragment = source.config.preserveUrlFragment === true ? new URL(url).hash : "";
    const isWechatIndex = /^https:\/\/weixin\.sogou\.com\/weixin\?/.test(String(source.config.url ?? "")) && publicWechatIndexLink(new URL(url));
    const indexIdentity = isWechatIndex && typeof raw.publicIndexIdentity === "string" && raw.publicIndexIdentity.length <= 1500 ? raw.publicIndexIdentity : null;
    // Release-note feeds may give several distinct entries the same monthly page link.
    // Opt in only for verified feeds; ordinary article URLs keep their existing identity.
    let entryIdentity: string | null = null;
    if (source.kind === "rss" && source.publicEntryIdentity === "feed-id") {
      const feedUrl = safePublicUrl(source.config.feedUrl);
      const entryId = raw.guid ?? raw.id;
      if (!feedUrl || typeof entryId !== "string" || !entryId.trim() || entryId.length > 1500 || /[\u0000-\u001f\u007f]/u.test(entryId)) continue;
      entryIdentity = `public-feed-entry\n${normalizeUrl(feedUrl)}\n${entryId.trim()}`;
    }
    const canonicalId = createHash("sha256").update(entryIdentity ?? (indexIdentity ? `wechat-public-index\n${indexIdentity}` : `${canonical}${fragment}`)).digest("hex");
    const id = createHash("sha256").update(`${source.id}\n${canonicalId}`).digest("hex");
    if (found.has(id)) continue;
    const summaryFields = makePublicSummary({ text: summaryText, articleUrl: url,
      sourceUrl: raw.publicSocial ? url : safePublicUrl(source.config.feedUrl ?? source.config.url) ?? source.sourceUrl,
      origin: raw.publicSocial ? "social" : !candidate.excerpt && candidate.bodyText ? "body-excerpt" : source.kind === "rss" ? "rss" : "listing" });
    const { summary } = summaryFields;
    const titleIsExcerpt = candidate.raw && typeof candidate.raw === "object" && "titleIsExcerpt" in candidate.raw && candidate.raw.titleIsExcerpt === true;
    const languageTitle = titleIsExcerpt ? title.replace(/^帖文节选｜/, "") : title;
    const publisherUrl = safePublicUrl(raw.publisherUrl);
    const publisherName = publisherUrl && typeof raw.publisherName === "string" ? collapseWhitespace(stripTags(raw.publisherName)).slice(0, 160) || null : null;
    const imageUrl = candidateImage(candidate);
    const imageOrigin = imageUrl ? (raw.publicSocial ? "social" : "rss") : null;
    found.set(id, { id, canonicalId, title, url, ...summaryFields, sourceId: source.id, sourceName: source.name, sourceUrl: source.sourceUrl, language: inferLanguage(`${languageTitle}\n${summary ?? ""}`, candidate.language ?? source.languageHint), publishedAt: date && Number.isFinite(date.getTime()) ? date : null, matchedTerms, publisherUrl, publisherName, imageUrl, imageOrigin });
  }
  return [...found.values()];
}

/** Errors originate outside our trust boundary; public status never includes raw bodies/URLs/keys. */
export function publicCollectionError(error: unknown): string {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : NaN;
  if (Number.isInteger(status) && status >= 400 && status <= 599) return `来源返回 HTTP ${status}`;
  const message = error instanceof Error ? error.message : "";
  if (/timeout|timed out|deadline|abort/i.test(message) || error instanceof Error && /Timeout|Abort/.test(error.name)) return "请求超时，本轮未完成";
  if (/parse|not JSON|items path|embedded key|no items|not rss|XML/i.test(message)) return "来源格式不匹配或无法解析";
  if (/private|blocked|public|SSRF|forbidden/i.test(message)) return "来源访问被网络保护规则阻止";
  return "本轮读取失败，请检查网络、来源可用性或解析配置";
}
