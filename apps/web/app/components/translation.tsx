import { useStaticSnapshot } from "../lib/static-snapshot";
import { useEffect, useState } from "react";
import { decodeHTML } from "entities";
import { setContentLanguage, useContentLanguage, type ChineseTranslation, type ContentLanguage } from "../lib/local-state";

export function ContentLanguageToggle() {
  const staticSnapshot = useStaticSnapshot();
  const language = useContentLanguage();
  if (staticSnapshot) return <p className="max-w-xs text-[12px] leading-5 text-ink-3">快照默认显示中文译文，不能在这里切换原文。</p>;
  return <div role="group" aria-label="阅读语言" className="inline-flex shrink-0 rounded-control border border-line bg-surface p-0.5 text-[12px]">
    {([["zh", "中文"], ["original", "原文"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={language === value} onClick={() => setContentLanguage(value)} className={`min-h-9 rounded px-3 ${language === value ? "bg-accent-soft font-semibold text-accent" : "text-ink-3 hover:text-accent"}`}>{label}</button>)}
  </div>;
}

interface TranslatableItem { id: string; title: string; summary: string | null; language?: string; translation?: ChineseTranslation | null }
export function useTranslatedContent(item: TranslatableItem) {
  const preference = useContentLanguage();
  const [override, setOverride] = useState<ContentLanguage | null>(null);
  useEffect(() => setOverride(null), [preference, item.id]);
  const translation = item.translation?.language === "zh" && item.translation.title.trim() &&
    (!item.summary?.trim() || item.translation.summary?.trim()) ? item.translation : null;
  const translated = !!translation && (override ?? preference) === "zh";
  const title = translated ? translation!.title : item.title;
  const summary = translated ? translation!.summary : item.summary;
  return {
    title: decodeHTML(title),
    summary: summary ? decodeHTML(summary) : null,
    originalTitle: decodeHTML(item.title),
    originalSummary: item.summary ? decodeHTML(item.summary) : null,
    translatedTitle: translation ? decodeHTML(translation.title) : null,
    translatedSummary: translation?.summary ? decodeHTML(translation.summary) : null,
    translation, translated,
    language: translated ? "zh" : item.language && /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(item.language) ? item.language : undefined,
    originalLabel: /^en(?:-|$)/i.test(item.language ?? "") ? "English" : "原文",
    toggle: () => setOverride(translated ? "original" : "zh"),
  };
}

export function ItemTranslationToggle({ content }: { content: ReturnType<typeof useTranslatedContent> }) {
  if (!content.translation) return null;
  return <span className="relative z-10 inline-flex shrink-0 items-center gap-2 text-[11px]">
    {content.translated && (content.translation.provider === "geo-reviewed" || content.translation.provider === "geo-reviewed-v1" ? <span data-reviewed-translation="" title="译文已修订" className="text-ink-4">已修订</span> : <span data-machine-translation="" title="自动翻译" className="text-ink-4">机翻</span>)}
    <button type="button" onClick={content.toggle} aria-label={content.translated ? "查看原文" : "查看中文翻译"} className="min-h-9 px-1 text-accent hover:underline">{content.translated ? content.originalLabel : "中文"}</button>
  </span>;
}
