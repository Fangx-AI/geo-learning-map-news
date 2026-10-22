import { useCallback, useRef, useSyncExternalStore } from "react";
import { useContentLanguage, type ChineseTranslation } from "@aihot/web/lib/local-state";
import { decodeHTML } from "entities";

export interface TranslationStatus {
  total: number; translated: number; pending: number; retrying: number;
  state: "complete" | "running" | "waiting" | "paused";
  updatedAt: string | null; retryAt: string | null;
}
interface OriginalItem { id: string; title: string; summary: string | null; language: string; translation?: ChineseTranslation | null }
interface Entry { item: OriginalItem; listeners: Set<() => void>; translation?: ChineseTranslation | null; original?: OriginalItem; legacyDecoded?: boolean }
const entries = new Map<string, Entry>();
const pending = new Set<string>();
const statusListeners = new Set<() => void>();
let status: TranslationStatus | null = null;
let version: string | null | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | undefined;
let running = false;
let listening = false;
let requestedAgain = false;
const keyOf = (item: OriginalItem) => JSON.stringify([item.id, item.title, item.summary, item.language]);
const active = () => entries.size > 0 || statusListeners.size > 0;
const visible = () => typeof document !== "undefined" && document.visibilityState !== "hidden";

function readStatus(value: unknown): TranslationStatus | null {
  if (!value || typeof value !== "object") return null;
  const v = value as TranslationStatus;
  return [v.total, v.translated, v.pending, v.retrying].every(n => Number.isSafeInteger(n) && n >= 0) &&
    v.translated <= v.total && ["complete", "running", "waiting", "paused"].includes(v.state) &&
    (v.updatedAt === null || (typeof v.updatedAt === "string" && Number.isFinite(Date.parse(v.updatedAt)))) &&
    (v.retryAt === null || (typeof v.retryAt === "string" && Number.isFinite(Date.parse(v.retryAt)))) ? v : null;
}
function readTranslation(value: unknown, original: OriginalItem): ChineseTranslation | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const v = value as ChineseTranslation;
  return v.language === "zh" && typeof v.title === "string" && !!v.title.trim() && v.title.length <= 6000 &&
    (v.summary === null || (typeof v.summary === "string" && v.summary.length <= 20000)) &&
    (!original.summary?.trim() || (typeof v.summary === "string" && !!v.summary.trim())) &&
    typeof v.provider === "string" && !!v.provider.trim() && v.provider.length <= 100 ? v : undefined;
}
function schedule(delay: number) {
  if (timer) clearTimeout(timer);
  if (active() && visible()) timer = setTimeout(() => { timer = undefined; void refreshTranslations(); }, delay);
}
function onVisibility() {
  if (visible()) { for (const key of entries.keys()) pending.add(key); schedule(0); }
  else { if (timer) clearTimeout(timer); timer = undefined; controller?.abort(); }
}
function start() {
  if (!listening) { document.addEventListener("visibilitychange", onVisibility); listening = true; }
  if (running) requestedAgain = true;
  else schedule(150);
}
function stopIfUnused() {
  if (active()) return;
  if (timer) clearTimeout(timer);
  timer = undefined;
  controller?.abort();
  if (listening) document.removeEventListener("visibilitychange", onVisibility);
  listening = false;
  status = null;
  version = undefined;
}

/** One visible-page poll shared by all cards. Only cached translations are read; list data never reloads. */
export async function refreshTranslations() {
  if (running || !active() || !visible()) return;
  running = true;
  requestedAgain = false;
  const request = new AbortController();
  controller = request;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; request.abort(); }, 10000);
  try {
    const response = await fetch("/api/geo/translation-status", { signal: request.signal, cache: "no-store" });
    if (!response.ok) throw new Error("Translation status unavailable");
    const next = readStatus(await response.json());
    if (!next) throw new Error("Invalid translation status");
    if (request.signal.aborted || !active()) return;
    if (JSON.stringify(next) !== JSON.stringify(status)) { status = next; for (const listener of statusListeners) listener(); }
    if (version !== next.updatedAt) for (const key of entries.keys()) pending.add(key);
    version = next.updatedAt;
    const keys = [...pending].filter(key => entries.has(key));
    const ids = [...new Set(keys.map(key => entries.get(key)!.item.id))];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      const translations = await fetch(`/api/geo/translations?ids=${batch.join(",")}`, { signal: request.signal, cache: "no-store" });
      if (!translations.ok) continue;
      const body: unknown = await translations.json();
      if (request.signal.aborted || !active()) return;
      if (!body || typeof body !== "object" || !Array.isArray((body as { items?: unknown }).items)) continue;
      const records = (body as { items: unknown[] }).items;
      const batchIds = new Set(batch);
      for (const record of records) {
        if (!record || typeof record !== "object") continue;
        const row = record as OriginalItem;
        if (!batchIds.has(row.id) || typeof row.title !== "string" || !(row.summary === null || typeof row.summary === "string") || typeof row.language !== "string") continue;
        // A background source edit must never attach its new translation to an older page's original.
        const matches = [...entries.values()].filter(entry => keyOf(entry.item) === keyOf(row) || entry.legacyDecoded &&
          entry.item.id === row.id && (entry.item.language === row.language || entry.item.language === "") && entry.item.title === decodeHTML(row.title) &&
          entry.item.summary === (row.summary === null ? null : decodeHTML(row.summary)));
        for (const entry of matches) {
          const translation = readTranslation(row.translation, row);
          if (translation === undefined) continue;
          if (JSON.stringify(entry.translation) !== JSON.stringify(translation) || !entry.original || keyOf(entry.original) !== keyOf(row)) {
            entry.translation = translation;
            entry.original = row;
            for (const listener of entry.listeners) listener();
          }
        }
      }
      for (const key of keys) if (batchIds.has(entries.get(key)?.item.id ?? "")) pending.delete(key);
    }
  } catch {
    // Existing readable text stays in place. An unavailable service must not keep claiming live progress.
    if ((!request.signal.aborted || timedOut) && active() && visible() && status !== null) { status = null; for (const listener of statusListeners) listener(); }
  } finally {
    clearTimeout(timeout);
    if (controller === request) controller = undefined;
    running = false;
    schedule(requestedAgain ? 150 : 30000);
  }
}

export function subscribeTranslation(item: OriginalItem, listener: () => void, legacyDecoded = false): () => void {
  if (!/^[a-f0-9]{64}$/.test(item.id)) return () => {};
  const key = keyOf(item);
  let entry = entries.get(key);
  if (!entry) { entry = { item, listeners: new Set() }; entries.set(key, entry); pending.add(key); }
  if (legacyDecoded) entry.legacyDecoded = true;
  entry.listeners.add(listener); start();
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size) { entries.delete(key); pending.delete(key); }
    stopIfUnused();
  };
}
export function translationSnapshot(item: OriginalItem): ChineseTranslation | null | undefined {
  return entries.get(keyOf(item))?.translation;
}
export const translationOriginalSnapshot = (item: OriginalItem) => entries.get(keyOf(item))?.original;
export function subscribeTranslationStatus(listener: () => void): () => void {
  statusListeners.add(listener); start();
  return () => { statusListeners.delete(listener); stopIfUnused(); };
}
export const translationStatusSnapshot = () => status;
const noUpdates = () => () => {};
const noTranslation = () => undefined;

export function useLiveTranslation(item: OriginalItem, legacyDecoded = false): ChineseTranslation | null | undefined {
  const enabled = useContentLanguage() === "zh";
  const subscribe = useCallback((listener: () => void) => subscribeTranslation(item, listener, legacyDecoded), [item.id, item.title, item.summary, item.language, legacyDecoded]);
  const snapshot = useCallback(() => translationSnapshot(item), [item.id, item.title, item.summary, item.language]);
  const translation = useSyncExternalStore(enabled ? subscribe : noUpdates, snapshot, noTranslation);
  const key = keyOf(item);
  const latest = useRef<{ key: string; value: ChineseTranslation | null | undefined }>({ key, value: undefined });
  if (latest.current.key !== key) latest.current = { key, value: undefined };
  // Switching to original stops polling without discarding a translation already read on this card.
  if (translation !== undefined) latest.current.value = translation;
  return latest.current.value === undefined ? item.translation : latest.current.value;
}

