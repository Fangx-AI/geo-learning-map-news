import { Link, useLocation, useSearchParams } from "react-router";
import { useState } from "react";
import { toggleStar, useIsStarred, type ChineseTranslation } from "@aihot/web/lib/local-state";
import { ContentLanguageToggle, ItemTranslationToggle, useTranslatedContent } from "@aihot/web/components/translation";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { languageNames } from "../data.ts";
import { highlightedParts, hasSearchMatch, searchExcerpt, type SearchTerms } from "./search-text.ts";
import type { ReactNode } from "react";
import { useLiveTranslation } from "./translation-updates.ts";
import { TranslationProgress } from "./translation-progress.tsx";
import { TranslationCorrectionButton } from "./translation-correction.tsx";
import { geoReaderHref } from "./reader-links.ts";

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
  readingPriority?: { tier: "priority" | "standard" | "deprioritized"; label: string; reasons: string[]; limitations: string[]; policyVersion: number };
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
export function ItemCard({ item, compact = false, query = "", grouped = true }: { item: CardItem; compact?: boolean; query?: SearchTerms; grouped?: boolean }) {
  const starred = useIsStarred(item.id);
  const [params] = useSearchParams();
  const location = useLocation();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = cardImageUrl(item.imageUrl);
  const showImage = imageUrl && failedImageUrl !== imageUrl;
  const translation = useLiveTranslation(item);
  const content = useTranslatedContent({ ...item, translation });
  const { title, summary } = content;
  const normalize = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const distinctSummary = summary && normalize(summary) !== normalize(title) ? summary : null;
  const host = new URL(item.url).hostname;
  const social = item.contentKind ? item.contentKind === "social" : /(^|\.)(x|twitter|reddit)\.com$/.test(host) || /(^|\.)(bsky\.app|mastodon\.social)$/.test(host);
  const aggregated = item.contentKind ? item.contentKind === "aggregated" : host === "news.google.com";
  const coverage = aggregated ? "聚合线索" : social ? "社交原帖" : "原站内容";
  const dateMissing = !item.publishedAt;
  const publisherUrl = publicUrl(item.publisherUrl);
  const matchesSummaryOnly = distinctSummary && !hasSearchMatch(title, query) && hasSearchMatch(distinctSummary, query);
  const alternativeTitle = content.translated ? content.originalTitle : content.translatedTitle;
  const alternativeSummary = content.translated ? content.originalSummary : content.translatedSummary;
  const hiddenLanguageMatch = !hasSearchMatch(title, query) && !hasSearchMatch(summary ?? "", query)
    ? hasSearchMatch(alternativeTitle ?? "", query) ? alternativeTitle : hasSearchMatch(alternativeSummary ?? "", query) ? alternativeSummary : null : null;
  const siblings = grouped ? item.nearDuplicates : undefined;
  const groupQuery = new URLSearchParams();
  for (const key of ["q", "source", "language", "platform", "kind", "period"]) if (params.get(key)) groupQuery.set(key, params.get(key)!);
  groupQuery.set("sort", params.get("sort") ?? (params.has("cursor") ? "latest" : "recommended"));
  groupQuery.set("group", "none");
  if (siblings) groupQuery.set("groupKey", siblings.key);
  const summaryContent = distinctSummary && <p lang={content.language} className="mt-2 text-[13px] leading-7 text-ink-3"><HighlightedText text={distinctSummary} query={query} /></p>;
  return <li data-public-item={item.id} data-card-key={item.id} className={compact ? "px-4 py-3 lg:px-5" : "px-5 py-4 lg:px-6"}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3"><Link to={`/all?source=${encodeURIComponent(item.sourceId)}`} className="max-w-[65%] truncate font-medium text-accent hover:underline" title={`查看 ${item.sourceName} 的已收录内容`}><HighlightedText text={item.sourceName} query={query} /></Link><span className="rounded bg-bg-sunk px-1.5 py-0.5">{item.readingReady === undefined ? coverage : item.readingReady ? "中文解读" : "来源摘要"}</span><span title="原文语言">{languageNames[item.language] ?? item.language}</span><time dateTime={item.publishedAt ?? undefined} title={dateMissing ? "来源未提供发布日期" : aggregated ? "索引标注时间（北京时间）" : "原文发布日期（北京时间）"}>{aggregated && !dateMissing ? "索引标注 " : ""}{dateLabel(item.publishedAt)}</time><ItemTranslationToggle content={content} /><TranslationCorrectionButton item={{ ...item, translation }} /><button type="button" aria-label={starred ? "取消收藏" : "收藏这条内容"} aria-pressed={starred} className="ml-auto min-h-9 rounded border border-line px-2.5 text-accent hover:bg-accent-soft" onClick={() => toggleStar({ id: item.id, title: item.title, summary: item.summary, language: item.language, ...(content.translation ? { translation: content.translation } : {}), sourceName: item.sourceName, publishedAt: item.publishedAt, url: item.url, score: null, aiSelected: false })}>{starred ? "已收藏 ✓" : "收藏 ＋"}</button></div>
    <h2 lang={content.language} className={`mt-1.5 font-semibold leading-relaxed text-ink ${compact ? "text-[15px]" : "text-[17px]"}`}><Link to={geoReaderHref(item.id, location.pathname + location.search)} state={{ geoReaderFrom: location.pathname + location.search }} className="flex items-start gap-3 hover:text-accent hover:underline"><span className="min-w-0 flex-1"><HighlightedText text={title} query={query} /></span>{showImage && <img src={imageUrl} width={120} height={80} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" ref={image => { if (image?.complete && !image.naturalWidth) setFailedImageUrl(imageUrl); }} onError={() => setFailedImageUrl(imageUrl)} className="aspect-[3/2] w-[84px] shrink-0 rounded-control object-cover lg:w-28" />}</Link></h2>
    {item.publisherName && <p className="mt-1 text-[11px] text-ink-3">{aggregated ? "索引标注发布者：" : "发布者："}{publisherUrl ? <a href={publisherUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{item.publisherName}<span className="sr-only">（发布者网站）</span> ↗</a> : item.publisherName}</p>}
    {compact && matchesSummaryOnly && <p data-search-excerpt="" className="mt-2 text-[12px] leading-6 text-ink-3">摘要匹配：<HighlightedText text={searchExcerpt(distinctSummary!, query)} query={query} /></p>}
    {hiddenLanguageMatch && <p data-search-excerpt="" className="mt-2 text-[12px] leading-6 text-ink-3">{content.translated ? "原文匹配：" : "译文匹配："}<HighlightedText text={searchExcerpt(hiddenLanguageMatch, query)} query={query} /></p>}
    {compact && summaryContent ? <details className="group/summary mt-1"><summary className="min-h-9 w-fit cursor-pointer py-2 text-[12px] text-ink-3"><span className="group-open/summary:hidden">展开摘要</span><span className="hidden group-open/summary:inline">收起摘要</span></summary>{summaryContent}</details> : summaryContent}
    {siblings && siblings.count > 1 && <details data-similar-titles={siblings.key} className="mt-3 overflow-hidden rounded-control border border-line bg-bg-sunk"><summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-accent">相似标题 · 共 {siblings.count} 条<span className="ml-2 font-normal text-ink-3">展开查看其他出处</span></summary><p className="px-3 pb-2 text-[11px] leading-6 text-ink-4">按标题、语言与日期自动归组；尚未核实为同一篇内容。每个链接均保留，可分别阅读和收藏。</p><ul className="divide-y divide-line border-t border-line bg-surface">{siblings.items.map(sibling => <ItemCard key={sibling.id} item={sibling} compact query={query} grouped={false} />)}</ul>{(siblings.remainingCount ?? 0) > 0 && <Link to={`/all?${groupQuery}`} className="block border-t border-line px-3 py-3 text-[12px] text-accent hover:underline">还有 {siblings.remainingCount} 条，查看这一组全部条目 →</Link>}</details>}
  </li>;
}
export function ItemList({ items, compact = false, query = "" }: { items: CardItem[]; compact?: boolean; query?: SearchTerms }) {
  return items.length ? <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{items.map(item => <ItemCard key={item.id} item={item} compact={compact} query={query} />)}</ul> : <div className="rounded-card border border-dashed border-line p-10 text-center text-[13px] text-ink-3">当前条件下暂无收录。<Link to="/all" className="ml-3 text-accent">查看全部动态 →</Link></div>;
}
export function PublicHeader({ title, eyebrow, description, children }: { title: string; eyebrow: string; description: string; children?: ReactNode }) {
  return <><PhoneBar title={title} /><header className="border-b border-line pb-4 pt-1"><p className="hidden text-[11px] font-bold tracking-[0.18em] text-accent lg:block">GEO LEARNING MAP / {eyebrow}</p><div className="mt-1 flex flex-wrap items-center justify-between gap-3 lg:mt-3"><h1 data-page-title="" className="text-[27px] font-semibold tracking-tight text-ink lg:text-[30px]">{title}</h1><ContentLanguageToggle /></div><p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-3">{description}</p><TranslationProgress />{children}<nav aria-label="GEO 内容" className="mt-2 flex gap-4 overflow-x-auto whitespace-nowrap text-[12px] text-accent [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>a]:min-h-9 [&>a]:py-2"><Link to="/">精选</Link><Link to="/all">全部动态</Link><Link to="/hot">热点榜</Link><Link to="/daily">日报</Link><Link to="/topics">主题</Link><Link to="/starred">收藏</Link><Link to="/atlas">信源目录</Link></nav></header></>;
}

