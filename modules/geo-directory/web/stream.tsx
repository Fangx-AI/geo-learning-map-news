import { useReadingPreference } from "./reading-preference.ts";
import { Form, Link, redirect, useLoaderData, useSearchParams } from "react-router";
import { loadOr404, cachedPage } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { ContentLanguageToggle } from "@aihot/web/components/translation";
import { TranslationProgress } from "./translation-progress.tsx";
import { languageNames } from "../data.ts";
import { ItemList, type CardItem } from "./components.tsx";
import { publicFeedAddress } from "./meta.ts";
import { CollectionPanel, type CollectionStatus } from "./collection-status.tsx";
import { SourcePicker, ReadingToggle, GroupingToggle, SortToggle, controlClass, kindNames, platformNames, periodNames, type FeedSourceOption } from "./feed-controls.tsx";

interface PublicFeed {
  items: CardItem[]; total: number; nextCursor: string | null;
  totalGroups?: number; groupMode?: "title" | "none"; searchTerms?: string[];
  sort?: "recommended" | "latest";
  sources: FeedSourceOption[]; languages: string[]; lastCollectedAt: string | null;
}
export const feedFilterKeys = ["q", "language", "source", "platform", "kind", "period", "groupKey"] as const;
export const handle = { tab: "featured", name: "全部 GEO 动态" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();
export const meta = ({ location }: { location: { search: string } }) => pageMeta({ title: "GEO 公开资讯流：全球来源的最新原文", description: "汇总全球公开来源中的 GEO 原文，按来源、平台、语言与发布时间筛选。", ...publicFeedAddress("/stream", location.search) });

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const groupMode = url.searchParams.get("group") || (url.searchParams.has("cursor") ? "none" : "title");
  const sort = url.searchParams.get("sort") || (url.searchParams.has("cursor") ? "latest" : "recommended");
  const query = new URLSearchParams({ limit: "30", group: groupMode, sort });
  for (const key of [...feedFilterKeys, "cursor"]) if (url.searchParams.get(key)) query.set(key, url.searchParams.get(key)!);
  const feedHeaders = new Headers();
  const statusHeaders = new Headers();
  const [feed, collection] = await Promise.all([
    loadOr404<PublicFeed>(`/api/geo/public-items?${query}`, { signal: request.signal, responseHeaders: feedHeaders }),
    loadOr404<CollectionStatus>("/api/geo/collection-status", { signal: request.signal, responseHeaders: statusHeaders }),
  ]);
  // Preserve shared links, and let invalid filters retain the API's validation response.
  if (url.pathname === "/stream") throw redirect(`/all${url.search}`, 308);
  const deadlines = [feedHeaders, statusHeaders].map(headers => headers.get("X-Accel-Expires")).filter((value): value is string => !!value);
  const upstream = new Headers();
  if ([feedHeaders, statusHeaders].some(headers => /no-cache|no-store/i.test(headers.get("Cache-Control") ?? "")) || deadlines.includes("0")) upstream.set("Cache-Control", "no-cache");
  const absolute = deadlines.filter(value => /^@\d+$/.test(value)).map(value => Number(value.slice(1)));
  if (absolute.length) upstream.set("X-Accel-Expires", `@${Math.min(...absolute)}`);
  return cachedPage(30, { ...feed, groupMode: feed.groupMode ?? groupMode as "title" | "none", sort: feed.sort ?? sort as "recommended" | "latest", collection }, upstream);
}

export default function PublicStreamPage() {
  const feed = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const [compact, setCompact] = useReadingPreference();
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!next.has("group") && params.has("cursor")) next.set("group", feed.groupMode);
    if (!next.has("sort") && params.has("cursor")) next.set("sort", feed.sort);
    next.delete("cursor");
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { preventScrollReset: true });
  };
  const without = (key: string) => { const next = new URLSearchParams(params); if (!next.has("group") && params.has("cursor")) next.set("group", feed.groupMode); if (!next.has("sort") && params.has("cursor")) next.set("sort", feed.sort); next.delete(key); next.delete("cursor"); return `/all${next.size ? `?${next}` : ""}`; };
  const nextPage = new URLSearchParams(params);
  if (feed.nextCursor) { nextPage.set("cursor", feed.nextCursor); nextPage.set("group", feed.groupMode); nextPage.set("sort", feed.sort); }
  const grouped = (feed.groupMode ?? params.get("group") ?? "title") === "title";
  const active = feedFilterKeys.filter(key => params.get(key));
  const label = (key: typeof feedFilterKeys[number]) => {
    const value = params.get(key)!;
    return key === "groupKey" ? "当前相似标题组" : key === "q" ? `关键词：${value}` : key === "source" ? feed.sources.find(source => source.id === value)?.name ?? value : key === "language" ? languageNames[value] ?? value : key === "kind" ? kindNames[value] ?? value : key === "platform" ? platformNames[value] ?? value : periodNames[value] ?? value;
  };

  return <div className="pb-12">
    <PhoneBar title="全部 GEO 动态" back={{ to: "/", label: "精选" }} />
    <header className="border-b border-line pb-4 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 data-page-title="" className="text-[27px] font-semibold tracking-tight text-ink">全部 GEO 动态</h1><ContentLanguageToggle /></div>
      <p className="mt-1 text-[13px] leading-6 text-ink-3">这里包含尚未补齐解读的来源摘要。</p>
      <Link to="/daily?view=library" className="mt-3 inline-flex min-h-11 items-center rounded-control bg-accent px-4 text-[14px] font-medium text-white">直接读中文解读 →</Link>
      <TranslationProgress />
    </header>
    <section aria-label="筛选公开动态" className="pt-4">
      <Form method="get" action="/all" className="flex gap-2" key={params.get("q") ?? ""}>
        {feedFilterKeys.filter(key => key !== "q").map(key => params.get(key) && <input key={key} type="hidden" name={key} value={params.get(key)!} />)}
        <input type="hidden" name="group" value={feed.groupMode} />
        <input type="hidden" name="sort" value={feed.sort} />
        <label className="min-w-0 flex-1"><span className="sr-only">搜索公开动态</span><input type="search" name="q" maxLength={200} defaultValue={params.get("q") ?? ""} placeholder='搜索标题、摘要；双引号查精确短语' className={controlClass} /></label>
        <button type="submit" className="rounded-control bg-accent px-5 text-[13px] font-semibold text-white">搜索</button>
      </Form>
      <div role="group" aria-label="内容获取方式" className="mt-3 flex flex-wrap gap-2">{[["", "全部"], ...Object.entries(kindNames)].map(([value, name]) => <button key={value} type="button" aria-pressed={(params.get("kind") ?? "") === value} onClick={() => change("kind", value)} className={`min-h-9 rounded-full border px-3 text-[12px] ${((params.get("kind") ?? "") === value) ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-3 hover:border-accent"}`}>{name}</button>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div><span className="mb-1 block text-[11px] text-ink-3">来源</span><SourcePicker sources={feed.sources} value={params.get("source") ?? ""} onChange={value => change("source", value)} /></div>
        <label><span className="mb-1 block text-[11px] text-ink-3">平台</span><select aria-label="资讯平台" value={params.get("platform") ?? ""} onChange={event => change("platform", event.target.value)} className={controlClass}><option value="">全部平台</option>{Object.entries(platformNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label><span className="mb-1 block text-[11px] text-ink-3">原文语言</span><select aria-label="原文语言" value={params.get("language") ?? ""} onChange={event => change("language", event.target.value)} className={controlClass}><option value="">全部语言</option>{feed.languages.map(lang => <option key={lang} value={lang}>{languageNames[lang] ?? lang}</option>)}</select></label>
        <label><span className="mb-1 block text-[11px] text-ink-3">发布时间</span><select aria-label="发布时间" value={params.get("period") ?? ""} onChange={event => change("period", event.target.value)} className={controlClass}><option value="">不限时间</option>{Object.entries(periodNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      </div>
      {active.length > 0 && <div aria-label="已选筛选" className="mt-3 flex flex-wrap items-center gap-2">{active.map(key => <Link key={key} to={without(key)} aria-label={`移除筛选：${label(key)}`} preventScrollReset className="max-w-full break-words rounded-control bg-accent-soft px-2.5 py-2 text-[11px] text-accent">{label(key)} <span aria-hidden="true">×</span></Link>)}<Link to="/all" className="min-h-9 px-1 py-2 text-[11px] text-ink-3 hover:underline">清除全部</Link></div>}
      {params.get("period") && <p className="mt-2 text-[11px] text-ink-4">按来源提供的发布时间筛选，聚合条目使用索引标注时间；日期待确认的资料不计入。</p>}
      {params.get("q") && <p className="mt-2 text-[11px] text-ink-4">空格分隔的词同时匹配，英文双引号内的内容按完整短语搜索。</p>}
    </section>
    <CollectionPanel collection={feed.collection} />
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><SortToggle value={feed.sort} onChange={value => change("sort", value)} /><p role="status" aria-live="polite" className="text-[12px] text-ink-3">{active.length ? "匹配" : "已收录"} <strong className="text-ink">{feed.total.toLocaleString("zh-CN")}</strong> 条{grouped && feed.totalGroups !== undefined && <span> · 合为 {feed.totalGroups.toLocaleString("zh-CN")} 组展示</span>}{params.has("cursor") && <Link to={without("cursor")} className="ml-3 text-accent hover:underline">回到第一页</Link>}</p></div><div className="flex flex-wrap gap-2"><GroupingToggle grouped={grouped} onChange={value => change("group", value ? "title" : "none")} /><ReadingToggle compact={compact} onChange={setCompact} /></div></div>
    {feed.items.length ? <ItemList items={feed.items} compact={compact} query={feed.searchTerms ?? params.get("q") ?? ""} /> : <div className="rounded-card border border-dashed border-line px-5 py-8 text-center"><h2 className="text-[16px] font-semibold text-ink">没有找到匹配的动态</h2><p className="mt-2 text-[13px] leading-6 text-ink-3">试试更短的关键词，或移除一个筛选。其他条件会保留。</p><div className="mt-4 flex flex-wrap justify-center gap-4">{params.get("q") && <Link to={without("q")} className="min-h-11 py-3 text-[13px] text-accent">只清除关键词</Link>}<Link to="/all" className="min-h-11 py-3 text-[13px] text-accent">查看全部动态 →</Link></div></div>}
    {feed.nextCursor && <Link to={`/all?${nextPage}`} className="mt-6 block rounded-control border border-line bg-surface p-3 text-center text-[13px] font-semibold text-accent">下一页 →</Link>}
  </div>;
}
