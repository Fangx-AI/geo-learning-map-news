import { useReadingPreference } from "./reading-preference.ts";
import { ReadingToggle } from "./feed-controls.tsx";
import { Form, Link, useLoaderData, useLocation } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { ItemList, PublicHeader } from "./components.tsx";
import type { dailyLoader as loader } from "./overview-pages.server.ts";
import { dailyAddress } from "./meta.ts";

export const handle = { home: "featured", name: "日报" };
export const meta = ({ location }: { location: { pathname: string; search?: string } }) => pageMeta({ description: "近 24 小时 GEO 重点与今日补齐的研究，中文阅读结论、数据与实际价值，保留原文日期和出处。", ...dailyAddress(location) });
export default function DailyPage() {
  const data = useLoaderData<typeof loader>();
  const [compact, setCompact] = useReadingPreference();
  const archive = useLocation().pathname === "/daily/archive";

  const groups = new Map<string, typeof data.dailyItems>();
  for (const item of data.dailyItems) groups.set(item.sourceName, [...(groups.get(item.sourceName) ?? []), item]);
  return <div className="pb-12"><PublicHeader title={archive ? "GEO 日报归档" : "GEO 日报"} eyebrow="DAILY SOURCE DIGEST" description="按北京时间归档，保留每条资料的出处与发布时间。" />
    <Form method="get" action="/daily" className="my-4 flex flex-wrap items-end gap-3"><label className="text-[12px] text-ink-3">选择日期<input key={data.selectedDay} type="date" name="day" defaultValue={data.selectedDay ?? ""} required className="mt-1 block min-h-11 rounded-control border border-line bg-surface px-3 text-ink" /></label><button className="min-h-11 rounded-control bg-accent px-5 text-[13px] font-semibold text-white">查看日报</button><Link to="/daily" className="py-3 text-[12px] text-accent">今日重点 →</Link><Link to="/daily/archive" className="py-3 text-[12px] text-accent">浏览归档 →</Link></Form>
    <details open={archive} className="mb-4 rounded-card border border-line px-3 py-2"><summary className="cursor-pointer text-[13px] text-ink-3">最近有收录的日期（{data.days.length} 天）</summary><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">{data.days.map(day => <Link key={day.day} to={`/daily/${day.day}`} className="rounded border border-line px-3 py-2 text-[12px] text-accent">{day.day}<span className="ml-2 text-ink-4">{day.count} 条</span></Link>)}</div></details>
    <h2 className="mb-2 text-[22px] font-semibold text-ink">{data.selectedDay ?? "暂无日期"} · {data.dailyTotal} 条资料</h2><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><details className="text-[11px] leading-6 text-ink-4"><summary className="cursor-pointer">归档与摘要说明</summary><p className="max-w-xl pt-2">{data.rules.daily} 内容按来源排列；摘要取自原站，未逐篇核实事实。</p></details><ReadingToggle compact={compact} onChange={setCompact} /></div>
    {[...groups].map(([name, items]) => <details open key={name} className="mb-4"><summary className="mb-2 cursor-pointer py-2 text-[14px] font-semibold text-accent">{name} · {items.length} 条</summary><ItemList items={items} compact={compact} /></details>)}
    {!data.dailyItems.length && <ItemList items={[]} />}{data.dailyTotal > data.dailyItems.length && <p className="text-[12px] text-ink-3">当前展示前 {data.dailyItems.length} 条，该日共 {data.dailyTotal} 条。</p>}
  </div>;
}
