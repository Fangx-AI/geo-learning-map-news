import { useState } from "react";
import { Form, Link, useLocation, useSearchParams } from "react-router";
import { useTranslatedContent, ContentLanguageToggle } from "@aihot/web/components/translation";
import { useContentLanguage, useIsStarred, toggleStar } from "@aihot/web/lib/local-state";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { cardImageUrl, dateLabel } from "./components.tsx";
import { geoReaderHref } from "./reader-links.ts";
import type { GeoDailyDigest, GeoDailyItem } from "../types.ts";

const timeLabel = (date: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date));

function DigestCard({ item, index }: { item: GeoDailyItem; index: number }) {
  const content = useTranslatedContent(item);
  const language = useContentLanguage();
  const starred = useIsStarred(item.id);
  const [failedImage, setFailedImage] = useState(false);
  const image = cardImageUrl(item.imageUrl);
  const brief = language === "zh" ? item.brief : undefined;
  const location = useLocation();
  const from = location.pathname + location.search;
  const href = geoReaderHref(item.id, from);
  return <article data-digest-item={item.id} className="py-6 first:pt-0 lg:py-8">
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
      <span aria-hidden="true" className="font-mono text-accent">{String(index + 1).padStart(2, "0")}</span>
      <Link to={`/all?source=${encodeURIComponent(item.sourceId)}`} className="max-w-full break-words font-medium text-accent hover:underline">{item.sourceName}</Link>
      <span>原文 <time dateTime={item.publishedAt ?? undefined}>{dateLabel(item.publishedAt)}</time></span>
      {item.briefAddedAt && <span className="rounded bg-accent-soft px-2 py-0.5 text-accent">今日补齐概要</span>}
    </div>
    <div className="flex items-start gap-4">
      <h3 lang={content.language} className="min-w-0 flex-1 break-words text-[19px] font-semibold leading-[1.55] tracking-tight text-ink lg:text-[22px]"><Link to={href} state={{ geoReaderFrom: from }} className="hover:text-accent">{content.title}</Link></h3>
      {image && !failedImage && <Link to={href} state={{ geoReaderFrom: from }} tabIndex={-1} aria-hidden="true" className="shrink-0"><img src={image} alt="" width={112} height={75} loading="lazy" onError={() => setFailedImage(true)} className="aspect-[3/2] w-20 rounded-control object-cover lg:w-28" /></Link>}
    </div>
    {brief ? <div className="mt-3 space-y-3 text-[14px] leading-[1.9] text-ink-2">
      {brief.automated && <span className="text-[11px] text-ink-3">AI 整理</span>}
      {brief.coverage === "abstract" && <span className="text-[11px] text-ink-3">基于论文摘要</span>}
      <p data-digest-conclusion="">{brief.conclusion}</p>
      <p data-digest-finding="" className="rounded-control bg-bg-sunk px-3 py-2"><span className="mr-2 font-semibold text-ink">关键发现</span>{brief.findings[0]}</p>
      <p><span className="mr-2 font-semibold text-accent">GEO 价值</span>{brief.geoValue[0]?.replace(/^本站(?:解读|启示)[：:]\s*/u, "")}</p>
      {brief.caveats.length > 0 && <p className="text-[12px] leading-6 text-ink-3">适用范围：{brief.caveats[0]}</p>}
    </div> : <div className="mt-3 text-[14px] leading-[1.9] text-ink-2"><p className="mb-1 text-[11px] text-ink-3">来源摘要{language === "zh" && !item.brief ? " · 完整解读待补齐" : ""}</p><p lang={content.language}>{content.summary ?? "来源暂未提供摘要。"}</p></div>}
    <div className="mt-3 flex flex-wrap items-center gap-5 text-[12px] text-accent">
      <Link to={href} state={{ geoReaderFrom: from }} className="inline-flex min-h-11 items-center font-medium hover:underline">{item.brief?.coverage === "full-article" ? "阅读完整解读 →" : "查看来源摘要 →"}</Link>
      <button type="button" aria-pressed={starred} onClick={() => toggleStar({ id: item.id, title: item.title, summary: item.summary, language: item.language, ...(content.translation ? { translation: content.translation } : {}), sourceName: item.sourceName, publishedAt: item.publishedAt, url: item.url, score: null, aiSelected: false })} className="min-h-10 hover:underline">{starred ? "已收藏" : "收藏"}</button>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex min-h-10 items-center text-ink-3 hover:text-accent">原文 ↗</a>
    </div>
  </article>;
}

export function DailyDigest({ digest }: { digest: GeoDailyDigest }) {
  const [params, setParams] = useSearchParams();
  const library = digest.view === "library";
  const query = (params.get("q") ?? "").slice(0, 200).trim().toLocaleLowerCase();
  const research = library && query ? digest.research.filter(item => query.split(/\s+/u).every(term => [item.title, item.translation?.title, item.sourceName, item.brief?.conclusion, ...(item.brief?.findings ?? []), ...(item.brief?.geoValue ?? [])].join(" ").toLocaleLowerCase().includes(term))) : digest.research;
  const expanded = params.getAll("more");
  const toggleExpanded = (id: string) => {
    const next = new URLSearchParams(params); next.delete("more");
    for (const key of expanded.includes(id) ? expanded.filter(value => value !== id) : [...expanded, id]) next.append("more", key);
    setParams(next, { preventScrollReset: true });
  };
  return <div className="mx-auto max-w-4xl pb-12">
    <PhoneBar title={library ? "中文解读" : "GEO 日报"} />
    <header className="border-b border-line pb-6 pt-2 lg:pt-4">
      <div className="flex items-center justify-between gap-3 text-[12px] text-ink-3"><time dateTime={digest.day}>{dateLabel(digest.day + "T00:00:00+08:00")}</time><Link to="/daily/archive" className="inline-flex min-h-10 items-center text-accent hover:underline">往期归档 →</Link></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 data-page-title="" className="text-[32px] font-semibold tracking-tight text-ink lg:text-[40px]">{library ? "中文解读" : "GEO 日报"}</h1><ContentLanguageToggle /></div>
      <p className="mt-3 text-[14px] leading-7 text-ink-2">{library ? "已补齐结论、关键发现与 GEO 启示，可直接在站内阅读。" : "先看结论，再看证据与 GEO 价值。"}</p>
      <nav aria-label="阅读入口" className="mt-5 flex gap-2 text-[14px]">{[["/daily", "今日重点", !library], ["/daily?view=library", "中文解读", library]] .map(([href, label, selected]) => <Link key={String(href)} to={String(href)} aria-current={selected ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-control px-4 font-medium ${selected ? "bg-accent text-white" : "bg-bg-sunk text-ink-2 hover:text-accent"}`}>{label}</Link>)}</nav>
      {!library && <p className="mt-4 text-[12px] text-ink-3">近 24 小时 {digest.recent.length} 篇 · 今日新解读 {digest.research.length} 篇 · 北京时间 {timeLabel(digest.generatedAt)} 更新</p>}
      {library && <Form method="get" action="/daily" className="mt-5 flex gap-2"><input type="hidden" name="view" value="library" /><input key={query} aria-label="搜索中文解读" type="search" name="q" maxLength={200} defaultValue={params.get("q") ?? ""} placeholder="搜索平台、问题或研究结论" className="min-h-11 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-[14px]" /><button className="min-h-11 rounded-control bg-accent px-4 text-[14px] text-white">搜索</button></Form>}
    </header>
    {!library && digest.latestEdition && <section aria-label="最新整期日报" className="mt-6 rounded-card border border-line bg-surface px-5 py-5 lg:px-7"><div className="flex items-center justify-between gap-4 text-xs text-ink-3"><span className="font-medium text-accent">整期情报 · {digest.latestEdition.day}</span><Link to="/daily/editions" className="inline-flex min-h-10 items-center hover:text-accent">全部期刊 →</Link></div><h2 className="mt-1 text-xl font-semibold leading-relaxed text-ink"><Link to={`/daily/editions/${digest.latestEdition.id}`} className="hover:text-accent">{digest.latestEdition.title}</Link></h2><Link to={`/daily/editions/${digest.latestEdition.id}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent">阅读全文 →</Link></section>}
    {([{ id: "daily-recent", title: "近 24 小时重点", subtitle: "按原文发布时间，聚焦研究、实测与平台变化。", items: digest.recent, total: digest.recentTotal, empty: "近 24 小时暂无符合条件的重点内容。先读下面新补齐的研究。" },
      { id: "daily-research", title: library ? "解读资料库" : "今日新解读", subtitle: library ? "保留原文日期，包含研究、实测与平台变化。" : "今天补齐，原文日期单独标注。", items: research, total: library ? research.length : digest.researchTotal, empty: library ? "没有匹配的中文解读，请尝试其他关键词。" : "今天还没有新解读，可先浏览此前已完成的中文解读。" }]).filter(section => !library || section.id === "daily-research").map(section => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-20 pt-8 lg:pt-10">
        <div className="mb-5"><h2 id={`${section.id}-heading`} className="text-[21px] font-semibold tracking-tight text-ink">{section.title}<span className="ml-3 text-[13px] font-normal text-ink-3">{section.items.length} 篇</span></h2><p className="mt-1 text-[12px] leading-6 text-ink-3">{section.subtitle}</p></div>
        <div className="rounded-card border border-line bg-surface px-5 pt-6 lg:px-8 lg:pt-8">{section.items.length ? <div className="divide-y divide-line">{section.items.slice(0, expanded.includes(section.id) ? undefined : 6).map((item, index) => <DigestCard key={item.id} item={item} index={index} />)}</div> : <p className="pb-6 text-[14px] leading-7 text-ink-3">{section.empty}</p>}
          {section.items.length > 6 && <button type="button" aria-expanded={expanded.includes(section.id)} onClick={() => toggleExpanded(section.id)} className="mb-5 min-h-11 w-full rounded-control border border-line text-[13px] text-accent hover:bg-accent-soft">{expanded.includes(section.id) ? "收起更多内容" : `继续阅读其余 ${section.items.length - 6} 篇`}</button>}
        </div>
        {section.total > section.items.length && <p className="mt-3 text-[12px] text-ink-3">本栏展示 {section.items.length} 篇重点，共 {section.total} 篇符合条件。</p>}
      </section>)}
    <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[12px] text-ink-3"><Link to={library ? "/daily" : "/daily?view=library"} className="min-h-11 py-3 text-accent hover:underline">{library ? "返回今日重点 →" : "浏览全部中文解读 →"}</Link><Link to="/all" className="min-h-11 py-3 hover:text-accent">全部来源动态 →</Link>{digest.candidatesTruncated && <span>当前从前 2,000 条候选中筛选，尚未展示全部内容。</span>}</footer>
  </div>;
}
