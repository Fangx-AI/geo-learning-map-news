import { useEffect } from "react";
import { updateStarredTranslation, type LocalStarredItem } from "@aihot/web/lib/local-state";
import { useLiveTranslation, translationOriginalSnapshot } from "./translation-updates.ts";
import { TranslationCorrectionButton } from "./translation-correction.tsx";

function PublicStarredActions({ item }: { item: LocalStarredItem }) {
  const source = { ...item, language: item.language ?? "", ...(item.translationOriginal ?? {}) };
  const translation = useLiveTranslation(source, !item.translationOriginal);
  const original = translationOriginalSnapshot(source);
  useEffect(() => {
    if (translation && original) updateStarredTranslation(item.id, { title: original.title, summary: original.summary, language: original.language }, translation);
  }, [item.id, translation, original]);
  return <TranslationCorrectionButton item={{ ...source, translation }} />;
}

export default function StarredActions({ item }: { item: LocalStarredItem }) {
  if (!item.url || !/^[a-f0-9]{64}$/.test(item.id) || /^zh(?:-|$)/i.test(item.language ?? "")) return null;
  return <PublicStarredActions item={item} />;
}
