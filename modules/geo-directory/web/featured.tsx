import { Link, useLoaderData } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { ItemList, PublicHeader } from "./components.tsx";
import type { featuredLoader as loader } from "./overview-pages.server.ts";

export const handle = { tab: "featured", name: "精选" };
export const meta = () => pageMeta({ title: "GEO 阅读精选", description: "从全球 GEO 公开内容中，按相关性与来源多样性整理的阅读精选。", path: "/" });
export default function FeaturedPage() {
  const data = useLoaderData<typeof loader>();
  return <div className="pb-12"><PublicHeader title="GEO 阅读精选" eyebrow="READING PICKS" description="全球 GEO 研究、实测与平台动态。" />
    <div className="my-5 grid grid-cols-3 gap-3">{[[data.stats.total, "累计动态"], [data.stats.sourceCount, "有内容的来源"], [data.stats.topicCount, "已命中主题"]].map(([number, label]) => <div key={label} className="rounded-card border border-line bg-surface p-4"><strong className="text-[24px] font-semibold text-ink">{number}</strong><p className="mt-1 text-[11px] text-ink-3">{label}</p></div>)}</div>
    <p className="mb-4 text-[12px] text-accent">{data.window.label}</p><ItemList items={data.highlights} />
    <div className="mt-6 text-center"><Link to="/all" className="text-[13px] font-semibold text-accent">浏览全部 {data.stats.total} 条动态 →</Link></div>
    <h2 className="mb-4 mt-10 text-[20px] font-semibold text-ink">按学习方向浏览</h2><div className="grid gap-4 lg:grid-cols-2">{data.collections.map(collection => <details key={collection.key} className="overflow-hidden rounded-card border border-line bg-surface"><summary className="cursor-pointer px-5 py-4 text-[14px] font-semibold text-ink">{collection.name}<span className="ml-2 text-[12px] font-normal text-ink-4">{collection.count} 条匹配 · 展开近期条目</span></summary><ItemList items={collection.items} /></details>)}</div>
    {data.stats.truncated && <p className="mt-4 text-[12px] text-ink-4">分类与精选基于最近 {data.stats.analyzedItems} 条内容，全部存档可在动态页搜索。</p>}
  </div>;
}
