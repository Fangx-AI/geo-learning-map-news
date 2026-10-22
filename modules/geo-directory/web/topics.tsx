import { Link, useLoaderData, useSearchParams } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { PublicHeader } from "./components.tsx";
import type { topicsLoader as loader } from "./overview-pages.server.ts";
export const handle = { home: "featured", name: "平台" };
export const meta = () => pageMeta({ title: "GEO 平台与主题", description: "按 AI 平台、话题和内容类型浏览全球 GEO 资讯。", path: "/topics" });
export default function TopicsPage() {
  const data = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const topics = data.topics.filter(topic => `${topic.name} ${topic.description}`.toLowerCase().includes(q.toLowerCase()));
  return <div className="pb-12"><PublicHeader title="平台与主题" description="按 AI 平台、话题或内容类型看 GEO 资讯。" /><label className="my-5 block"><span className="sr-only">搜索主题</span><input type="search" value={q} onChange={event => setParams(event.target.value ? { q: event.target.value } : {}, { preventScrollReset: true })} placeholder="搜索主题，如 ChatGPT、Reddit、抓取" className="min-h-11 w-full rounded-control border border-line bg-surface px-4 text-[13px] text-ink" /></label>
    {([['company', 'AI 平台与工具'], ['field', '话题'], ['genre', '内容类型']] as const).map(([group, name]) => <section key={group} className="mb-8"><h2 className="mb-3 text-[19px] font-semibold text-ink">{name}</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{topics.filter(topic => topic.group === group).map(topic => <Link key={topic.slug} to={`/topics/${topic.slug}`} className="rounded-card border border-line bg-surface p-5 hover:border-accent"><div className="flex items-start justify-between gap-3"><h3 className="text-[15px] font-semibold text-ink">{topic.name}</h3><span className="shrink-0 text-[12px] text-accent">{topic.count} 条</span></div><p className="mt-3 text-[12px] leading-6 text-ink-3">{topic.description}</p></Link>)}</div></section>)}
    {!topics.length && <p className="p-8 text-center text-ink-3">没有匹配的主题，可以换一个关键词。</p>}
  </div>;
}
