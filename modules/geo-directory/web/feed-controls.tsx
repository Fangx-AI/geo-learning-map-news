import { useRef, useState } from "react";
import { IconChevronDown } from "@aihot/web/components/icons";

export const platformNames: Record<string, string> = { web: "网站", x: "X", reddit: "Reddit", bluesky: "Bluesky", mastodon: "Mastodon", youtube: "YouTube", zhihu: "知乎", xiaohongshu: "小红书", wechat: "公众号" };
export const kindNames: Record<string, string> = { direct: "原站内容", social: "社交原帖", aggregated: "聚合线索" };
export const periodNames: Record<string, string> = { "24h": "最近 24 小时", "7d": "最近 7 天", "30d": "最近 30 天" };
export const controlClass = "min-h-11 w-full rounded-control border border-line bg-surface px-3 text-[13px] text-ink focus:border-accent";

export interface FeedSourceOption { id: string; name: string; count?: number; latestPublishedAt?: string | null }
export function SourcePicker({ sources, value, onChange }: { sources: FeedSourceOption[]; value: string; onChange: (value: string) => void }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const filtered = sources.filter(source => `${source.name} ${source.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pick = (id: string) => {
    onChange(id); setQuery("");
    if (disclosure.current) { disclosure.current.open = false; disclosure.current.querySelector("summary")?.focus(); }
  };
  return <details ref={disclosure} className="relative" onToggle={event => { if (event.currentTarget.open) input.current?.focus(); }} onKeyDown={event => {
    if (event.key === "Escape" && disclosure.current) { event.preventDefault(); disclosure.current.open = false; disclosure.current.querySelector("summary")?.focus(); }
  }}>
    <summary aria-label="选择资讯来源" className={`${controlClass} flex cursor-pointer list-none items-center justify-between gap-2`}><span className="truncate">{sources.find(source => source.id === value)?.name ?? (value ? "所选来源" : "全部来源")}</span><IconChevronDown size={14} /></summary>
    <div className="absolute left-0 top-full z-30 mt-2 w-full min-w-[240px] max-w-[calc(100vw-32px)] rounded-card border border-line bg-surface p-2 shadow-lg">
      <input ref={input} type="search" aria-label="搜索来源" placeholder="输入来源或作者名称" value={query} onChange={event => setQuery(event.target.value)} className={controlClass} />
      <ul aria-label="可选资讯来源" className="mt-2 max-h-64 overflow-y-auto overscroll-contain">
        <li><button type="button" aria-pressed={!value} onClick={() => pick("")} className="min-h-11 w-full rounded px-3 text-left text-[13px] text-accent hover:bg-bg-sunk">全部来源</button></li>
        {filtered.map(source => <li key={source.id}><button type="button" aria-pressed={value === source.id} onClick={() => pick(source.id)} className={`flex min-h-11 w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-[12px] hover:bg-bg-sunk ${value === source.id ? "bg-accent-soft text-accent" : "text-ink-2"}`}><span>{source.name}</span>{source.count !== undefined && <span className="shrink-0 text-[11px] text-ink-4">{source.count} 条</span>}</button></li>)}
      </ul>
      {!filtered.length && <p className="px-3 py-4 text-[12px] text-ink-3">没有匹配的来源，试试作者名或更短的名称。</p>}
    </div>
  </details>;
}

export function ReadingToggle({ compact, onChange }: { compact: boolean; onChange: (value: boolean) => void }) {
  return <div role="group" aria-label="阅读方式" className="inline-flex shrink-0 rounded-control border border-line bg-surface p-0.5 text-[12px]">
    {([[true, "简洁"], [false, "摘要"]] as const).map(([value, label]) => <button key={label} type="button" aria-pressed={compact === value} onClick={() => onChange(value)} className={`min-h-9 rounded px-3 ${compact === value ? "bg-accent-soft font-semibold text-accent" : "text-ink-3 hover:text-accent"}`}>{label}</button>)}
  </div>;
}

export function GroupingToggle({ grouped, onChange }: { grouped: boolean; onChange: (value: boolean) => void }) {
  return <div role="group" aria-label="相似标题展示方式" className="inline-flex shrink-0 rounded-control border border-line bg-surface p-0.5 text-[12px]">
    {([[true, "合并相似标题"], [false, "逐条查看"]] as const).map(([value, label]) => <button key={label} type="button" aria-pressed={grouped === value} onClick={() => onChange(value)} className={`min-h-9 rounded px-3 ${grouped === value ? "bg-accent-soft font-semibold text-accent" : "text-ink-3 hover:text-accent"}`}>{label}</button>)}
  </div>;
}

export function SortToggle({ value, onChange }: { value: "recommended" | "latest"; onChange: (value: "recommended" | "latest") => void }) {
  return <div role="group" aria-label="内容排序" className="inline-flex shrink-0 rounded-control border border-line bg-surface p-0.5 text-[12px]">
    {([["recommended", "推荐"], ["latest", "最新"]] as const).map(([sort, label]) => <button key={sort} type="button" aria-pressed={value === sort} onClick={() => onChange(sort)} className={`min-h-9 rounded px-3 ${value === sort ? "bg-accent-soft font-semibold text-accent" : "text-ink-3 hover:text-accent"}`}>{label}</button>)}
  </div>;
}
