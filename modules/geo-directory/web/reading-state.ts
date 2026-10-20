import { useSyncExternalStore } from "react";
import { readJson, readRaw, writeRaw } from "@aihot/web/lib/local-state";
import { READING_TASKS } from "./reading-guide.ts";
const KEY = "geo:reading-v1",
  EVENT = "geo-reading-change";
interface Visit {
  id: string;
  title: string;
  updatedAt: string;
  at: number;
  y: number;
  done: boolean;
}
interface State {
  follows: string[];
  visits: Visit[];
}
function parse(raw: unknown): State {
  const x = raw && typeof raw === "object" ? (raw as Partial<State>) : {};
  return {
    follows: Array.isArray(x.follows)
      ? x.follows.filter((v) => READING_TASKS.some((t) => t.id === v))
      : [],
    visits: Array.isArray(x.visits)
      ? x.visits
          .filter(
            (v) =>
              v &&
              /^[a-f0-9]{64}$/.test(v.id) &&
              typeof v.title === "string" &&
              typeof v.updatedAt === "string" &&
              Number.isFinite(v.at) &&
              Number.isFinite(v.y) &&
              v.y >= 0,
          )
          .slice(0, 100)
          .map((v) => ({
            ...v,
            title: v.title.slice(0, 300),
            y: Math.min(v.y, 100000),
            done: v.done === true,
          }))
      : [],
  };
}
function current() {
  return parse(readJson(KEY));
}
function subscribe(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
function snapshot() {
  return readRaw(KEY) ?? "";
}
export function useReadingState() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  try {
    return parse(JSON.parse(raw));
  } catch {
    return parse(null);
  }
}
function save(state: State) {
  const ok = writeRaw(KEY, JSON.stringify(state));
  if (ok) window.dispatchEvent(new Event(EVENT));
  return ok;
}
export function toggleFollow(id: string) {
  const s = current();
  return save({
    ...s,
    follows: s.follows.includes(id)
      ? s.follows.filter((v) => v !== id)
      : [...s.follows, id],
  });
}
export function rememberReading(visit: Omit<Visit, "done">, done?: boolean) {
  const s = current();
  const old = s.visits.find((v) => v.id === visit.id);
  return save({
    ...s,
    visits: [
      {
        ...visit,
        done:
          done ?? (old?.updatedAt === visit.updatedAt && old?.done === true),
      },
      ...s.visits.filter((v) => v.id !== visit.id),
    ].slice(0, 100),
  });
}
export function clearReading() {
  return save({ follows: [], visits: [] });
}

export function readingVisit(id: string) {
  return current().visits.find((v) => v.id === id);
}
