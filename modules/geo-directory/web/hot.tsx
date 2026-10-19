import { Link, useLoaderData } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { ItemList, PublicHeader } from "./components.tsx";
import type { hotLoader as loader } from "./overview-pages.server.ts";

export const handle = { tab: "hot", name: "热点" };
export const meta = () => pageMeta({ title: "GEO 热点榜：多来源报道聚合", description: "按近期公开来源的主题覆盖整理，查看每个主题的原始报道与社区讨论。", path: "/hot" });
export default function HotPage() {
  const data = useLoaderData<typeof loader>();
  return <div className="pb-12"><PublicHeader title="GEO 热点榜" eyebrow="COVERAGE BY TOPIC" description="按来源覆盖发现值得追踪的主题，展开查看具体报道。"><p className="mt-3 text-[12px] text-accent">统计范围：{data.window.label} · {data.window.itemCount} 条内容</p></PublicHeader>
    <details className="my-4 rounded-card border border-line px-4 py-3 text-[12px] leading-6 text-ink-3"><summary className="cursor-pointer">榜单依据与统计范围</summary><p className="mt-2">{data.rules.hotClusters}</p><p>这里反映已接入来源的报道覆盖，不代表全网浏览量、点赞量或平台真实热度。同一主题的不同事件也可能一起出现。</p></details>
    <div className="space-y-4">{data.hotClusters.map((cluster, index) => <section key={cluster.id} className="overflow-hidden rounded-card border border-line bg-surface"><div className="flex items-start gap-3 px-4 py-4"><span className="text-[26px] font-semibold text-accent">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><h2 className="text-[20px] font-semibold text-ink"><Link to={`/topics/${cluster.topicSlug}`} className="hover:text-accent">{cluster.title}</Link></h2><p className="mt-2 text-[12px] text-ink-3">{cluster.sourceCount} 个来源域名 · {cluster.itemCount} 条匹配</p><p className="mt-1 truncate text-[11px] text-ink-4">{cluster.sourceDomains.slice(0, 6).join(" · ")}</p></div></div><details><summary className="cursor-pointer border-t border-line px-5 py-3 text-[12px] text-accent">查看报道与帖子（展示 {cluster.items.length} 条）</summary><ItemList items={cluster.items} compact /></details></section>)}</div>
    {!data.hotClusters.length && <p className="p-10 text-center text-[13px] text-ink-3">当前还没有形成多来源主题聚合。<Link to="/all" className="ml-3 text-accent">查看全部动态 →</Link></p>}
  </div>;
}
