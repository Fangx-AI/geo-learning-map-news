import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { decodeHTML } from "entities";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { AdminPage, Badge, Button, Card, Empty, Time } from "@aihot/web/features/admin/ui";

const labels = { pending: "待审核", applied: "已应用", rejected: "未采用", superseded: "已替换", all: "全部" };
type Status = keyof typeof labels;
interface CorrectionRow {
  id: number; item_id: string; status: Exclude<Status, "all">;
  title_original: string; summary_original: string | null; language_original: string;
  title_zh: string; summary_zh: string | null; note: string | null;
  machine_title_zh?: string | null; machine_summary_zh?: string | null;
  created_at: string; reviewed_at: string | null; reviewed_by: string | null; review_note: string | null;
  url: string; stale: boolean; enabled: boolean;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const value = new URL(request.url).searchParams.get("status") ?? "pending";
  const status: Status = Object.hasOwn(labels, value) ? value as Status : "pending";
  const result = await adminGet<{ rows: CorrectionRow[] }>(request, `/api/admin/geo/translation-corrections?status=${status}`);
  return { ...result, status };
}
export const meta = () => [{ title: `译文纠错 · ${SITE.name} 后台` }];

function TextPair({ title, summary, language }: { title: string; summary: string | null; language?: string }) {
  return <div lang={language} className="min-w-0 break-words text-[14px] leading-7">
    <p className="font-semibold text-ink">{decodeHTML(title)}</p>
    <p className="mt-2 whitespace-pre-wrap text-ink-2">{summary ? decodeHTML(summary) : "原文未提供摘要"}</p>
  </div>;
}

function CorrectionCard({ row }: { row: CorrectionRow }) {
  const { run, busy } = useAdminAction();
  const [note, setNote] = useState("");
  const review = (action: "apply" | "reject") => run("POST", `/api/admin/geo/translation-corrections/${row.id}/review`,
    { action, ...(note.trim() ? { note: note.trim() } : {}) },
    { success: action === "apply" ? "修订已生效，阅读页和收藏将自动同步。" : "建议已标记为未采用。" });
  return <Card>
    <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
      <span>#{row.id}</span><Badge tone={row.status === "pending" ? "accent" : row.status === "applied" ? "ok" : "muted"}>{labels[row.status]}</Badge>
      {row.stale && <Badge tone="warn">原文已更新</Badge>}
      {!row.enabled && <Badge tone="warn">来源已停用</Badge>}
      <Time at={row.created_at} />
      <a href={row.url} target="_blank" rel="noopener noreferrer" className="ml-auto min-h-9 py-2 text-accent hover:underline">查看原文 ↗</a>
    </div>
    <div className="grid gap-5 md:grid-cols-2">
      <section className="min-w-0"><h2 className="mb-2 text-[12px] font-medium text-ink-3">提交时的原文</h2><TextPair title={row.title_original} summary={row.summary_original} language={row.language_original} /></section>
      <section className="min-w-0"><h2 className="mb-2 text-[12px] font-medium text-accent">建议修订</h2><TextPair title={row.title_zh} summary={row.summary_zh} language="zh" /></section>
    </div>
    {row.machine_title_zh && <details className="mt-4 rounded-control border border-line px-3 py-1"><summary className="min-h-9 cursor-pointer py-2 text-[12px] text-ink-3">对照当前机翻</summary><div className="pb-3"><TextPair title={row.machine_title_zh} summary={row.machine_summary_zh ?? null} language="zh" /></div></details>}
    {row.note && <p className="mt-4 whitespace-pre-wrap break-words text-[13px] text-ink-3">提交说明：{row.note}</p>}
    {row.status === "pending" ? <div className="mt-4 border-t border-line pt-4">
      {(row.stale || !row.enabled) && <p className="mb-3 text-[13px] text-amber-ink">这条建议的原文已变化或来源已停用，不能应用。</p>}
      <label className="block text-[12px] text-ink-3">审核备注（未采用时必填）
        <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
      </label>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button disabled={busy || !note.trim()} onClick={() => review("reject")}>不采用</Button>
        <Button tone="primary" disabled={busy || row.stale || !row.enabled} onClick={() => review("apply")}>应用修订</Button>
      </div>
    </div> : <p className="mt-4 border-t border-line pt-3 text-[12px] text-ink-3">{row.reviewed_by && `${row.reviewed_by} · `}<Time at={row.reviewed_at} />{row.review_note && ` · ${row.review_note}`}</p>}
  </Card>;
}

export default function TranslationCorrectionsAdmin() {
  const { rows, status } = useLoaderData<typeof loader>();
  return <AdminPage title="译文纠错" subtitle="对照原文审核中文表达。应用修订不会改动原文和链接。">
    <nav aria-label="纠错状态" className="mb-4 flex flex-wrap gap-2">{Object.entries(labels).map(([value, label]) =>
      <Link key={value} to={`?status=${value}`} aria-current={status === value ? "page" : undefined} className={`rounded-full border px-3 py-2 text-[12px] ${status === value ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-3 hover:text-accent"}`}>{label}</Link>)}</nav>
    {rows.length >= 100 && <p className="mb-3 text-[12px] text-ink-3">{status === "pending" ? "先显示最早的 100 条，处理后自动显示后续建议。" : "显示最近 100 条处理记录。"}</p>}
    <div className="space-y-4">{rows.length ? rows.map(row => <CorrectionCard key={`${row.id}-${row.status}`} row={row} />) : <Card><Empty>暂无{status === "all" ? "纠错建议" : labels[status] + "建议"}。</Empty></Card>}</div>
  </AdminPage>;
}
