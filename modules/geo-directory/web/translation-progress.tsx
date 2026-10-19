import { useTranslationStatus } from "./translation-updates.ts";

export function TranslationProgress() {
  const status = useTranslationStatus();
  if (!status?.total) return null;
  const label = { running: "补译中", waiting: "稍后继续", paused: "已暂停", complete: "" }[status.state];
  return <p aria-label="翻译进度" aria-live="polite" aria-atomic="true" className="mt-1 text-[11px] leading-6 text-ink-4">中文 {status.translated.toLocaleString("zh-CN")} / {status.total.toLocaleString("zh-CN")}{label && ` · ${label}`}</p>;
}
