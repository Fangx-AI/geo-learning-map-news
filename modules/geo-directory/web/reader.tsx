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
import { IconChevronLeft } from "@aihot/web/components/icons";
import { cardImageUrl, dateLabel, type CardItem } from "./components.tsx";
import { safeReaderReturnTo } from "./reader-links.ts";
import { useLiveTranslation } from "./translation-updates.ts";
import { TranslationCorrectionButton } from "./translation-correction.tsx";
import { languageNames } from "../data.ts";

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
  return { ...result, requestedId: params.id.toLowerCase() };
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
  const { item, requestedId } = useLoaderData<typeof loader>();
  const translation = useLiveTranslation(item);
  const content = useTranslatedContent({ ...item, translation });
  const preference = useContentLanguage();
  const [briefLanguage, setBriefLanguage] = useState<ContentLanguage | null>(null);
  useEffect(() => setBriefLanguage(null), [preference, item.id]);
  const showBrief = !!item.brief && (briefLanguage ?? preference) === "zh";
  const title = item.brief ? decodeHTML(showBrief ? translation?.title ?? item.title : item.title) : content.title;
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
    <PhoneBar title={item.brief?.coverage === "full-article" ? "中文解读" : "来源摘要"} leading={<ReaderBack phone />} />
    <div className="hidden lg:block"><ReaderBack /></div>
    <article data-reader-item={item.id} className="pt-2 lg:pt-0">
      <p className="mb-3 text-[12px] font-medium text-accent">{item.brief?.coverage === "full-article" ? "中文解读 · 依据公开全文整理" : item.brief ? "摘要解读 · 未覆盖全文" : "来源摘要 · 尚无完整解读"}</p>
      <h1 data-page-title="" lang={titleLanguage} className="break-words text-[25px] font-semibold leading-[1.5] tracking-tight text-ink lg:text-[30px]">{title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        <Link to={`/all?source=${encodeURIComponent(item.sourceId)}`} className="min-w-0 max-w-full break-words font-medium text-accent hover:underline">{item.sourceName}</Link>
        <time dateTime={item.publishedAt ?? undefined} title={item.publishedAt ? "原文发布日期（北京时间）" : "来源未提供发布日期"}>{item.contentKind === "aggregated" && item.publishedAt ? "索引标注 " : "原文 "}{dateLabel(item.publishedAt)}</time>
        <span title="原文语言">{languageNames[item.language] ?? item.language}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 border-b border-line pb-3">
        {item.brief ? <button type="button" onClick={() => setBriefLanguage(showBrief ? "original" : "zh")} className="min-h-9 text-[12px] text-accent hover:underline">{showBrief ? "原文摘要" : "中文概要"}</button> : <ItemTranslationToggle content={content} />}
        {!showBrief && <TranslationCorrectionButton item={{ ...item, translation }} />}
        <button type="button" aria-label={starred ? "取消收藏" : "收藏这条内容"} aria-pressed={starred} className="min-h-9 rounded-control border border-line px-3 text-[12px] text-accent hover:bg-accent-soft" onClick={toggleBookmark}>{starred ? "已收藏 ✓" : "收藏 ＋"}</button>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="ml-auto min-h-9 py-2 text-[12px] text-accent hover:underline">查看原文 ↗</a>
      </div>
      {showBrief ? <BriefContent brief={item.brief!} /> : <section aria-labelledby="reader-summary-heading" className="pt-5">
        <h2 id="reader-summary-heading" className="mb-3 text-[12px] font-medium text-ink-4">来源摘要</h2>
        {(item.brief ? content.originalSummary : content.summary)?.trim() ? <p data-reader-summary="" lang={item.brief ? item.language : content.language} className="whitespace-pre-line break-words text-[16px] leading-[1.95] text-ink-2 lg:text-[17px]">{item.brief ? content.originalSummary : content.summary}</p> : <p className="text-[14px] leading-7 text-ink-3">来源暂未提供摘要。</p>}
      </section>}
      {!item.brief && <aside className="mt-6 rounded-card border border-line bg-bg-sunk p-5 text-[14px] leading-7 text-ink-2"><p>这条目前只有来源提供的摘要，还没有完整的中文解读。</p><Link to="/daily?view=library" className="mt-2 inline-flex min-h-11 items-center font-medium text-accent hover:underline">先读已完成的中文解读 →</Link></aside>}
      {showImage && <img src={imageUrl} alt="" referrerPolicy="no-referrer" decoding="async" ref={image => { if (image?.complete && !image.naturalWidth) setFailedImageUrl(imageUrl); }} onError={() => setFailedImageUrl(imageUrl)} className="mt-6 max-h-[360px] w-auto max-w-full rounded-card object-contain object-left" />}
      {showBrief && <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><Link to="/daily?view=library" className="inline-flex min-h-11 items-center text-[13px] text-accent hover:underline">继续读中文解读 →</Link></footer>}
    </article>
  </div>;
}

function BriefContent({ brief }: { brief: ReaderBrief }) {
  return <div data-reader-brief="" lang="zh" className="space-y-6 pt-6 text-[15px] leading-[1.95] text-ink-2 lg:text-[16px]">
    <section aria-labelledby="brief-conclusion" className="rounded-card border border-line bg-surface p-5 lg:p-6">
      <h2 id="brief-conclusion" className="mb-2 text-[13px] font-semibold text-ink-3">核心结论{brief.automated && <span className="ml-2 text-[11px] font-normal text-ink-4">AI 整理</span>}</h2>
      <p data-reader-conclusion="" className="break-words text-[17px] font-medium text-ink lg:text-[18px]">{brief.conclusion}</p>
    </section>
    <section aria-labelledby="brief-findings">
      <h2 id="brief-findings" className="mb-3 text-[18px] font-semibold text-ink">关键发现</h2>
      <ul className="list-disc space-y-2 pl-5 marker:text-accent">{brief.findings.map((finding, i) => <li key={i} className="break-words pl-1">{finding}</li>)}</ul>
    </section>
    <section aria-labelledby="brief-value" className="rounded-card bg-accent-soft p-5 lg:p-6">
      <h2 id="brief-value" className="mb-2 text-[18px] font-semibold text-ink">对 GEO 的启示<span className="ml-2 text-[12px] font-normal text-ink-3">本站解读</span></h2>
      {brief.geoValue.map((value, i) => <p key={i} className="mt-2 break-words">{value.replace(/^本站解读[：:]\s*/u, "")}</p>)}
    </section>
    {(brief.caveats.length > 0 || brief.coverage === "abstract") && <section aria-label="阅读边界" className="border-t border-line pt-4 text-[12px] leading-7 text-ink-3">
      {brief.coverage === "abstract" && <p>依据论文摘要整理，未覆盖论文全文。</p>}
      {brief.caveats.map((caveat, i) => <p key={i} className="break-words">{caveat}</p>)}
    </section>}
  </div>;
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
