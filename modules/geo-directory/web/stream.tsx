import { useStaticSnapshot } from "@aihot/web/lib/static-snapshot";
import { Form, Link, redirect, useLoaderData, useSearchParams } from "react-router";
import { loadOr404, cachedPage } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { ContentLanguageToggle } from "@aihot/web/components/translation";
import { languageNames } from "../data.ts";
import { ItemList, type CardItem } from "./components.tsx";
import { publicFeedAddress } from "./meta.ts";
import { SourcePicker, SortToggle, controlClass, platformNames, periodNames, type FeedSourceOption } from "./feed-controls.tsx";

interface PublicFeed {
  items: CardItem[]; total: number; hiddenTotal: number; nextCursor: string | null;
  totalGroups?: number; groupMode?: "title" | "none"; searchTerms?: string[];
  sort?: "recommended" | "latest";
  sources: FeedSourceOption[]; languages: string[]; lastCollectedAt: string | null;
}
export const feedFilterKeys = ["q", "language", "source", "platform", "kind", "period", "groupKey"] as const;
export const handle = { tab: "all", name: "最新" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();
export const meta = ({ location }: { location: { search: string } }) => pageMeta({ title: "最新 GEO 资讯", description: "全球 GEO 与 AI 搜索资讯，按时间排列，可按平台、来源、语言和关键词筛选。", ...publicFeedAddress("/stream", location.search) });

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const groupMode = url.searchParams.get("group") || (url.searchParams.has("cursor") ? "none" : "title");
  const sort = url.searchParams.get("sort") || "latest";
  // Promotion, rankings and reprints stay folded unless the reader asks for everything.
  const quality = url.searchParams.get("quality") === "all" ? "all" : "useful";
  const query = new URLSearchParams({ limit: "30", group: groupMode, sort, quality });
  for (const key of [...feedFilterKeys, "cursor"]) if (key !== "kind" && url.searchParams.get(key)) query.set(key, url.searchParams.get(key)!);
  // Articles by default; social posts and every kind are one tap away.
  const kind = url.searchParams.get("kind") || "direct";
  if (kind !== "all") query.set("kind", kind);
  const upstream = new Headers();
  const feed = await loadOr404<PublicFeed>(`/api/geo/public-items?${query}`, { signal: request.signal, responseHeaders: upstream });
  // Preserve shared links, and let invalid filters retain the API's validation response.
  if (url.pathname === "/stream") throw redirect(`/all${url.search}`, 308);
  return cachedPage(30, { ...feed, groupMode: feed.groupMode ?? groupMode as "title" | "none", sort: feed.sort ?? sort as "recommended" | "latest", quality }, upstream);
}

const beijingDay = (value: string) => new Date(Date.parse(value) + 8 * 3600_000).toISOString().slice(0, 10);
const dayHeading = (day: string, now = Date.now()) => day === beijingDay(new Date(now).toISOString()) ? "今天" : day === beijingDay(new Date(now - 86_400_000).toISOString()) ? "昨天" : `${Number(day.slice(5, 7))}月${Number(day.slice(8))}日`;
const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] ${on ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-accent hover:text-accent"}`;

function StaticFeedFilters({ kind, period, sort }: { kind: string; period: string; sort: string }) {
  const kinds: Array<[string, string]> = [["direct", "文章"], ["aggregated", "媒体报道"], ["social", "社交帖子"], ["all", "全部"]];
  const one = (key: string, value: string) => value ? `/all?${key}=${encodeURIComponent(value)}` : "/all";
  return <div className="space-y-3">
    <p className="rounded-control bg-bg-sunk px-3 py-2 text-[13px] leading-6 text-ink-3">这是只读快照。搜索、来源、语言和发布平台筛选需要在线站点，点了也不会改列表，所以这里不放。下面每种条件单独打开一页。</p>
    <div role="group" aria-label="内容类型" className="flex flex-wrap gap-2">{kinds.map(([value, name]) => <Link key={value} to={one("kind", value === "direct" ? "" : value)} aria-current={kind === value ? "page" : undefined} className={chip(kind === value)}>{name}</Link>)}</div>
    <div role="group" aria-label="发布时间" className="flex flex-wrap gap-2">{[["", "全部时间"], ...Object.entries(periodNames)].map(([value, name]) => <Link key={value || "all-time"} to={one("period", value)} aria-current={period === value ? "page" : undefined} className={chip(period === value)}>{name}</Link>)}</div>
    <div role="group" aria-label="内容排序" className="flex flex-wrap gap-2">
      <Link to="/all" aria-current={sort !== "recommended" ? "page" : undefined} className={chip(sort !== "recommended")}>最新</Link>
      <Link to="/all?sort=recommended" aria-current={sort === "recommended" ? "page" : undefined} className={chip(sort === "recommended")}>推荐</Link>
    </div>
  </div>;
}

export default function PublicStreamPage() {
  const staticSnapshot = useStaticSnapshot();
  const feed = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const next = () => {
    const query = new URLSearchParams(params);
    if (!query.has("group") && params.has("cursor")) query.set("group", feed.groupMode);
    if (!query.has("sort") && params.has("cursor")) query.set("sort", feed.sort);
    query.delete("cursor");
    return query;
  };
  const change = (key: string, value: string) => {
    const query = next();
    if (value) query.set(key, value); else query.delete(key);
    setParams(query, { preventScrollReset: true });
  };
  const without = (key: string) => { const query = next(); query.delete(key); return `/all${query.size ? `?${query}` : ""}`; };
  const withAll = () => { const query = next(); query.set("quality", "all"); return `/all?${query}`; };
  const nextPage = new URLSearchParams(params);
  if (feed.nextCursor) { nextPage.set("cursor", feed.nextCursor); nextPage.set("group", feed.groupMode); nextPage.set("sort", feed.sort); }
  const active = feedFilterKeys.filter(key => key !== "kind" && params.get(key));
  const label = (key: typeof feedFilterKeys[number]) => {
    const value = params.get(key)!;
    return key === "groupKey" ? "同一组报道" : key === "q" ? `关键词：${value}` : key === "source" ? feed.sources.find(source => source.id === value)?.name ?? value : key === "language" ? languageNames[value] ?? value : key === "platform" ? platformNames[value] ?? value : periodNames[value] ?? value;
  };
  const days = new Map<string, CardItem[]>();
  for (const item of feed.items) {
    const day = feed.sort === "latest" ? beijingDay(item.publishedAt ?? item.collectedAt) : "";
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  const kind = params.get("kind") || "direct";
  const kinds: Array<[string, string]> = [["direct", "文章"], ["aggregated", "媒体报道"], ["social", "社交帖子"], ["all", "全部"]];

  return <div className="mx-auto max-w-4xl pb-12">
    <PhoneBar title="最新资讯" back={{ to: "/", label: "首页" }} />
    <header className="border-b border-line pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 data-page-title="" className="text-[27px] font-semibold tracking-tight text-ink">最新资讯</h1><ContentLanguageToggle /></div>
      <p role="status" aria-live="polite" className="mt-1 text-[14px] text-ink-3">
        {active.length ? "找到" : "共"} <strong className="text-ink">{feed.total.toLocaleString("zh-CN")}</strong> 条{feed.groupMode === "title" && feed.totalGroups !== undefined && feed.totalGroups < feed.total && ` · 合为 ${feed.totalGroups.toLocaleString("zh-CN")} 组`}{!active.length && " · 全部时间，不是首页那个时间窗"}
        {feed.quality === "useful" && feed.hiddenTotal > 0 && <> · 已折叠 {feed.hiddenTotal.toLocaleString("zh-CN")} 条服务商软文、排行榜和转载 <Link to={withAll()} preventScrollReset className="text-accent hover:underline">显示</Link></>}
        {feed.quality === "all" && <> · 含软文和转载 <Link to={without("quality")} preventScrollReset className="text-accent hover:underline">折叠</Link></>}
      </p>
    </header>
    <section aria-label="筛选资讯" className="space-y-3 pt-4">
      {staticSnapshot ? <StaticFeedFilters kind={kind} period={params.get("period") ?? ""} sort={feed.sort} /> : <>
      <Form method="get" action="/all" className="flex gap-2" key={params.get("q") ?? ""}>
        {[...feedFilterKeys.filter(key => key !== "q"), "quality", "sort"].map(key => params.get(key) && <input key={key} type="hidden" name={key} value={params.get(key)!} />)}
        <label className="min-w-0 flex-1"><span className="sr-only">搜索资讯</span><input type="search" name="q" maxLength={200} defaultValue={params.get("q") ?? ""} placeholder="搜索标题和摘要，如 AI Mode、llms.txt、豆包" className={controlClass} /></label>
        <button type="submit" className="rounded-control bg-accent px-5 text-[14px] font-semibold text-white">搜索</button>
      </Form>
      <div role="group" aria-label="内容类型" className="flex flex-wrap gap-2">{kinds.map(([value, name]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => change("kind", value === "direct" ? "" : value)} className={chip(kind === value)}>{name}</button>)}</div>
      <div role="group" aria-label="发布时间" className="flex flex-wrap gap-2">{[["", "全部时间"], ...Object.entries(periodNames)].map(([value, name]) => <button key={value} type="button" aria-pressed={(params.get("period") ?? "") === value} onClick={() => change("period", value)} className={chip((params.get("period") ?? "") === value)}>{name}</button>)}</div>
      <details className="rounded-control border border-line bg-surface px-3 py-2" open={!!(params.get("source") || params.get("language") || params.get("platform"))}>
        <summary className="min-h-9 cursor-pointer py-2 text-[13px] text-ink-2">更多筛选：来源、语言、发布平台、排序</summary>
        <div className="grid grid-cols-1 gap-3 pb-2 pt-1 sm:grid-cols-2">
          <div><span className="mb-1 block text-[12px] text-ink-3">来源</span><SourcePicker sources={feed.sources} value={params.get("source") ?? ""} onChange={value => change("source", value)} /></div>
          <label><span className="mb-1 block text-[12px] text-ink-3">原文语言</span><select aria-label="原文语言" value={params.get("language") ?? ""} onChange={event => change("language", event.target.value)} className={controlClass}><option value="">全部语言</option>{feed.languages.map(lang => <option key={lang} value={lang}>{languageNames[lang] ?? lang}</option>)}</select></label>
          <label><span className="mb-1 block text-[12px] text-ink-3">发布平台</span><select aria-label="发布平台" value={params.get("platform") ?? ""} onChange={event => change("platform", event.target.value)} className={controlClass}><option value="">全部平台</option>{Object.entries(platformNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <div><span className="mb-1 block text-[12px] text-ink-3">排序</span><SortToggle value={feed.sort} onChange={value => change("sort", value)} /></div>
        </div>
      </details>
      </>}
      {active.length > 0 && <div aria-label="已选筛选" className="flex flex-wrap items-center gap-2">{active.map(key => <Link key={key} to={without(key)} aria-label={`移除筛选：${label(key)}`} preventScrollReset className="max-w-full break-words rounded-control bg-accent-soft px-2.5 py-2 text-[12px] text-accent">{label(key)} <span aria-hidden="true">×</span></Link>)}<Link to="/all" className="min-h-9 px-1 py-2 text-[12px] text-ink-3 hover:underline">清除全部</Link></div>}
    </section>
    <div className="mt-5">
      {feed.items.length ? [...days].map(([day, items]) => <div key={day || "ranked"} className="mb-5">
        {day && <h2 className="mb-2 text-[13px] font-semibold text-ink-3" suppressHydrationWarning>{dayHeading(day)}</h2>}
        <ItemList items={items} query={feed.searchTerms ?? params.get("q") ?? ""} />
      </div>) : <div className="rounded-card border border-dashed border-line px-5 py-8 text-center"><h2 className="text-[16px] font-semibold text-ink">没有找到匹配的资讯</h2><p className="mt-2 text-[14px] leading-6 text-ink-3">换个更短的关键词，或去掉一个筛选。{params.get("period") && "日期待确认的资讯不计入时间筛选。"}</p><div className="mt-4 flex flex-wrap justify-center gap-4">{params.get("q") && <Link to={without("q")} className="min-h-11 py-3 text-[14px] text-accent">只清除关键词</Link>}{feed.quality === "useful" && feed.hiddenTotal > 0 && <Link to={withAll()} className="min-h-11 py-3 text-[14px] text-accent">在折叠内容里找</Link>}<Link to="/all" className="min-h-11 py-3 text-[14px] text-accent">查看全部资讯 →</Link></div></div>}
    </div>
    {params.has("cursor") && <Link to={without("cursor")} className="mt-2 inline-block text-[13px] text-accent hover:underline">回到第一页</Link>}
    {feed.nextCursor && <Link to={`/all?${nextPage}`} className="mt-4 block rounded-control border border-line bg-surface p-3 text-center text-[14px] font-semibold text-accent">下一页 →</Link>}
  </div>;
}
