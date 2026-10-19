import { useSyncExternalStore } from "react";
import { readRaw, writeRaw } from "@aihot/web/lib/local-state";

const storageKey = "geo-reading-mode";
const listeners = new Set<() => void>();
let temporary: boolean | null = null;
function snapshot(): boolean {
  if (temporary !== null) return temporary;
  return readRaw(storageKey) !== "summary";
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) { temporary = null; listener(); } };
  window.addEventListener("storage", sync);
  return () => { listeners.delete(listener); window.removeEventListener("storage", sync); };
}
function setCompact(compact: boolean) {
  temporary = writeRaw(storageKey, compact ? "compact" : "summary") ? null : compact;
  for (const listener of listeners) listener();
}
/** A local display preference, shared by public feed/daily pages; no reading activity is recorded. */
export function useReadingPreference(): [boolean, (compact: boolean) => void] {
  return [useSyncExternalStore(subscribe, snapshot, () => true), setCompact];
}
