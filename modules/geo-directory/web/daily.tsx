import { useStaticSnapshot } from "@aihot/web/lib/static-snapshot";
import { useReadingPreference } from "./reading-preference.ts";
import { ReadingToggle } from "./feed-controls.tsx";
import { Form, Link, useLoaderData, useLocation } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { ItemList, PublicHeader } from "./components.tsx";
import type { dailyLoader as loader } from "./overview-pages.server.ts";
import { dailyAddress } from "./meta.ts";

export const handle = { home: "featured", name: "日报" };
export const meta = ({ location }: { location: { pathname: string; search?: string } }) => pageMeta({ description: "近 24 小时 GEO 重点与今日补齐的研究，中文阅读结论、数据与实际价值，保留原文日期和出处。", ...dailyAddress(location) });
const dayLabel = (day: string) => `${Number(day.slice(5, 7))}月${Number(day.slice(8))}日`;
export default function DailyPage() {
  const staticSnapshot = useStaticSnapshot();
  const data = useLoaderData<typeof loader>();
  const [compact, setCompact] = useReadingPreference();
  const archive = useLocation().pathname === "/daily/archive";
  // Days are newest first.
  const index = data.days.findIndex(day => day.day === data.selectedDay);
  const newer = index > 0 ? data.days[index - 1] : undefined, older = index >= 0 ? data.days[index + 1] : undefined;
  // Undated items are filed under the day they were collected; keep them apart from that day's news.
  const dated = data.dailyItems.filter(item => item.publishedAt), undated = data.dailyItems.filter(item => !item.publishedAt && !item.readingPriority?.folded);
  const marked = dated.filter(item => item.readingPriority?.badge && !item.readingPriority.folded);
  const others = dated.filter(item => !item.readingPriority?.badge && !item.readingPriority?.folded);
  const folded = data.dailyItems.filter(item => item.readingPriority?.folded);
  return <div className="pb-12"><PublicHeader title={archive ? "按日期看资讯" : "GEO 日报"} description="按北京时间，看某一天收录的全部 GEO 资讯。" />
    <nav aria-label="有收录的日期" data-day-list="" className="mt-4">
      <p className="text-[12px] text-ink-3">最近有收录的日期（{data.days.length} 天）</p>
      <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">{data.days.map(day => <Link key={day.day} to={`/daily/${day.day}`} aria-current={day.day === data.selectedDay ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] ${day.day === data.selectedDay ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface text-ink-2 hover:border-accent hover:text-accent"}`}>{dayLabel(day.day)}<span className="text-[11px] text-ink-4">{day.count}</span></Link>)}</div>
    </nav>
    {staticSnapshot ? <p className="mt-3 text-[13px] leading-6 text-ink-3">点上面的日期切换。快照不提供日期输入框。</p> : <Form method="get" action="/daily" className="mt-3 flex flex-wrap items-end gap-3"><label className="text-[12px] text-ink-3">选择日期<input key={data.selectedDay} type="date" name="day" defaultValue={data.selectedDay ?? ""} required className="mt-1 block min-h-11 rounded-control border border-line bg-surface px-3 text-ink" /></label><button className="min-h-11 rounded-control border border-line bg-surface px-4 text-[13px] font-semibold text-accent hover:bg-accent-soft">查看日报</button></Form>}
    <div className="mb-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
      <h2 className="text-[22px] font-semibold text-ink">{data.selectedDay ?? "暂无日期"} · {data.dailyTotal} 条资料</h2>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {older && <Link to={`/daily/${older.day}`} rel="prev" className="inline-flex min-h-10 items-center rounded-control border border-line px-3 text-accent hover:bg-accent-soft">← 前一天</Link>}
        {newer && <Link to={`/daily/${newer.day}`} rel="next" className="inline-flex min-h-10 items-center rounded-control border border-line px-3 text-accent hover:bg-accent-soft">后一天 →</Link>}
        {!staticSnapshot && <ReadingToggle compact={compact} onChange={setCompact} />}
      </div>
    </div>
    {marked.length > 0 && <section aria-labelledby="daily-marked" className="mb-6"><h3 id="daily-marked" className="mb-2 text-[14px] font-semibold text-ink">值得先看<span className="ml-2 text-[12px] font-normal text-ink-3">官方、平台变化、研究与论文 · {marked.length} 条</span></h3><ItemList items={marked} compact={compact} /></section>}
    {others.length > 0 && <section aria-labelledby="daily-others" className="mb-6"><h3 id="daily-others" className="mb-2 text-[14px] font-semibold text-ink">{marked.length ? "其他资讯" : "当天资讯"}<span className="ml-2 text-[12px] font-normal text-ink-3">{others.length} 条</span></h3><ItemList items={others} compact={compact} /></section>}
    {undated.length > 0 && <section aria-labelledby="daily-undated" className="mb-6"><h3 id="daily-undated" className="mb-2 text-[14px] font-semibold text-ink">日期待确认<span className="ml-2 text-[12px] font-normal text-ink-3">来源没给发布日期，按收录日归在这天 · {undated.length} 条</span></h3><ItemList items={undated} compact={compact} /></section>}
    {folded.length > 0 && <details className="mb-6 rounded-card border border-line bg-bg-sunk"><summary className="min-h-11 cursor-pointer px-4 py-3 text-[13px] text-ink-3">已折叠 {folded.length} 条服务商软文、排行榜和转载</summary><div className="px-2 pb-2"><ItemList items={folded} compact /></div></details>}
    {!data.dailyItems.length && <ItemList items={[]} />}{data.dailyTotal > data.dailyItems.length && <p className="text-[12px] text-ink-3">当前展示前 {data.dailyItems.length} 条，该日共 {data.dailyTotal} 条。</p>}
  </div>;
}
