import { Link, useLoaderData } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { ContentLanguageToggle } from "@aihot/web/components/translation";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { DigestCard } from "./daily-digest.tsx";
import type { featuredLoader as loader } from "./overview-pages.server.ts";

export const handle = { tab: "featured", name: "精选" };
export const meta = () => pageMeta({ title: "GEO 阅读精选", description: "读懂全球 GEO 研究、实测与平台变化：结论、关键数据和实际价值。", path: "/" });
export default function FeaturedPage() {
  const data = useLoaderData<typeof loader>();
  return <div className="mx-auto max-w-4xl pb-12"><PhoneBar title="阅读精选" />
    <header className="mb-6 border-b border-line pb-5 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 data-page-title="" className="text-[28px] font-semibold tracking-tight text-ink lg:text-[34px]">GEO 阅读精选</h1><ContentLanguageToggle /></div>
      <p className="mt-3 text-[15px] leading-7 text-ink-2">读懂全球 AI 搜索变化，找到值得行动的证据。</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px]"><Link to="/daily" className="inline-flex min-h-11 items-center rounded-control bg-accent px-4 font-medium text-white">看今日日报 →</Link><Link to="/daily?view=library" className="inline-flex min-h-11 items-center text-accent hover:underline">搜索全部中文解读 →</Link></div>
    </header>
    <section aria-labelledby="home-reading"><div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 id="home-reading" className="text-[20px] font-semibold text-ink">最近完成的解读</h2><p className="text-[12px] text-ink-3">已核读全文 · 保留原文日期</p></div>
      {data.picks.length ? <div className="divide-y divide-line rounded-card border border-line bg-surface px-5 pt-5 lg:px-7">{data.picks.map((item, index) => <DigestCard key={item.id} item={item} index={index} />)}</div> : <div className="rounded-card border border-line p-6 text-[14px] leading-7 text-ink-2"><p>完整中文解读正在整理中。</p><Link to="/all" className="inline-flex min-h-11 items-center text-accent">先浏览来源动态 →</Link></div>}
    </section>
    <footer className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-accent"><Link to="/daily?view=library" className="inline-flex min-h-11 items-center">全部 {data.total} 篇中文解读 →</Link><Link to="/topics" className="inline-flex min-h-11 items-center">按主题探索 →</Link><Link to="/all" className="inline-flex min-h-11 items-center text-ink-3">全部来源动态 →</Link></footer>
  </div>;
}
