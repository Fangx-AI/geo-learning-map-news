import { useState } from "react";
import { Form, Link, useLocation, useSearchParams } from "react-router";
import { useTranslatedContent, ContentLanguageToggle } from "@aihot/web/components/translation";
import { useContentLanguage, useIsStarred, toggleStar } from "@aihot/web/lib/local-state";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { cardImageUrl, dateLabel } from "./components.tsx";
import { geoReaderHref } from "./reader-links.ts";
import type { GeoDailyDigest, GeoDailyItem } from "../types.ts";

const timeLabel = (date: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date));

export function DigestCard({ item, index }: { item: GeoDailyItem; index: number }) {
  const content = useTranslatedContent(item);
  const language = useContentLanguage();
  const starred = useIsStarred(item.id);
  const [failedImage, setFailedImage] = useState(false);
  const image = cardImageUrl(item.imageUrl);
  const brief = language === "zh" ? item.brief : undefined;
  const location = useLocation();
  const from = location.pathname + location.search;
  const href = geoReaderHref(item.id, from);
  return <article data-digest-item={item.id} className="py-5 first:pt-0 lg:py-6">
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
      <p><span className="mr-2 font-semibold text-accent">GEO 价值</span>{brief.geoValue[0]?.replace(/^本站(?:解读|启示)[：:]\s*/u, "")}</p>
      <details className="rounded-control bg-bg-sunk px-3"><summary className="min-h-11 cursor-pointer py-2 text-[13px] font-medium text-ink-2">关键发现与适用范围</summary><div className="space-y-3 pb-3"><ul className="list-disc space-y-2 pl-4">{brief.findings.map((finding, i) => <li key={i} data-digest-finding="">{finding}</li>)}</ul>{brief.caveats.map((caveat, i) => <p key={i} className="text-[12px] leading-6 text-ink-3">{caveat}</p>)}</div></details>
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
  const readable = (item: GeoDailyItem) => item.brief?.coverage === "full-article" && !item.brief.automated;
  const recent = digest.recent.filter(readable);
  const pending = digest.recent.filter(item => !readable(item));
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
    <header className="border-b border-line pb-4 pt-2">
      <div className="flex items-center justify-between gap-3 text-[12px] text-ink-3"><time dateTime={digest.day}>{dateLabel(digest.day + "T00:00:00+08:00")}</time><Link to="/daily/editions" className="inline-flex min-h-10 items-center text-accent hover:underline">往期日报 →</Link></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 data-page-title="" className="text-[32px] font-semibold tracking-tight text-ink lg:text-[40px]">{library ? "中文解读" : "GEO 日报"}</h1><ContentLanguageToggle /></div>
      <p className="mt-2 text-[14px] leading-7 text-ink-2">{library ? "搜索已完成的解读，直接阅读结论、数据与 GEO 启示。" : "近 24 小时的变化，加上今天新读懂的研究。"}</p>
      <nav aria-label="阅读入口" className="mt-3 flex gap-2 text-[14px]">{[["/daily", "今日重点", !library], ["/daily?view=library", "中文解读", library]] .map(([href, label, selected]) => <Link key={String(href)} to={String(href)} aria-current={selected ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-control px-4 font-medium ${selected ? "bg-accent text-white" : "bg-bg-sunk text-ink-2 hover:text-accent"}`}>{label}</Link>)}</nav>
      {!library && <p className="mt-3 text-[12px] text-ink-3">{recent.length + digest.research.length} 篇可完整阅读 · 北京时间 {timeLabel(digest.generatedAt)} 更新</p>}
      {library && <Form method="get" action="/daily" className="mt-5 flex gap-2"><input type="hidden" name="view" value="library" /><input key={query} aria-label="搜索中文解读" type="search" name="q" maxLength={200} defaultValue={params.get("q") ?? ""} placeholder="搜索平台、问题或研究结论" className="min-h-11 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-[14px]" /><button className="min-h-11 rounded-control bg-accent px-4 text-[14px] text-white">搜索</button></Form>}
    </header>
    {!library && digest.latestEdition && <section aria-label="最新整期日报" className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-control bg-accent-soft px-4 py-3"><div><p className="text-[11px] text-ink-3">整期日报 · {digest.latestEdition.day}</p><h2 className="text-[14px] font-medium text-ink">{digest.latestEdition.title}</h2></div><Link to={`/daily/editions/${digest.latestEdition.id}`} className="inline-flex min-h-11 items-center text-[13px] font-medium text-accent">阅读全文 →</Link></section>}
    {([{ id: "daily-recent", title: "近 24 小时重点", subtitle: "按原文发布时间，已补齐中文解读。", items: recent, total: recent.length, empty: "近 24 小时暂无已完成的解读。" },
      { id: "daily-research", title: library ? "解读资料库" : "今日新解读", subtitle: library ? "保留原文日期，包含研究、实测与平台变化。" : "今天补齐，原文日期单独标注。", items: research, total: library ? research.length : digest.researchTotal, empty: library ? "没有匹配的中文解读，请尝试其他关键词。" : "今天还没有新解读，可先浏览此前已完成的中文解读。" }]).filter(section => library ? section.id === "daily-research" : section.items.length > 0).map(section => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-20 pt-6">
        <div className="mb-5"><h2 id={`${section.id}-heading`} className="text-[21px] font-semibold tracking-tight text-ink">{section.title}<span className="ml-3 text-[13px] font-normal text-ink-3">{section.items.length} 篇</span></h2><p className="mt-1 text-[12px] leading-6 text-ink-3">{section.subtitle}</p></div>
        <div className="rounded-card border border-line bg-surface px-5 pt-6 lg:px-8 lg:pt-8">{section.items.length ? <div className="divide-y divide-line">{section.items.slice(0, expanded.includes(section.id) ? undefined : 6).map((item, index) => <DigestCard key={item.id} item={item} index={index} />)}</div> : <p className="pb-6 text-[14px] leading-7 text-ink-3">{section.empty}</p>}
          {section.items.length > 6 && <button type="button" aria-expanded={expanded.includes(section.id)} onClick={() => toggleExpanded(section.id)} className="mb-5 min-h-11 w-full rounded-control border border-line text-[13px] text-accent hover:bg-accent-soft">{expanded.includes(section.id) ? "收起更多内容" : `继续阅读其余 ${section.items.length - 6} 篇`}</button>}
        </div>
        {section.total > section.items.length && <p className="mt-3 text-[12px] text-ink-3">本栏展示 {section.items.length} 篇重点，共 {section.total} 篇符合条件。</p>}
      </section>)}
    {!library && !recent.length && !research.length && <div className="mt-6 rounded-card border border-line p-6 text-[14px] leading-7 text-ink-2"><p>今天暂时没有新的完整解读。</p><Link to="/daily?view=library" className="inline-flex min-h-11 items-center text-accent">先读已有中文解读 →</Link></div>}
    {!library && pending.length > 0 && <details className="mt-6 rounded-card border border-line px-5"><summary className="min-h-11 cursor-pointer py-3 text-[13px] text-ink-3">更多动态 · {pending.length} 条暂仅来源摘要</summary><ul className="divide-y divide-line">{pending.map(item => <PendingItem key={item.id} item={item} />)}</ul></details>}
    <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[12px] text-ink-3"><Link to={library ? "/daily" : "/daily?view=library"} className="min-h-11 py-3 text-accent hover:underline">{library ? "返回今日重点 →" : "浏览全部中文解读 →"}</Link><Link to="/daily/archive" className="min-h-11 py-3 hover:text-accent">按日期查找来源动态 →</Link>{digest.candidatesTruncated && <span>当前从前 2,000 条候选中筛选，尚未展示全部内容。</span>}</footer>
  </div>;
}

function PendingItem({ item }: { item: GeoDailyItem }) {
  const content = useTranslatedContent(item);
  const { pathname, search } = useLocation();
  const from = pathname + search;
  return <li className="py-3 text-[14px] leading-7"><Link to={geoReaderHref(item.id, from)} state={{ geoReaderFrom: from }} className="font-medium text-ink hover:text-accent">{content.title}</Link><p className="text-[12px] text-ink-3">{item.sourceName} · 原文 {dateLabel(item.publishedAt)} · 来源摘要</p></li>;
}
