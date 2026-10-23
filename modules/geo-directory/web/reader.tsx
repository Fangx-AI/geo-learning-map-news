import { useEffect, useState, type MouseEvent } from "react";
import { decodeHTML } from "entities";
import { data, isRouteErrorResponse, Link, useLoaderData, useLocation, useNavigate, useRouteError } from "react-router";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { removeStar, toggleStar, useContentLanguage, useIsStarred, type ContentLanguage } from "@aihot/web/lib/local-state";
import { ItemTranslationToggle, useTranslatedContent } from "@aihot/web/components/translation";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { historyIndex, type Screen } from "@aihot/web/components/shell/screens";
import { markBack } from "@aihot/web/components/shell/transitions";
import { IconBookmark, IconChevronLeft } from "@aihot/web/components/icons";
import { cardImageUrl, dateLabel, EXCERPT_LINK, indexedHeadline, isTruncatedExcerpt, linkLabel, newsTime, postHeadline, repeatsTitle, ValueBadge, type CardItem } from "./components.tsx";
import { itemChannels } from "./channels.ts";
import { withoutTitleCredit } from "@aihot/industry/translation";
import { geoReaderHref, safeReaderReturnTo } from "./reader-links.ts";
import { useLiveTranslation } from "./translation-updates.ts";
import { TranslationCorrectionButton } from "./translation-correction.tsx";
import { itemTasks, GEO_GLOSSARY } from "./reading-guide.ts";
import { readingVisit, rememberReading, useReadingState } from "./reading-state.ts";
import { languageNames } from "../data.ts";
import type { GeoDailyDigest } from "../types.ts";

export const handle: Screen = { home: "featured" };
export function headers() { return { "Cache-Control": "no-store" }; }

interface ReaderBrief {
  conclusion: string; findings: string[]; geoValue: string[]; caveats: string[];
  coverage: "full-article" | "abstract"; updatedAt: string; automated?: boolean;
}
interface ReaderItem extends CardItem { brief?: ReaderBrief }

export async function loader({ request, params }: { request: Request; params: { id?: string } }) {
  if (!params.id || !/^[a-f0-9]{64}$/i.test(params.id)) throw data({ message: "not_found" }, { status: 404 });
  const result = await loadOr404<{ item: ReaderItem }>(`/api/geo/public-items/${encodeURIComponent(params.id)}`, { signal: request.signal });
  const library = !result.item.brief ? await loadOr404<GeoDailyDigest>("/api/geo/daily?view=library", { signal: request.signal }).catch(() => null) : null;
  const suggestions = (library?.research ?? []).filter(candidate => candidate.id !== result.item.id && candidate.brief?.coverage === "full-article" && !candidate.brief.automated).slice(0, 3);
  // The same platform's latest news, so a reader who lands from a share link can keep reading.
  // Search the platform by the name this headline uses (OpenAI or ChatGPT, Gemini or Google).
  const channel = itemChannels(result.item.title, result.item.translation?.title)[0] ?? null;
  const alias = channel?.pattern.exec(`${result.item.title}\n${result.item.translation?.title ?? ""}`)?.[0];
  const latest = channel && alias ? await loadOr404<{ items: CardItem[] }>(`/api/geo/public-items?${new URLSearchParams({ q: alias, sort: "latest", quality: "useful", kind: "direct", limit: "12" })}`, { signal: request.signal }).catch(() => null) : null;
  const sameChannel = (latest?.items ?? []).filter(candidate => candidate.id !== result.item.id && itemChannels(candidate.title, candidate.translation?.title).some(match => match.slug === channel!.slug)).slice(0, 5);
  // No platform, or nothing else on it yet: the site's latest useful news keeps the reader going.
  const fallback = sameChannel.length ? null : await loadOr404<{ items: CardItem[] }>(`/api/geo/public-items?${new URLSearchParams({ sort: "latest", quality: "useful", kind: "direct", group: "title", limit: "8" })}`, { signal: request.signal }).catch(() => null);
  const related = sameChannel.length ? sameChannel : (fallback?.items ?? []).filter(candidate => candidate.id !== result.item.id).slice(0, 5);
  return { ...result, suggestions, related, channel: sameChannel.length && channel ? { slug: channel.slug, name: channel.name } : null, requestedId: params.id.toLowerCase() };
}

export function meta({ loaderData }: { loaderData?: { item: ReaderItem } }) {
  const item = loaderData?.item;
  return pageMeta({
    title: item ? decodeHTML(item.translation?.title ?? item.title) : "内容暂不可用",
    description: item ? decodeHTML(item.brief?.conclusion ?? item.translation?.summary ?? item.summary ?? "") : undefined,
    path: item ? `/read/${item.id}` : "/all",
    noindex: true,
  });
}

function ReaderBack({ phone = false }: { phone?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const to = safeReaderReturnTo(new URLSearchParams(location.search).get("from"));
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const state = location.state as { geoReaderFrom?: unknown } | null;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || state?.geoReaderFrom !== to || historyIndex() === 0) return;
    event.preventDefault();
    markBack();
    navigate(-1);
  };
  return <Link to={to} viewTransition onClick={onClick} className={`inline-flex min-h-11 items-center text-accent hover:underline ${phone ? "-ml-1 pr-2 text-[15px]" : "mb-4 text-[13px]"}`}><IconChevronLeft size={phone ? 25 : 18} /><span>返回列表</span></Link>;
}

export default function GeoReaderPage() {
  const { item, requestedId, suggestions, related, channel } = useLoaderData<typeof loader>();
  const location = useLocation();
  const reading = useReadingState();
  const [storageError,setStorageError] = useState('');
  const done = reading.visits.some(v=>v.id===item.id&&v.updatedAt===item.brief?.updatedAt&&v.done);
  useEffect(()=>{
    if (!item.brief || item.brief.coverage !== 'full-article' || item.brief.automated) return;
    const previous=readingVisit(item.id);
    let y=0;
    const frame=requestAnimationFrame(()=>{if(new URLSearchParams(location.search).get('resume')==='1'&&previous?.updatedAt===item.brief!.updatedAt) window.scrollTo(0,previous.y); y=window.scrollY;});
    const visit=()=>({id:item.id,title:item.translation?.title??item.title,updatedAt:item.brief!.updatedAt,at:Date.now(),y});
    rememberReading({...visit(),y:previous?.updatedAt===item.brief.updatedAt?previous.y:0});
    const scroll=()=>{y=window.scrollY;}; const save=()=>{rememberReading(visit());};
    window.addEventListener('scroll',scroll,{passive:true}); window.addEventListener('pagehide',save);
    return()=>{cancelAnimationFrame(frame);save();window.removeEventListener('scroll',scroll);window.removeEventListener('pagehide',save);};
  },[item.id,item.brief?.updatedAt]);
  const task=itemTasks(item)[0];
  const translation = useLiveTranslation(item);
  const content = useTranslatedContent({ ...item, translation });
  const preference = useContentLanguage();
  const [briefLanguage, setBriefLanguage] = useState<ContentLanguage | null>(null);
  useEffect(() => setBriefLanguage(null), [preference, item.id]);
  const showBrief = !!item.brief && (briefLanguage ?? preference) === "zh";
  const social = item.contentKind === "social";
  const title = item.brief ? decodeHTML(showBrief ? translation?.title ?? item.title : item.title) : social ? postHeadline(content.title) : withoutTitleCredit(indexedHeadline(content.title, item.contentKind === "aggregated").title);
  const summaryText = (item.brief ? content.originalSummary : content.summary)?.trim();
  const outlet = item.publisherName ?? indexedHeadline(item.title, item.contentKind === "aggregated").outlet;
  const titleLanguage = item.brief ? showBrief && translation ? "zh" : item.language : content.language;
  const actualStarred = useIsStarred(item.id);
  const requestedStarred = useIsStarred(requestedId);
  const starred = actualStarred || requestedStarred;
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = cardImageUrl(item.imageUrl);
  const showImage = imageUrl && imageUrl !== failedImageUrl;
  const toggleBookmark = () => {
    if (starred) {
      if (actualStarred) removeStar(item.id);
      if (requestedStarred && requestedId !== item.id) removeStar(requestedId);
      return;
    }
    toggleStar({ id: item.id, title: item.title, summary: item.summary, language: item.language, ...(content.translation ? { translation: content.translation } : {}), sourceName: item.sourceName, publishedAt: item.publishedAt, url: item.url, score: null, aiSelected: false });
  };
  return <div className="mx-auto max-w-3xl pb-12">
    <PhoneBar title={item.brief?.coverage === "full-article" ? "深度解读" : "资讯"} leading={<ReaderBack phone />} />
    <div className="hidden lg:block"><ReaderBack /></div>
    <article data-reader-item={item.id} className="pt-2 lg:pt-0">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        {item.brief ? <span className="font-medium text-accent">{item.brief.coverage === "full-article" ? "深度解读 · 依据原文全文整理" : "摘要解读"}</span> : <ValueBadge badge={item.readingPriority?.badge} />}
        {social && <span className="rounded-mark bg-bg-sunk px-1.5 py-0.5 text-[11px] text-ink-3">帖子</span>}
        {itemChannels(item.title, item.translation?.title).map(platform => <Link key={platform.slug} to={`/topics/${platform.slug}`} className="font-semibold text-accent hover:underline">{platform.name}</Link>)}
      </div>
      <h1 data-page-title="" lang={titleLanguage} className="break-words text-[25px] font-semibold leading-[1.5] tracking-tight text-ink lg:text-[30px]">{title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        {outlet && <span className="font-medium text-ink-2" title="索引标注的媒体">{outlet}</span>}
        <Link to={`/all?source=${encodeURIComponent(item.sourceId)}`} className="min-w-0 max-w-full break-words font-medium text-accent hover:underline">{item.sourceName}</Link>
        <time dateTime={item.publishedAt ?? undefined} title={item.publishedAt ? "原文发布日期（北京时间）" : "来源未提供发布日期"}>{item.contentKind === "aggregated" && item.publishedAt ? "索引标注 " : "原文 "}{dateLabel(item.publishedAt)}</time>
        <span title="原文语言">{languageNames[item.language] ?? item.language}</span>
        {item.brief && <span>约 {Math.max(1, Math.ceil([item.brief.conclusion, ...item.brief.findings, ...item.brief.geoValue, ...item.brief.caveats].join("").length / 350))} 分钟读完</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 border-b border-line pb-3">
        {item.brief ? <div role="group" aria-label="阅读内容" className="flex rounded-control bg-bg-sunk p-1">{([['zh', '中文解读'], ['original', '原文摘要']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={showBrief === (value === 'zh')} onClick={() => setBriefLanguage(value)} className={`min-h-10 rounded-control px-3 text-[13px] ${showBrief === (value === 'zh') ? 'bg-surface font-semibold text-accent shadow-sm' : 'text-ink-3'}`}>{label}</button>)}</div> : <ItemTranslationToggle content={content} />}
        {!showBrief && <TranslationCorrectionButton item={{ ...item, translation }} />}
        <button type="button" aria-label={starred ? "取消收藏" : "收藏这条内容"} aria-pressed={starred} className="ml-auto inline-flex min-h-9 items-center gap-1 px-1 text-[12px] text-accent hover:underline" onClick={toggleBookmark}><IconBookmark size={15} filled={starred} />{starred ? "已收藏" : "收藏"}</button>
        {item.brief && <a href={item.url} target="_blank" rel="noopener noreferrer" className="min-h-9 py-2 text-[12px] text-accent hover:underline">查看原文 ↗</a>}
      </div>
      {showBrief ? <><BriefContent brief={item.brief!} /><p className="mt-3 text-xs leading-6 text-ink-3">数据来自原文作者，本站未独立复现。</p>{task&&<section className="mt-6 rounded-card border border-line p-5"><h2 className="text-lg font-semibold text-ink">你可以先做什么</h2><p className="mt-2 text-xs text-ink-3">本站检查建议 · {task.audience} · 不代表已测得效果</p><ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-7 text-ink-2">{task.steps.map(step=><li key={step}>{step}</li>)}</ol><p className="mt-3 text-sm leading-7 text-ink-2">验收：{task.check}</p></section>}<details className="mt-5 border-t border-line py-3"><summary className="min-h-11 cursor-pointer py-2 text-sm text-accent">术语看不懂？</summary><dl className="space-y-3 text-sm leading-7">{GEO_GLOSSARY.map(([term,meaning])=><div key={term}><dt className="font-semibold text-ink">{term}</dt><dd className="text-ink-2">{meaning}</dd></div>)}</dl></details><button aria-pressed={done} onClick={()=>setStorageError(rememberReading({id:item.id,title,updatedAt:item.brief!.updatedAt,at:Date.now(),y:window.scrollY},!done)?"":"浏览器未能保存阅读状态。")} className="min-h-11 rounded-control border border-line px-4 text-sm text-accent">{done?"已读完 ✓":"标记读完"}</button>{storageError&&<p role="alert">{storageError}</p>}</> : <section aria-labelledby="reader-summary-heading" className="pt-5">
        <h2 id="reader-summary-heading" className="mb-3 text-[12px] font-medium text-ink-4">来源摘要</h2>
        {!summaryText ? <p className="text-[14px] leading-7 text-ink-3">来源暂未提供摘要。</p> : !item.brief && !social && repeatsTitle(summaryText, title, content.title) ? <p className="text-[14px] leading-7 text-ink-3">来源只提供了标题，完整内容请查看原文。</p> : <><p data-reader-summary="" lang={item.brief ? item.language : content.language} className="whitespace-pre-line break-words text-[16px] leading-[1.95] text-ink-2 lg:text-[17px]"><LinkedText text={summaryText} /></p>{isTruncatedExcerpt(summaryText) && <p data-excerpt-truncated="" className="mt-2 text-[13px] text-ink-3">来源只提供了开头这一段，后面的内容请看原文。</p>}</>}
      </section>}
      {!item.brief && <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2"><a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-control bg-accent px-5 text-[14px] font-semibold text-white">查看原文 ↗</a><span className="text-[12px] text-ink-3">本站只收录摘要，完整内容以原文为准。</span></p>}
      {showImage && <img src={imageUrl} alt="" referrerPolicy="no-referrer" decoding="async" ref={image => { if (image?.complete && !image.naturalWidth) setFailedImageUrl(imageUrl); }} onError={() => setFailedImageUrl(imageUrl)} className="mt-6 max-h-[220px] w-auto max-w-full rounded-card object-contain object-left" />}
      {related.length > 0 && <section aria-labelledby="reader-related" className="mt-10 border-t border-line pt-5">
        <NextNews item={related[0]!} />
        <h2 id="reader-related" className="mt-6 text-[16px] font-semibold text-ink">{channel ? `${channel.name} 最新资讯` : "最新资讯"}</h2>
        <ul className="mt-2 divide-y divide-line">{related.slice(1).map(candidate => <RelatedNews key={candidate.id} item={candidate} />)}</ul>
        <Link to={channel ? `/topics/${channel.slug}` : "/all"} className="mt-1 inline-flex min-h-11 items-center text-[13px] font-medium text-accent hover:underline">{channel ? `${channel.name} 的全部资讯 →` : "全部资讯 →"}</Link>
      </section>}
      {!item.brief && suggestions.length > 0 && <aside className="mt-8 border-t border-line pt-5 text-[14px] leading-7 text-ink-2"><h2 className="text-[16px] font-semibold text-ink">相关深度解读</h2><ul className="mt-2 divide-y divide-line">{suggestions.map(candidate => <ReaderSuggestion key={candidate.id} item={candidate} />)}</ul><Link to="/library" className="mt-1 inline-flex min-h-11 items-center text-[13px] font-medium text-accent hover:underline">全部研究与解读 →</Link></aside>}
      {showBrief && <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><Link to="/library" className="inline-flex min-h-11 items-center text-[13px] text-accent hover:underline">更多研究与解读 →</Link></footer>}
    </article>
  </div>;
}

function BriefContent({ brief }: { brief: ReaderBrief }) {
  return <div data-reader-brief="" lang="zh" className="space-y-6 pt-3 text-[15px] leading-[1.95] text-ink-2 lg:text-[16px]">
    <nav aria-label="解读目录" className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-accent">{[['brief-conclusion','结论'],['brief-findings','数据与发现'],['brief-value','GEO 启示'],...(brief.caveats.length || brief.coverage === 'abstract' ? [['brief-limits','适用范围']] : [])].map(([id,label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center hover:underline">{label}</a>)}</nav>
    <section aria-labelledby="brief-conclusion" className="rounded-card border border-line bg-surface p-5 lg:p-6">
      <h2 id="brief-conclusion" className="mb-2 scroll-mt-24 text-[13px] font-semibold text-ink-3">核心结论{brief.automated && <span className="ml-2 text-[11px] font-normal text-ink-4">AI 整理</span>}</h2>
      <p data-reader-conclusion="" className="break-words text-[17px] font-medium text-ink lg:text-[18px]">{brief.conclusion}</p>
    </section>
    <section aria-labelledby="brief-findings">
      <h2 id="brief-findings" className="mb-3 scroll-mt-24 text-[18px] font-semibold text-ink">关键发现<span className="ml-2 text-xs font-normal text-ink-3">来源报告</span></h2>
      <ul className="list-disc space-y-2 pl-5 marker:text-accent">{brief.findings.map((finding, i) => <li key={i} className="break-words pl-1">{finding}</li>)}</ul>
    </section>
    <section aria-labelledby="brief-value" className="rounded-card bg-accent-soft p-5 lg:p-6">
      <h2 id="brief-value" className="mb-2 scroll-mt-24 text-[18px] font-semibold text-ink">对 GEO 的启示<span className="ml-2 text-[12px] font-normal text-ink-3">本站解读</span></h2>
      {brief.geoValue.map((value, i) => <p key={i} className="mt-2 break-words">{value.replace(/^本站(?:解读|启示)[：:]\s*/u, "")}</p>)}
    </section>
    {(brief.caveats.length > 0 || brief.coverage === "abstract") && <section aria-label="阅读边界" className="border-t border-line pt-4 text-[12px] leading-7 text-ink-3">
      <h2 id="brief-limits" className="mb-2 scroll-mt-24 text-[14px] font-semibold text-ink-2">适用范围</h2>
      {brief.coverage === "abstract" && <p>依据论文摘要整理，未覆盖论文全文。</p>}
      {brief.caveats.map((caveat, i) => <p key={i} className="break-words">{caveat}</p>)}
    </section>}
  </div>;
}

function LinkedText({ text }: { text: string }) {
  return <>{text.split(EXCERPT_LINK).map((part, index) => index % 2 ? <a key={index} href={part} title={part} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">{linkLabel(part)} ↗</a> : part)}</>;
}

const relatedTitle = (item: CardItem, title: string) => item.contentKind === "social" ? postHeadline(title) : withoutTitleCredit(indexedHeadline(title, item.contentKind === "aggregated").title);
function NextNews({ item }: { item: CardItem }) {
  const location = useLocation();
  const content = useTranslatedContent(item);
  return <Link data-reader-next="" to={geoReaderHref(item.id, new URLSearchParams(location.search).get("from") ?? "")} className="group block rounded-card border border-line bg-surface p-4 hover:border-accent">
    <span className="text-[12px] font-medium text-ink-3">接着看</span>
    <span lang={content.language} className="mt-1 block text-[16px] font-semibold leading-relaxed text-ink group-hover:text-accent">{relatedTitle(item, content.title)} →</span>
    <span className="mt-1 block text-[12px] text-ink-3" suppressHydrationWarning>{item.sourceName} · {newsTime(item.publishedAt)}</span>
  </Link>;
}

function RelatedNews({ item }: { item: CardItem }) {
  const location = useLocation();
  const content = useTranslatedContent(item);
  const title = relatedTitle(item, content.title);
  return <li className="py-3"><Link to={geoReaderHref(item.id, new URLSearchParams(location.search).get("from") ?? "")} lang={content.language} className="font-medium leading-relaxed text-ink hover:text-accent hover:underline">{title}</Link><p className="mt-1 text-[12px] text-ink-3" suppressHydrationWarning>{item.sourceName} · {newsTime(item.publishedAt)}</p></li>;
}

function ReaderSuggestion({ item }: { item: GeoDailyDigest['research'][number] }) {
  const content = useTranslatedContent(item);
  return <li className="py-3"><Link to={`/read/${item.id}?from=%2Flibrary`} className="font-medium text-accent hover:underline">{content.title}</Link><p className="mt-1 text-[12px] text-ink-3">{item.sourceName} · 原文 {dateLabel(item.publishedAt)}</p></li>;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const missing = isRouteErrorResponse(error) && (error.status === 404 || error.status === 400);
  return <div className="mx-auto max-w-3xl pb-12">
    <PhoneBar title="内容暂不可用" leading={<ReaderBack phone />} />
    <div className="hidden lg:block"><ReaderBack /></div>
    <section className="rounded-card border border-line px-6 py-12 text-center">
      <h1 data-page-title="" className="text-[21px] font-semibold text-ink">{missing ? "这条内容暂时无法查看" : "暂时无法加载内容"}</h1>
      <p className="mt-3 text-[14px] leading-7 text-ink-3">{missing ? "可能已移除或不再公开。" : "请稍后重试。"}</p>
      {!missing && <button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-10 rounded-control border border-line px-4 text-[13px] text-accent">重新加载</button>}
    </section>
  </div>;
}
