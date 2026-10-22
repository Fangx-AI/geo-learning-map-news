import { Link, useLoaderData } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { ItemList, PublicHeader } from "./components.tsx";
import type { topicLoader as loader } from "./overview-pages.server.ts";
export const handle = { home: "featured", name: "平台" };
export const meta = ({ location, loaderData }: { location: { pathname: string }; loaderData?: { topic: { name: string; description: string } } }) => pageMeta({ title: loaderData?.topic.name ?? "GEO 主题资料", description: loaderData?.topic.description ?? "与当前 GEO 学习主题匹配的原始文章和公开帖子。", path: location.pathname });
export default function TopicPage() {
  const { topic } = useLoaderData<typeof loader>();
  return <div className="pb-12"><PublicHeader title={topic.name} description={topic.description} /><p className="my-4 text-[13px] leading-6 text-ink-3"><Link to="/topics" className="mr-4 text-accent">← 全部平台与主题</Link>共 {topic.count} 条{topic.count > topic.items.length ? `，显示最近 ${topic.items.length} 条` : ""}</p><ItemList items={topic.items} /></div>;
}
