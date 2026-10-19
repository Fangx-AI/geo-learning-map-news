import { Form, Link, useLoaderData, useSearchParams } from "react-router";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import type { atlasLoader } from "./overview-pages.server.ts";
import { CollectionPanel, sourceStatusLabel, timeLabel } from "./collection-status.tsx";
export { atlasLoader as loader, headers } from "./overview-pages.server.ts";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof atlasLoader>();
import { SITE } from "@aihot/site";
import { pageMeta, breadcrumbLd } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { sources, filterSources, languageNames, evidenceNames, collectionLabel, sourcesOpml } from "../data.ts";

export const handle: Screen = { tab: "sources", name: "全球信源" };
export const meta = () => pageMeta({
  title: "全球 GEO 信源目录：平台、研究、媒体与社交社区",
  description: `浏览 ${sources.length} 个 GEO 信息来源，按语言、地区、来源类型筛选。覆盖 AI 搜索官方资料、研究、实践、工具和国内外社交平台。`,
  path: "/atlas",
  jsonLd: breadcrumbLd([{ name: SITE.name, path: "/" }, { name: "全球信源", path: "/atlas" }]),
});

const values = (key: "type" | "region" | "language") => [...new Set(sources.map((source) => source[key]))];
const lastChecked = sources.reduce((latest, source) => source.checkedAt > latest ? source.checkedAt : latest, "");
const controlClass = "min-h-11 w-full rounded-control border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-accent";

export default function SourcesPage() {
  const [params, setParams] = useSearchParams();
  const { collection } = useLoaderData<typeof atlasLoader>();
  const stateById = new Map(collection.sources.map(source => [source.id, source]));
  const configured = sources.filter(source => source.sourceId && stateById.get(source.sourceId)?.enabled);
  const filterParams = new URLSearchParams(params);
  if (filterParams.get("access") === "configured") filterParams.delete("access");
  const filtered = filterSources(params.get("access") === "configured" ? configured : sources, filterParams)
    .filter(source => !params.get("evidence") || source.evidence === params.get("evidence"));
  const feeds = filtered.filter((source) => source.feedUrl);
  const hasFilters = ["q", "type", "region", "language", "access", "evidence"].some((key) => params.get(key));
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { preventScrollReset: true });
  };
  const download = () => {
    const blob = new Blob([sourcesOpml(filtered)], { type: "text/x-opml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "geo-learning-map-feeds.opml";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="pb-10">
    <PhoneBar title="全球信源" />
    <header className="border-b border-line pb-4 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 data-page-title="" className="text-[27px] font-semibold tracking-tight text-ink">全球 GEO 信源</h1><Link className="min-h-9 py-2 text-[12px] text-accent hover:underline" to="/all">阅读已收录动态 →</Link></div>
      <p className="mt-1 text-[13px] leading-6 text-ink-3">找到值得长期关注的官方资料、研究、作者与社区。</p>
      <p className="mt-2 text-[12px] text-ink-3"><b className="text-ink">{sources.length}</b> 个目录入口 · <b className="text-ink">{configured.length}</b> 个已接公开采集 · {values("language").length} 种语言</p>
    </header>

    <section aria-label="筛选信源" className="py-4">
      <Form method="get" className="flex gap-2" key={params.get("q") ?? ""}>
        {["type", "region", "language", "access", "evidence"].map((key) => params.get(key) && <input key={key} type="hidden" name={key} value={params.get(key)!} />)}
        <label className="min-w-0 flex-1"><span className="sr-only">搜索信源</span><input type="search" name="q" defaultValue={params.get("q") ?? ""} placeholder="搜索平台、作者或关键词" className={controlClass} /></label>
        <button type="submit" className="rounded-control bg-accent px-5 text-[13px] font-semibold text-white">搜索</button>
      </Form>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <label><span className="mb-1.5 block text-[11px] text-ink-3">来源性质</span><select className={controlClass} value={params.get("evidence") ?? ""} onChange={(event) => change("evidence", event.target.value)}><option value="">全部性质</option>{Object.entries(evidenceNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        {([['type', '来源类型'], ['region', '地区'], ['language', '语言']] as const).map(([key, label]) => <label key={key}><span className="mb-1.5 block text-[11px] text-ink-3">{label}</span><select className={controlClass} value={params.get(key) ?? ""} onChange={(event) => change(key, event.target.value)}><option value="">全部{label}</option>{values(key).map((value) => <option key={value} value={value}>{key === "language" ? languageNames[value] ?? value : value}</option>)}</select></label>)}
        <label><span className="mb-1.5 block text-[11px] text-ink-3">获取方式</span><select className={controlClass} value={params.get("access") ?? ""} onChange={(event) => change("access", event.target.value)}><option value="">全部方式</option><option value="rss">有 RSS 订阅</option><option value="configured">已接公开采集</option><option value="social">社交媒体与社区</option></select></label>
      </div>
      <details className="mt-3 text-[11px] leading-6 text-ink-4"><summary className="cursor-pointer">目录覆盖与采集方式说明</summary><p>来源性质说明目录入口的类型，不代表逐篇事实核验；聚合入口的类型不代表其索引标注发布者。目录持续扩展，目录入口不等于已自动采集。已接来源可直接查看收录内容；完整时间线、搜索和部分平台内容仍可能需要登录或 API。X、Reddit 的已发现公开原帖会单独收录，不代表完整平台覆盖。</p></details>
    </section>

    <CollectionPanel collection={collection} />
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p role="status" aria-live="polite" className="text-[13px] text-ink-3">找到 <strong className="text-ink">{filtered.length}</strong> 个来源{hasFilters && <Link className="ml-3 text-accent hover:underline" to="/atlas">清除筛选</Link>}</p>
      <button type="button" onClick={download} disabled={!feeds.length} className="text-[12px] font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40">导出当前 RSS（{feeds.length}）↗</button>
    </div>
    {filtered.length ? <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {filtered.map((source) => { const state = source.sourceId ? stateById.get(source.sourceId) : undefined; return <li key={source.id} className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium text-ink-3"><span className="rounded bg-bg-sunk px-2 py-1">{source.type}</span><span>{source.region} · {languageNames[source.language] ?? source.language}</span></div>
        <h2 className="mt-3 text-[16px] font-semibold leading-snug text-ink"><a href={source.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">{source.name}<span aria-hidden="true" className="ml-1 text-[12px] text-ink-4">↗</span></a></h2>
        <p className="mt-1 truncate text-[11px] text-ink-4">{new URL(source.url).hostname}</p>
        <p className="mt-2 flex-1 text-[12px] leading-6 text-ink-2">{source.description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{source.topics.map((topic) => <button key={topic} type="button" onClick={() => change("q", topic)} className="rounded border border-line-soft px-1.5 py-0.5 text-[10px] text-ink-3 hover:border-accent hover:text-accent">{topic}</button>)}</div>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-line-soft pt-3 text-[10px]"><span className="text-ink-4">{evidenceNames[source.evidence] ?? source.evidence}</span><span className="text-accent">{state ? sourceStatusLabel(state) : collectionLabel(source) === "已接采集" ? "采集状态未确认" : collectionLabel(source)}</span>{source.feedUrl && <a className="font-semibold text-accent hover:underline" href={source.feedUrl} target="_blank" rel="noopener noreferrer" aria-label={`${source.name} RSS`}>RSS ↗</a>}</div>
        {state?.enabled && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]"><Link to={`/all?source=${encodeURIComponent(state.id)}`} className="min-h-9 rounded border border-line px-3 py-2 font-medium text-accent hover:bg-accent-soft">查看已收录内容 →</Link><span className="text-ink-4" title={state.lastSuccessAt ? `最近成功检查 ${timeLabel(state.lastSuccessAt)}（北京时间）` : undefined}>{state.lastSuccessAt ? `检查于 ${timeLabel(state.lastSuccessAt)}` : "等待首次检查"}</span></div>}
      </li>; })}
    </ul> : <div className="rounded-card border border-dashed border-line py-16 text-center"><h2 className="text-[16px] font-semibold text-ink">没有找到匹配的信源</h2><p className="mt-2 text-[13px] text-ink-3">试试更短的关键词，或减少筛选条件。</p><Link to="/atlas" className="mt-4 inline-block text-[13px] text-accent">查看全部来源 →</Link></div>}
    <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[12px] text-ink-4"><span>目录最近更新于 {lastChecked}</span><Link className="text-accent hover:underline" to="/feedback">推荐来源或报告失效链接 →</Link></footer>
  </div>;
}

