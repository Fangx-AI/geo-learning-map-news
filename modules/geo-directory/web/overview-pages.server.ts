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

const RESEARCH_BADGES = new Set(["研究", "论文", "一手数据"]);
// Recommended order puts studies, data and papers first, so a few pages hold the month's research.
async function recentResearchCandidates(request: Request) {
  const items: CardItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 4; page++) {
    const query = new URLSearchParams({ sort: "recommended", quality: "useful", kind: "direct", group: "title", period: "30d", limit: "50" });
    if (cursor) query.set("cursor", cursor);
    const feed: GeoLatestFeed & { nextCursor?: string | null } = await loadOr404(`/api/geo/public-items?${query}`, { signal: request.signal });
    items.push(...feed.items);
    cursor = feed.nextCursor ?? null;
    if (!cursor || !feed.items.some(item => RESEARCH_BADGES.has(item.readingPriority?.badge ?? ""))) break;
  }
  return items;
}
/** Full readings first; the last 30 days' studies, original data and papers are listed whether or not a reading exists. */
export async function libraryLoader({ request }: Pick<PageArgs, "request">) {
  const upstream = new Headers();
  const [digest, recent] = await Promise.all([
    loadOr404<GeoDailyDigest>("/api/geo/daily?view=library", { signal: request.signal, responseHeaders: upstream }),
    recentResearchCandidates(request).catch(() => []),
  ]);
  const research = recent.filter(item => RESEARCH_BADGES.has(item.readingPriority?.badge ?? ""))
    .sort((a, b) => Date.parse(b.publishedAt ?? b.collectedAt) - Date.parse(a.publishedAt ?? a.collectedAt));
  return cachedPage(60, { digest, research }, upstream);
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
  // Papers arrive in batches from arXiv; two a day stay in the feed, the rest wait in 研究与解读.
  const papersByDay = new Map<string, number>();
  let papersMoved = 0;
  const feed = latest.items.filter(item => !highlights.some(top => top.id === item.id)).filter(item => {
    if (item.readingPriority?.badge !== "论文") return true;
    const day = new Date(Date.parse(item.publishedAt ?? item.collectedAt) + 8 * 3600_000).toISOString().slice(0, 10);
    const count = (papersByDay.get(day) ?? 0) + 1;
    papersByDay.set(day, count);
    if (count <= 2) return true;
    papersMoved++;
    return false;
  });
  return cachedPage(60, {
    generatedAt: overview.generatedAt, window: overview.window, sourceCount: overview.stats.sourceCount,
    highlights,
    hot: overview.hotClusters.filter(cluster => platforms.has(cluster.topicSlug)).slice(0, 6).map(({ items, ...cluster }) => cluster),
    latest: feed, hiddenTotal: latest.hiddenTotal, papersMoved,
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
