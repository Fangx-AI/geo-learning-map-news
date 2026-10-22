import { Link, useLoaderData } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { ItemList, PublicHeader } from "./components.tsx";
import type { hotLoader as loader } from "./overview-pages.server.ts";

export const handle = { tab: "hot", name: "热点" };
export const meta = () => pageMeta({ title: "GEO 热点榜：多来源报道聚合", description: "按近期公开来源的主题覆盖整理，查看每个主题的原始报道与社区讨论。", path: "/hot" });
export default function HotPage() {
  const data = useLoaderData<typeof loader>();
  return <div className="pb-12"><PublicHeader title="GEO 热点榜" description="最近被最多来源同时报道的平台和话题。"><p className="mt-3 text-[12px] text-accent">统计范围：{data.window.label} · {data.window.itemCount} 条内容</p></PublicHeader>
    <div className="my-4" />
    <div className="space-y-4">{data.hotClusters.map((cluster, index) => <section key={cluster.id} className="overflow-hidden rounded-card border border-line bg-surface"><div className="flex items-start gap-3 px-4 py-4"><span className="text-[26px] font-semibold text-accent">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><h2 className="text-[20px] font-semibold text-ink"><Link to={`/topics/${cluster.topicSlug}`} className="hover:text-accent">{cluster.title}</Link></h2><p className="mt-2 text-[12px] text-ink-3">{cluster.sourceCount} 个来源域名 · {cluster.itemCount} 条匹配</p><p className="mt-1 truncate text-[11px] text-ink-4">{cluster.sourceDomains.slice(0, 6).join(" · ")}</p></div></div><details><summary className="cursor-pointer border-t border-line px-5 py-3 text-[12px] text-accent">查看报道与帖子（展示 {cluster.items.length} 条）</summary><ItemList items={cluster.items} compact /></details></section>)}</div>
    {!data.hotClusters.length && <p className="p-10 text-center text-[13px] text-ink-3">当前还没有形成多来源主题聚合。<Link to="/all" className="ml-3 text-accent">查看全部资讯 →</Link></p>}
  </div>;
}
