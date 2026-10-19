import { useEffect, useRef, useState, type FormEvent } from "react";
import { decodeHTML } from "entities";
import type { ChineseTranslation, TranslationOriginal } from "@aihot/web/lib/local-state";
import { Sheet } from "@aihot/web/components/ui/Sheet";

interface CorrectionItem extends TranslationOriginal { id: string; url?: string; translation?: ChineseTranslation | null }
interface Draft { original: TranslationOriginal; title: string; summary: string; initialTitle: string; initialSummary: string; note: string }
const inputClass = "mt-1 w-full rounded-control border border-line bg-surface p-2.5 text-[14px] leading-6 text-ink outline-none focus:border-accent";

export function TranslationCorrectionButton({ item }: { item: CorrectionItem }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; id?: number } | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  if (!/^[a-f0-9]{64}$/.test(item.id) || !/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(item.language) || /^zh(?:-|$)/i.test(item.language) || !item.translation && !draft) return null;
  const open = () => {
    const title = decodeHTML(item.translation!.title), summary = decodeHTML(item.translation!.summary ?? "");
    setDraft({ original: { title: item.title, summary: item.summary, language: item.language }, title, summary, initialTitle: title, initialSummary: summary, note: "" });
    setResult(null); setPending(false);
  };
  const close = () => { request.current?.abort(); request.current = null; setDraft(null); setPending(false); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || pending || request.current) return;
    const title = draft.title.trim(), summary = draft.original.summary?.trim() ? draft.summary.trim() || null : null;
    if (!title || title.length > 2000 || (summary?.length ?? 0) > 6000 || draft.original.summary?.trim() && !summary) {
      setResult({ ok: false, message: "请填写中文标题和摘要；标题最多 2,000 字，摘要最多 6,000 字。" }); return;
    }
    const controller = new AbortController(); request.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    setPending(true); setResult(null);
    try {
      const response = await fetch("/api/geo/translation-corrections", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ itemId: item.id, original: draft.original, proposed: { title, summary }, ...(draft.note.trim() ? { note: draft.note.trim() } : {}) }),
      });
      const body = await response.json().catch(() => null);
      if (request.current !== controller) return;
      if (response.ok && body?.status === "pending" && Number.isSafeInteger(body.id)) setResult({ ok: true, message: "已提交，审核后更新。", id: body.id });
      else setResult({ ok: false, message: response.status === 409 ? "原文或建议状态已变化，请关闭后刷新内容再试。" : response.status === 429 ? "提交较频繁，请稍后重试；修改内容已保留。" : typeof body?.error === "string" ? body.error : "暂时无法提交，请稍后重试。" });
    } catch {
      if (request.current === controller) setResult({ ok: false, message: timedOut ? "暂时无法确认提交结果，请重试。" : "网络连接失败，修改内容已保留，请重试。" });
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setPending(false); }
    }
  };
  return <>
    <button type="button" onClick={open} aria-label="纠正中文翻译" title="纠正中文翻译" className="relative z-10 min-h-9 px-1 text-[11px] text-ink-4 hover:text-accent">纠错</button>
    <Sheet open={!!draft} onClose={close} title="纠正中文翻译" centered>
      {draft && <div className="px-5 pb-2">
        {result?.ok ? <div className="py-5"><p role="status" data-correction-id={result.id} className="text-[14px] text-accent">{result.message}</p><button type="button" onClick={close} className="mt-5 min-h-10 rounded-control bg-accent px-5 text-[13px] font-semibold text-white">完成</button></div> : <form onSubmit={submit} className="space-y-4">
          <p className="text-[12px] leading-6 text-ink-3">审核后更新，提交不会立即替换当前译文。</p>
          <details className="rounded-control border border-line bg-bg-sunk px-3 py-2 text-[13px]"><summary className="min-h-9 cursor-pointer py-2 text-ink-3">对照原文</summary><p lang={draft.original.language} className="mt-2 font-semibold leading-6 text-ink">{decodeHTML(draft.original.title)}</p>{draft.original.summary && <p lang={draft.original.language} className="mt-2 whitespace-pre-line break-words leading-6 text-ink-3">{decodeHTML(draft.original.summary)}</p>}{item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block min-h-9 py-2 text-accent hover:underline">查看原文 ↗</a>}</details>
          <label className="block text-[12px] text-ink-3">中文标题<textarea rows={2} required maxLength={2000} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} className={inputClass} /></label>
          {draft.original.summary?.trim() && <label className="block text-[12px] text-ink-3">中文摘要<textarea rows={5} required maxLength={6000} value={draft.summary} onChange={event => setDraft({ ...draft, summary: event.target.value })} className={inputClass} /></label>}
          <label className="block text-[12px] text-ink-3">说明（可选）<input maxLength={500} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} className={inputClass} /></label>
          {result && <p role="alert" className="text-[12px] leading-6 text-hot">{result.message}</p>}
          <div className="flex justify-end gap-3 pb-1"><button type="button" onClick={close} className="min-h-10 rounded-control border border-line px-4 text-[13px] text-ink-3">取消</button><button type="submit" disabled={pending || draft.title === draft.initialTitle && draft.summary === draft.initialSummary} className="min-h-10 rounded-control bg-accent px-4 text-[13px] font-semibold text-white disabled:opacity-40">{pending ? "提交中…" : "提交建议"}</button></div>
        </form>}
      </div>}
    </Sheet>
  </>;
}
