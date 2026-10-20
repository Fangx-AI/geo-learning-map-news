import { redirect } from "react-router";
import { cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import type { GeoOverviewResponse, GeoDailyDigest } from "../types.ts";
import type { CollectionStatus } from "./collection-status.tsx";

export { pageHeaders as headers } from "@aihot/web/lib/api.server";
interface PageArgs { request: Request; params: Record<string, string | undefined> }

export async function atlasLoader({ request }: Pick<PageArgs, "request">) {
  const upstream = new Headers();
  const collection = await loadOr404<CollectionStatus>("/api/geo/collection-status", { signal: request.signal, responseHeaders: upstream });
  return cachedPage(30, { collection }, upstream);
}

async function getOverview(request: Request, upstream: Headers, options: { day?: string; topic?: string } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) if (value) query.set(key, value);
  return loadOr404<GeoOverviewResponse>(`/api/geo/overview?${query}`, { signal: request.signal, responseHeaders: upstream });
}

export async function featuredLoader({ request }: Pick<PageArgs, "request">) {
  const upstream = new Headers();
  const digest = await loadOr404<GeoDailyDigest>("/api/geo/daily?view=library", { signal: request.signal, responseHeaders: upstream });
  const ready = digest.research.filter(item => item.brief?.coverage === "full-article" && !item.brief.automated)
    .sort((a, b) => Date.parse(b.brief!.updatedAt) - Date.parse(a.brief!.updatedAt) || a.id.localeCompare(b.id));
  return cachedPage(60, { picks: ready.slice(0, 6), total: ready.length }, upstream);
}
export async function hotLoader({ request }: Pick<PageArgs, "request">) {
  const upstream = new Headers();
  const { hotClusters, window, rules } = await getOverview(request, upstream);
  return cachedPage(60, { hotClusters, window, rules }, upstream);
}
export async function dailyLoader({ request, params }: PageArgs) {
  const day = params.key ?? new URL(request.url).searchParams.get("day") ?? undefined;
  const upstream = new Headers();
  // React Router's client navigations request /daily.data, while SSR uses /daily.
  if (!day && /^\/daily(?:\.data)?$/.test(new URL(request.url).pathname)) {
    const library = new URL(request.url).searchParams.get("view") === "library";
    const digest = await loadOr404<GeoDailyDigest>(`/api/geo/daily${library ? "?view=library" : ""}`, { signal: request.signal, responseHeaders: upstream });
    return cachedPage(60, { mode: "digest" as const, digest }, upstream);
  }
  const { days, selectedDay, dailyTotal, dailyItems, rules } = await getOverview(request, upstream, { day });
  return cachedPage(60, { mode: "archive" as const, days, selectedDay, dailyTotal, dailyItems, rules }, upstream);
}
export async function topicsLoader({ request }: Pick<PageArgs, "request">) {
  const upstream = new Headers();
  const { topics, stats, rules } = await getOverview(request, upstream);
  return cachedPage(60, { topics: topics.map(({ items, ...topic }) => topic), stats, rules }, upstream);
}
export async function topicLoader({ request, params }: PageArgs) {
  if (params.page) throw redirect(`/topics/${encodeURIComponent(params.slug ?? "")}`);
  const upstream = new Headers();
  const { selectedTopic, rules } = await getOverview(request, upstream, { topic: params.slug });
  if (!selectedTopic) throw new Response("主题不存在", { status: 404 });
  return cachedPage(60, { topic: selectedTopic, rules }, upstream);
}
