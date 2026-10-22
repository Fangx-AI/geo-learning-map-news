import { Link, useLocation, useSearchParams } from "react-router";
import { useState } from "react";
import { toggleStar, useIsStarred, type ChineseTranslation } from "@aihot/web/lib/local-state";
import { ContentLanguageToggle, ItemTranslationToggle, useTranslatedContent } from "@aihot/web/components/translation";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { languageNames } from "../data.ts";
import { highlightedParts, hasSearchMatch, searchExcerpt, type SearchTerms } from "./search-text.ts";
import type { ReactNode } from "react";
import { useLiveTranslation } from "./translation-updates.ts";
import { TranslationCorrectionButton } from "./translation-correction.tsx";
import { geoReaderHref } from "./reader-links.ts";
import { itemChannels } from "./channels.ts";
import { IconBookmark } from "@aihot/web/components/icons";

export interface CardItem {
  id: string; title: string; url: string; summary: string | null;
  sourceId: string; sourceName: string; sourceUrl: string; language: string;
  publishedAt: string | null; collectedAt: string; matchedTerms: string[];
  selectionReasons?: string[]; dateBasis?: "published" | "collected";
  platform?: string; contentKind?: string;
  publisherName?: string | null; publisherUrl?: string | null;
  imageUrl?: string | null; imageOrigin?: string | null;
  translation?: ChineseTranslation | null;
  readingReady?: boolean;
  readingPriority?: { tier: "priority" | "standard" | "deprioritized"; label: string; badge?: string | null; folded?: boolean; reasons: string[]; limitations: string[]; policyVersion: number };
  nearDuplicates?: { key: string; count: number; items: CardItem[]; remainingCount?: number };
}
export function cardImageUrl(value: string | null | undefined): string | null {
  if (!value?.startsWith("/api/img-proxy?")) return null;
  const url = new URL(value, "https://local.invalid");
  return url.pathname === "/api/img-proxy" && url.searchParams.get("mode") === "card" && url.searchParams.has("u") && /^\d+$/.test(url.searchParams.get("exp") ?? "") && !!url.searchParams.get("sig") ? value : null;
}
export const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "日期待确认";
export function HighlightedText({ text, query = "" }: { text: string; query?: SearchTerms }) {
  return <>{highlightedParts(text, query).map((part, index) => part.match ? <mark key={index} className="rounded-sm bg-accent-soft px-0.5 text-inherit">{part.text}</mark> : part.text)}</>;
}
function publicUrl(value: string | null | undefined): string | null {
  try { const url = new URL(value ?? ""); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
const badgeTone: Record<string, string> = { 官方: "bg-ok-soft text-ok-ink", 一手数据: "bg-amber-soft text-amber-ink", 研究: "bg-amber-soft text-amber-ink", 论文: "bg-accent-soft text-accent-ink", 平台变化: "bg-bg-sunk text-ink-2" };
export function ValueBadge({ badge }: { badge?: string | null }) {
  return badge ? <span data-value-badge="" className={`rounded-mark px-1.5 py-0.5 text-[11px] font-semibold ${badgeTone[badge] ?? "bg-bg-sunk text-ink-2"}`}>{badge}</span> : null;
}
/** Google News and other indexes end a headline with " - 媒体名"; split the outlet off so it shows next to the source. */
export function indexedHeadline(title: string, aggregated: boolean): { title: string; outlet: string | null } {
  const match = aggregated ? /^(.{8,}?)\s*[-–—]\s+([^-–—]{1,40})$/u.exec(title) : null;
  return match ? { title: match[1]!.trim(), outlet: match[2]!.trim() } : { title, outlet: null };
}
const normalized = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** Index and feed summaries often only repeat the headline, the index's form of it included ("标题 - 媒体名"). */
export function repeatsTitle(summary: string, ...titles: string[]): boolean {
  return titles.some(title => normalized(summary) === normalized(title));
}
/** A social post as a headline: without the collector's excerpt label, trailing links and "via @author" credits. */
export function postHeadline(text: string): string {
  let headline = text.replace(/^帖文节选｜/, "").trim(), previous = "";
  while (headline !== previous) {
    previous = headline;
    headline = headline.replace(/\s*\[contains quote post or other embedded content\]$/i, "").replace(/\s*https?:\/\/\S*$/u, "").replace(/\s*[-–—]?\s*(?:via|通过|经由|經由)\s*@[\w.-]+(?:\s*(?:,|，|、|and|和|及)\s*@[\w.-]+)*[\s.。]*$/iu, "").trim();
  }
  return headline || text;
}
const clock = (value: Date) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
const beijingDay = (value: number) => new Date(value + 8 * 3600_000).toISOString().slice(0, 10);
/** 今天 22:42 / 昨天 21:00 / 10月19日, in Beijing time. */
export function newsTime(value: string | null, now = Date.now()): string {
  if (!value) return "日期待确认";
  const at = Date.parse(value), day = beijingDay(at);
  if (day === beijingDay(now)) return `今天 ${clock(new Date(at))}`;
  if (day === beijingDay(now - 86_400_000)) return `昨天 ${clock(new Date(at))}`;
  const [year, month, date] = day.split("-").map(Number);
  return `${year === new Date(now + 8 * 3600_000).getUTCFullYear() ? "" : `${year}年`}${month}月${date}日`;
}
export function ItemCard({ item, compact = false, query = "", grouped = true }: { item: CardItem; compact?: boolean; query?: SearchTerms; grouped?: boolean }) {
  const starred = useIsStarred(item.id);
  const [params] = useSearchParams();
  const location = useLocation();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = cardImageUrl(item.imageUrl);
  const showImage = !compact && imageUrl && failedImageUrl !== imageUrl;
  const translation = useLiveTranslation(item);
  const content = useTranslatedContent({ ...item, translation });
  const social = item.contentKind === "social", aggregated = item.contentKind === "aggregated";
  // Social posts have no headline; the collector titles them with an excerpt.
  const title = social ? postHeadline(content.summary ?? content.title) : indexedHeadline(content.title, aggregated).title;
  const outlet = item.publisherName ? null : indexedHeadline(item.title, aggregated).outlet;
  const summary = social ? null : content.summary;
  const distinctSummary = summary && !repeatsTitle(summary, title, content.title) ? summary : null;
  const matchesSummaryOnly = distinctSummary && !hasSearchMatch(title, query) && hasSearchMatch(distinctSummary, query);
  const alternativeTitle = content.translated ? content.originalTitle : content.translatedTitle;
  const alternativeSummary = content.translated ? content.originalSummary : content.translatedSummary;
  const hiddenLanguageMatch = !hasSearchMatch(title, query) && !hasSearchMatch(summary ?? "", query)
    ? hasSearchMatch(alternativeTitle ?? "", query) ? alternativeTitle : hasSearchMatch(alternativeSummary ?? "", query) ? alternativeSummary : null : null;
  const siblings = grouped ? item.nearDuplicates : undefined;
  const groupQuery = new URLSearchParams();
  for (const key of ["q", "source", "language", "platform", "kind", "period", "quality"]) if (params.get(key)) groupQuery.set(key, params.get(key)!);
  groupQuery.set("sort", params.get("sort") ?? "latest");
  groupQuery.set("group", "none");
  if (siblings) groupQuery.set("groupKey", siblings.key);
  const channels = itemChannels(item.title, item.translation?.title);
  const original = publicUrl(item.url), publisherUrl = publicUrl(item.publisherUrl);
  const readerHref = geoReaderHref(item.id, location.pathname + location.search);
  const showLanguage = !content.translated && !/^zh/.test(item.language) && item.language !== "und";
  return <li data-public-item={item.id} data-card-key={item.id} className={compact ? "px-4 py-3 lg:px-5" : "px-5 py-4 lg:px-6"}>
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        {(item.readingPriority?.badge || channels.length > 0 || item.readingReady || social) && <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <ValueBadge badge={item.readingPriority?.badge} />
          {social && <span className="rounded-mark bg-bg-sunk px-1.5 py-0.5 text-[11px] text-ink-3">帖子</span>}
          {item.readingReady && <span className="rounded-mark bg-ok-soft px-1.5 py-0.5 text-[11px] font-semibold text-ok-ink">有中文解读</span>}
          {channels.map(channel => <Link key={channel.slug} to={`/topics/${channel.slug}`} className="relative z-10 rounded-mark px-1 py-0.5 text-[11px] font-semibold text-accent hover:underline">{channel.name}</Link>)}
        </div>}
        <h2 lang={content.language} className={social ? "line-clamp-3 text-[15px] leading-relaxed text-ink" : `font-semibold leading-relaxed text-ink ${compact ? "text-[15px]" : "text-[17px]"}`}><Link to={readerHref} state={{ geoReaderFrom: location.pathname + location.search }} className="hover:text-accent hover:underline"><HighlightedText text={title} query={query} /></Link></h2>
        {matchesSummaryOnly && <p data-search-excerpt="" className="mt-2 text-[12px] leading-6 text-ink-3">摘要匹配：<HighlightedText text={searchExcerpt(distinctSummary!, query)} query={query} /></p>}
        {hiddenLanguageMatch && <p data-search-excerpt="" className="mt-2 text-[12px] leading-6 text-ink-3">{content.translated ? "原文匹配：" : "译文匹配："}<HighlightedText text={searchExcerpt(hiddenLanguageMatch, query)} query={query} /></p>}
        {!compact && !matchesSummaryOnly && distinctSummary && <p lang={content.language} className="mt-1.5 line-clamp-2 text-[14px] leading-6 text-ink-2"><HighlightedText text={distinctSummary} query={query} /></p>}
      </div>
      {showImage && <Link to={readerHref} state={{ geoReaderFrom: location.pathname + location.search }} tabIndex={-1} aria-hidden="true" className="mt-1 shrink-0"><img src={imageUrl} width={120} height={80} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" ref={image => { if (image?.complete && !image.naturalWidth) setFailedImageUrl(imageUrl); }} onError={() => setFailedImageUrl(imageUrl)} className="aspect-[3/2] w-[84px] rounded-control object-cover lg:w-28" /></Link>}
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
      {outlet && <span className="max-w-[45%] truncate font-medium text-ink-2" title="索引标注的媒体">{outlet}</span>}
      <Link to={`/all?source=${encodeURIComponent(item.sourceId)}`} className="max-w-[40%] truncate hover:text-accent hover:underline sm:max-w-[60%]" title={`只看 ${item.sourceName}`}><HighlightedText text={item.sourceName} query={query} /></Link>
      <time dateTime={item.publishedAt ?? undefined} title={!item.publishedAt ? "来源未提供发布日期" : aggregated ? "索引标注时间（北京时间）" : "原文发布时间（北京时间）"} suppressHydrationWarning>{(aggregated && item.publishedAt ? "索引标注 " : "") + newsTime(item.publishedAt)}</time>
      {showLanguage && <span className="hidden sm:inline">{languageNames[item.language] ?? item.language}</span>}
      {original && <a href={original} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">原文 ↗</a>}
      <ItemTranslationToggle content={content} />
      <TranslationCorrectionButton item={{ ...item, translation }} />
      <button type="button" aria-label={starred ? "取消收藏" : "收藏这条内容"} aria-pressed={starred} className={`ml-auto inline-flex min-h-9 min-w-9 items-center justify-center ${starred ? "text-accent" : "text-ink-4 hover:text-accent"}`} onClick={() => toggleStar({ id: item.id, title: item.title, summary: item.summary, language: item.language, ...(content.translation ? { translation: content.translation } : {}), sourceName: item.sourceName, publishedAt: item.publishedAt, url: item.url, score: null, aiSelected: false })}><IconBookmark size={16} filled={starred} /></button>
    </div>
    {item.publisherName && <p className="mt-1 text-[12px] text-ink-3">{aggregated ? "索引标注发布者：" : "发布者："}{publisherUrl ? <a href={publisherUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{item.publisherName}<span className="sr-only">（发布者网站）</span> ↗</a> : item.publisherName}</p>}
    {siblings && siblings.count > 1 && <details data-similar-titles={siblings.key} className="mt-2 overflow-hidden rounded-control border border-line bg-bg-sunk"><summary className="cursor-pointer px-3 py-2 text-[12px] text-accent">另有 {siblings.count - 1} 条相似报道</summary><p className="px-3 pb-2 text-[11px] leading-6 text-ink-4">按标题、语言与日期自动归组，尚未核实为同一篇内容。</p><ul className="divide-y divide-line border-t border-line bg-surface">{siblings.items.map(sibling => <ItemCard key={sibling.id} item={sibling} compact query={query} grouped={false} />)}</ul>{(siblings.remainingCount ?? 0) > 0 && <Link to={`/all?${groupQuery}`} className="block border-t border-line px-3 py-3 text-[12px] text-accent hover:underline">还有 {siblings.remainingCount} 条，查看这一组全部条目 →</Link>}</details>}
  </li>;
}
export function ItemList({ items, compact = false, query = "" }: { items: CardItem[]; compact?: boolean; query?: SearchTerms }) {
  return items.length ? <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{items.map(item => <ItemCard key={item.id} item={item} compact={compact} query={query} />)}</ul> : <div className="rounded-card border border-dashed border-line p-10 text-center text-[13px] text-ink-3">当前条件下暂无收录。<Link to="/all" className="ml-3 text-accent">查看全部资讯 →</Link></div>;
}
export function PublicHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <><PhoneBar title={title} /><header className="border-b border-line pb-4 pt-1"><div className="flex flex-wrap items-center justify-between gap-3"><h1 data-page-title="" className="text-[27px] font-semibold tracking-tight text-ink lg:text-[30px]">{title}</h1><ContentLanguageToggle /></div>{description && <p className="mt-2 max-w-3xl text-[14px] leading-6 text-ink-3">{description}</p>}{children}</header></>;
}

