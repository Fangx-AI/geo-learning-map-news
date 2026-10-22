import { redirect } from "react-router";
import { cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import type { GeoOverviewResponse, GeoDailyDigest } from "../types.ts";
import type { CollectionStatus } from "./collection-status.tsx";
import type { CardItem } from "./components.tsx";

interface GeoLatestFeed { items: CardItem[]; hiddenTotal: number }

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

export async function libraryLoader({ request }: Pick<PageArgs, "request">) {
  const upstream = new Headers();
  const digest = await loadOr404<GeoDailyDigest>("/api/geo/daily?view=library", { signal: request.signal, responseHeaders: upstream });
  return cachedPage(60, { digest }, upstream);
}
/** The home page: rule-picked headlines, the latest useful items, what many sources cover, and the newest full readings. */
export async function featuredLoader({ request }: Pick<PageArgs, "request">) {
  const upstream = new Headers();
  const [overview, latest, digest] = await Promise.all([
    getOverview(request, upstream),
    loadOr404<GeoLatestFeed>("/api/geo/public-items?sort=latest&quality=useful&kind=direct&group=title&limit=30", { signal: request.signal }),
    loadOr404<GeoDailyDigest>("/api/geo/daily?view=library", { signal: request.signal }),
  ]);
  // Headlines are articles; social posts stay in the feed, where they usually point to one. Platform
  // changes lead, then original data; one paper at most, since papers rarely change this week's work.
  const order = ["官方", "平台变化", "一手数据", "研究", "论文"];
  const weight = (badge?: string | null) => { const index = order.indexOf(badge ?? ""); return index < 0 ? order.length : index; };
  const highlights = overview.highlights.filter(item => item.contentKind !== "social")
    .map((item, index) => ({ item, index })).sort((a, b) => weight(a.item.readingPriority?.badge) - weight(b.item.readingPriority?.badge) || a.index - b.index).map(({ item }) => item)
    .filter((item, _, list) => item.readingPriority?.badge !== "论文" || list.find(other => other.readingPriority?.badge === "论文") === item).slice(0, 5);
  const platforms = new Set(overview.topics.filter(topic => topic.group === "company").map(topic => topic.slug));
  return cachedPage(60, {
    generatedAt: overview.generatedAt, window: overview.window, sourceCount: overview.stats.sourceCount,
    highlights,
    hot: overview.hotClusters.filter(cluster => platforms.has(cluster.topicSlug)).slice(0, 6).map(({ items, ...cluster }) => cluster),
    latest: latest.items.filter(item => !highlights.some(top => top.id === item.id)), hiddenTotal: latest.hiddenTotal,
    readings: digest.research.slice(0, 4), latestEdition: digest.latestEdition ?? null,
  }, upstream);
}
export async function hotLoader({ request }: Pick<PageArgs, "request">) {
  const upstream = new Headers();
  const { hotClusters, window } = await getOverview(request, upstream);
  return cachedPage(60, { hotClusters, window }, upstream);
}
export async function dailyLoader({ request, params }: PageArgs) {
  const day = params.key ?? new URL(request.url).searchParams.get("day") ?? undefined;
  const upstream = new Headers();
  // React Router's client navigations request /daily.data, while SSR uses /daily.
  if (!day && /^\/daily(?:\.data)?$/.test(new URL(request.url).pathname)) {
    const query = new URL(request.url).searchParams;
    if (query.get("view") === "library") { query.delete("view"); throw redirect(`/library${query.size ? `?${query}` : ""}`); }
    throw redirect("/");

  }
  const { days, selectedDay, dailyTotal, dailyItems } = await getOverview(request, upstream, { day });
  return cachedPage(60, { mode: "archive" as const, days, selectedDay, dailyTotal, dailyItems }, upstream);
}
export async function topicsLoader({ request }: Pick<PageArgs, "request">) {
  const upstream = new Headers();
  const { topics, stats } = await getOverview(request, upstream);
  return cachedPage(60, { topics: topics.map(({ items, ...topic }) => topic), stats }, upstream);
}
export async function topicLoader({ request, params }: PageArgs) {
  if (params.page) throw redirect(`/topics/${encodeURIComponent(params.slug ?? "")}`);
  const upstream = new Headers();
  const { selectedTopic } = await getOverview(request, upstream, { topic: params.slug });
  if (!selectedTopic) throw new Response("主题不存在", { status: 404 });
  return cachedPage(60, { topic: selectedTopic }, upstream);
}
