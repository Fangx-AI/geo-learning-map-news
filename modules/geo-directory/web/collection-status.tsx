import { useStaticSnapshot } from "@aihot/web/lib/static-snapshot";
import { useState } from "react";
import { Link } from "react-router";

export interface SourceStatus { id: string; name: string; enabled: boolean; status: string; lastAttemptAt: string | null; lastSuccessAt: string | null; count: number; error: string | null; stale?: boolean }
export interface CollectionStatus {
  sources: SourceStatus[]; lastCollectedAt: string | null;
  collector?: { state: "running" | "waiting" | "retrying" | "stopped" | "stale" | "unknown"; heartbeatAt: string | null; nextRunAt: string | null; lastStartedAt: string | null; lastCompletedAt: string | null; error: string | null; intervalMinutes: number };
}
export const timeLabel = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
export const sourceStatusLabel = (source: SourceStatus) => !source.enabled ? "已停用" : source.stale ? "更新延迟" : ({ never: "待首次采集", running: "检查中", ok: "正常", partial: "部分完成", error: "暂时失败" }[source.status] ?? source.status);
const collectorLabel: Record<string, string> = { running: "正在检查来源", waiting: "自动更新中", retrying: "正在重试", stopped: "采集已停止", stale: "采集状态待检查", unknown: "自动更新状态未知" };
export function CollectionPanel({ collection }: { collection: CollectionStatus }) {
  const staticSnapshot = useStaticSnapshot();
  const [onlyIssues, setOnlyIssues] = useState(false);
  const enabled = collection.sources.filter(source => source.enabled);
  const issues = enabled.filter(source => source.stale || source.status === "error" || source.status === "partial");
  const healthy = enabled.filter(source => !source.stale && source.status === "ok");
  const shown = onlyIssues ? issues : enabled;
  const collector = collection.collector;
  return <details className="my-4 rounded-control border border-line px-3 py-2 text-[11px] leading-6 text-ink-3">
    <summary className="cursor-pointer"><span className="font-medium text-accent">{collector ? collectorLabel[collector.state] : "来源状态"}</span><span className="ml-2">{healthy.length}/{enabled.length} 个来源正常{issues.length > 0 ? ` · ${issues.length} 个待检查` : ""}</span>{collection.lastCollectedAt && <span className="ml-2 text-ink-4">最近完成 {timeLabel(collection.lastCollectedAt)}</span>}</summary>
    <div className="mt-3 border-t border-line-soft pt-3">
      <p>上次检查时间不代表原文发布时间。{collector?.nextRunAt && `下次计划 ${timeLabel(collector.nextRunAt)}（北京时间）。`}{collector?.intervalMinutes ? `每 ${collector.intervalMinutes} 分钟检查一轮。` : ""}</p>
      {collector?.error && <p className="mt-1 text-ink-3">{collector.error}</p>}
      {!staticSnapshot && <button type="button" onClick={() => setOnlyIssues(!onlyIssues)} aria-pressed={onlyIssues} className="my-2 min-h-9 rounded border border-line px-3 text-accent">{onlyIssues ? "显示全部来源" : `只看待检查（${issues.length}）`}</button>}
      <ul className="max-h-64 overflow-y-auto divide-y divide-line-soft">{shown.map(source => <li key={source.id} className="flex flex-wrap items-center justify-between gap-x-3 py-2"><Link to={`/all?source=${encodeURIComponent(source.id)}`} className="min-h-9 py-1 text-accent hover:underline">{source.name}</Link><span>{sourceStatusLabel(source)} · 最近一轮 {source.count} 条</span>{source.error && <p className="w-full text-ink-4">{source.error}</p>}</li>)}</ul>
      {!shown.length && <p className="py-2">当前没有需要检查的来源。</p>}
    </div>
  </details>;
}
