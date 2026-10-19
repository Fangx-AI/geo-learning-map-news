import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import type { ItemAvailability } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { Presence } from "../components/ui/Presence";
import { edgeTtl } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { exportBundle, importBundle, removeStar, useStarred, type ImportReport, type LocalStarredItem } from "../lib/local-state";
import { ContentLanguageToggle, ItemTranslationToggle, useTranslatedContent } from "../components/translation";
import { fullDateTime } from "../lib/format";
import { IconBookmark, IconDownload, IconClose } from "../components/icons";
import { readSnapshot, restoreAnchor, useSaveOnLeave } from "../lib/restore";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import { loadParts, webModules } from "../site-modules";

const starredActions = await loadParts(module => module.starredItemActions);

export const handle: Screen = { tab: "me", name: "收藏" };

export function headers() {
  return edgeTtl(300);
}

export function meta() {
  return pageMeta({ title: "我的收藏", description: `保存在这台设备上的 ${SITE.name} 收藏。`, path: "/starred", noindex: true });
}

function reportText(r: ImportReport): string {
  const parts = [`新增收藏 ${r.starredAdded} 条`, `已读记录 ${r.readAdded} 条`];
  if (r.starredSkipped || r.readSkipped) parts.push(`超出上限或格式不对而跳过 ${r.starredSkipped + r.readSkipped} 条`);
  if (r.themeApplied) parts.push("已沿用导入的深浅色设置");
  if (r.fontApplied) parts.push("已沿用导入的字体设置");
  if (r.readFailed) parts.push("已读记录没能保存（浏览器存储已满或不可用）");
  return parts.join("，");
}

function StarredCard({ item: s, current }: { item: LocalStarredItem; current?: ItemAvailability }) {
  const content = useTranslatedContent(s);
  const location = useLocation();
  const from = location.pathname + location.search;
  const readerHref = webModules().map(module => module.starredItemHref?.(s, from)).find(Boolean);
  const status = current?.status;
  const unavailable = status === "unavailable";
  return <li data-card-key={s.id} className={`relative border-b border-line-soft py-4 lg:card lg:px-[18px] lg:py-[15px] ${unavailable ? "opacity-70" : "lg:card-hover"}`}>
    <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-4">
      <span className="min-w-0 truncate text-ink-3">{current?.sourceName ?? s.sourceName}</span>
      {s.publishedAt && <span className="num shrink-0">· {fullDateTime(s.publishedAt)}</span>}
      <ItemTranslationToggle content={content} />
      {starredActions.map(({ name, part: Actions }) => <Actions key={name} item={s} />)}
      <span className="ml-auto hidden shrink-0 sm:inline">收藏于 <span className="num">{fullDateTime(s.savedAt)}</span></span>
      <button type="button" aria-label="取消收藏" title="取消收藏" onClick={() => removeStar(s.id)} className="relative z-10 -my-1 ml-auto grid size-7 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink sm:ml-0"><IconClose size={14} /></button>
    </div>
    <h2 lang={content.language} className="mt-1.5 text-[16px] font-[650] leading-[1.55] text-ink">
      {unavailable ? content.title : readerHref ? <Link viewTransition to={readerHref} state={{ geoReaderFrom: from }} className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-accent">{content.title}</Link> : s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-accent">{content.title} ↗</a> : <Link viewTransition to={`/items/${s.id}`} className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-accent">{content.title}</Link>}
    </h2>
    {content.summary && <p lang={content.language} className="mt-1.5 line-clamp-2 text-[14px] leading-[1.75] text-ink-3">{content.summary}</p>}
    {unavailable && <p className="mt-2 text-[12.5px] text-hot">这条内容已不再公开，收藏会保留直到你手动移除。</p>}
    {status === "summary-only" && <p className="mt-2 text-[12.5px] text-amber-ink">应来源方要求，这条内容现在只提供摘要。</p>}
  </li>;
}

export default function StarredPage() {
  const starred = useStarred();
  const [mounted, setMounted] = useState(false);
  const [availability, setAvailability] = useState<Record<string, ItemAvailability>>({});
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);

  const starredIds = starred.filter((s) => !s.url).map((s) => s.id).join(",");
  useEffect(() => {
    if (!mounted || !starredIds) return;
    const controller = new AbortController();
    // Batches of 100: a request line with all 500 ids is longer than the front servers accept.
    const ids = starredIds.split(",");
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
    Promise.all(
      batches.map((batch) =>
        fetch(`/api/site/items/availability?ids=${encodeURIComponent(batch.join(","))}`, { signal: controller.signal })
          .then((r) => (r.ok ? (r.json() as Promise<Record<string, ItemAvailability>>) : {}))
          .catch(() => ({})),
      ),
    ).then((parts) => {
      if (!controller.signal.aborted) setAvailability(Object.assign({}, ...parts));
    });
    return () => controller.abort();
  }, [mounted, starredIds]);

  // Back from an item: the list renders only after mounting (it lives in this browser), so the
  // position comes back once it is there, by the same card anchor the other lists use.
  const historyKey = useLocation().key;
  useLayoutEffect(() => {
    if (!mounted || starred.length === 0) return;
    const snap = readSnapshot<null>(historyKey);
    if (snap) restoreAnchor(snap.anchor, snap.scrollY);
  }, [mounted, historyKey]);
  useSaveOnLeave(historyKey, () => null);

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportBundle(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${SITE.mcpPrefix}-local-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const report = importBundle(await file.text());
      setNotice({ kind: report.readFailed ? "error" : "ok", text: `导入完成：${reportText(report)}` });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "导入失败" });
    }
  };

  // Imports from elsewhere that the site's modules offer.
  const importFrom = (run: () => Promise<{ ok: boolean; text: string }>) =>
    run().then(
      (r) => setNotice({ kind: r.ok ? "ok" : "error", text: r.text }),
      (err: Error) => setNotice({ kind: "error", text: err.message }),
    );

  const action = "text-[12.5px] text-ink-3 transition-colors hover:text-accent";
  return (
    <div className="pb-12">
      <PhoneBar back={{ to: "/more", label: "我的" }} title="收藏" />
      <header className="flex flex-col gap-2 pb-4 pt-3 sm:flex-row sm:items-start sm:justify-between lg:pt-1">
        <div>
          <h1 data-page-title="" className="text-[24px] font-semibold leading-[1.3] text-ink">收藏</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">{`本机收藏的 ${SITE.name} 内容，适合稍后阅读和回看。`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:pt-1.5">
          {webModules().flatMap((m) => m.starredImports ?? []).map((i) => (
            <button key={i.label} type="button" onClick={() => importFrom(i.run)} className={action}>
              {i.label}
            </button>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()} className={action}>
            导入文件
          </button>
          {mounted && starred.length > 0 && (
            <button type="button" onClick={doExport} className={`${action} inline-flex items-center gap-1`}>
              <IconDownload size={13} /> 导出
            </button>
          )}
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => doImport(e.target.files?.[0])} />
        </div>
      </header>
      {mounted && starred.some(item => item.translation || item.url && /^[a-f0-9]{64}$/.test(item.id) && !/^zh(?:-|$)/i.test(item.language ?? "")) && <div className="mb-3 flex justify-end"><ContentLanguageToggle /></div>}
      <p className="rounded-tile border border-line bg-surface px-4 py-2.5 text-[12.5px] text-ink-3">收藏只保存在当前浏览器；清除浏览器数据或换设备后不会同步。</p>
      <Presence show={!!notice} enter="anim-notice-in" exit="anim-fade-out" duration={160}>
        <div
          role="status"
          className={`mt-3 flex items-start justify-between gap-3 rounded-tile px-4 py-2.5 text-[13px] ${notice?.kind === "ok" ? "bg-accent-soft text-accent-ink dark:text-accent" : "bg-hot-soft text-hot"}`}
        >
          {notice?.text}
          <button type="button" aria-label="关闭" onClick={() => setNotice(null)} className="shrink-0 opacity-70 hover:opacity-100">
            <IconClose size={14} />
          </button>
        </div>
      </Presence>
      {!mounted ? null : starred.length === 0 ? (
        <div className="mt-3 flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
          <IconBookmark size={20} className="text-ink-4" />
          <p className="mt-3 text-[13px] text-ink-3">还没有收藏内容。在资讯、精选或日报的条目旁点击收藏，即可保存在这里。</p>
          <Link to="/" className="mt-4 text-[12.5px] font-medium text-accent hover:text-accent-ink">
            去看精选 →
          </Link>
        </div>
      ) : (
        <ul className="mt-3 lg:space-y-3">
          {starred.map(s => <StarredCard key={s.id} item={s} current={availability[s.id]} />)}
        </ul>
      )}
    </div>
  );
}
