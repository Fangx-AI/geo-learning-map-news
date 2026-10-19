// The single public read layer for the GEO module's unscored original-source feed.
// This table contains only short source excerpts; it does not join or publish model evaluations.
import { sql } from "../db.ts";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "../config.ts";
import { proxiedImage } from "../media/imgproxy.ts";
import { geoReadingRankSql, geoGroupLinkPreferenceSql, readingPriority, READING_POLICY_VERSION, type ReadingPriority } from "./geo-quality.ts";
import { readerBriefSchema, readerBriefInputHash, type PublishedReaderBrief } from "../../../../modules/geo-directory/backend/reader-brief.ts";

export interface GeoPublicItem {
  id: string; title: string; url: string; summary: string | null;
  sourceId: string; sourceName: string; sourceUrl: string; language: string;
  publishedAt: string | null; collectedAt: string; matchedTerms: string[];
  platform?: string; contentKind?: "direct" | "social" | "aggregated";
  publisherName?: string | null; publisherUrl?: string | null;
  imageUrl?: string | null; imageOrigin?: string | null;
  translation?: GeoPublicTranslation | null;
  brief?: PublishedReaderBrief;
  readingReady?: boolean;
  readingPriority?: ReadingPriority;
  nearDuplicates?: { key: string; count: number; items: GeoPublicItem[]; remainingCount: number };
}
export interface GeoPublicTranslation { title: string; summary: string | null; language: "zh"; provider: string }
export type GeoPublicSort = "recommended" | "latest";
export interface GeoPublicQuery { q?: string; language?: string; source?: string; platform?: string; kind?: string; period?: string; group?: "title" | "none"; groupKey?: string; sort?: GeoPublicSort; limit?: number; cursor?: string }
export interface GeoPublicCursor { at: string; id: string; v?: 2; sort?: GeoPublicSort; policy?: number; rank?: number; scope?: string }

/** Whitespace separates required terms; quotes retain a phrase. Terms remain literal SQL text. */
export function parseGeoSearch(value?: string): string[] {
  return [...new Set([...(value ?? "").matchAll(/"([^"]+)"|“([^”]+)”|([^\s"“”]+)/gu)].map(match => (match[1] ?? match[2] ?? match[3]).trim()).filter(Boolean))];
}

interface PublicItemRow {
  id: string; title: string; url: string; summary: string | null; source_id: string; source_name: string; source_url: string; language: string;
  published_at: Date | null; collected_at: Date; matched_terms: string[];
  platform: string; content_kind: "direct" | "social" | "aggregated"; publisher_name: string | null; publisher_url: string | null;
  image_url: string | null; image_origin: string | null;
  translation_title: string | null; translation_summary: string | null; translation_provider: string | null;
}
interface PublicRow extends PublicItemRow {
  cursor_at: string; effective_group: string; group_count: number; reading_rank: number;
}
interface BriefRow extends PublicItemRow {
  reader_brief: unknown; brief_input_hash: string | null; brief_updated_at: Date | null; brief_provenance: string | null;
}
function publishedItemWithBrief(row: BriefRow): GeoPublicItem {
  const item = publishedItem(row);
  if (row.brief_input_hash === readerBriefInputHash(row) && row.brief_updated_at) {
    const parsed = readerBriefSchema.safeParse(row.reader_brief);
    if (parsed.success) item.brief = { ...parsed.data, updatedAt: row.brief_updated_at.toISOString(), ...(row.brief_provenance === "local-model" ? { automated: true } : {}) };
  }
  item.readingReady = !!(item.brief?.coverage === "full-article" && !item.brief.automated);
  return item;
}
function publishedItem(row: PublicItemRow): GeoPublicItem {
  const item = { id: row.id, title: row.title, url: row.url, summary: row.summary, sourceId: row.source_id, sourceName: row.source_name, sourceUrl: row.source_url, language: row.language, publishedAt: row.published_at?.toISOString() ?? null, collectedAt: row.collected_at.toISOString(), matchedTerms: row.matched_terms, platform: row.platform, contentKind: row.content_kind, publisherName: row.publisher_name, publisherUrl: row.publisher_url, imageUrl: proxiedImage(row.image_url, "card"), imageOrigin: row.image_origin };
  return { ...item, translation: publicTranslation(row), readingPriority: readingPriority(item) };
}

export function publicTranslation(row: { translation_title: string | null; translation_summary: string | null; translation_provider: string | null }): GeoPublicTranslation | null {
  return row.translation_title && row.translation_provider ? { title: row.translation_title, summary: row.translation_summary, language: "zh", provider: row.translation_provider } : null;
}

// Only a complete translation of the current source text may be displayed or searched.
export const geoTranslationJoinSql = sql`LEFT JOIN geo_public_translations machine_translation ON machine_translation.item_id=i.id
  AND machine_translation.status='done'
  AND (machine_translation.title_original,machine_translation.summary_original,machine_translation.language_original) IS NOT DISTINCT FROM (i.title,i.summary,i.language)
  AND nullif(btrim(machine_translation.title_zh),'') IS NOT NULL
  AND (nullif(btrim(i.summary),'') IS NULL OR nullif(btrim(machine_translation.summary_zh),'') IS NOT NULL)
LEFT JOIN LATERAL (
  SELECT c.item_id,c.title_zh,c.summary_zh,c.reviewed_at FROM geo_translation_corrections c
    WHERE c.item_id=i.id AND c.status='applied'
      AND (c.title_original,c.summary_original,c.language_original) IS NOT DISTINCT FROM (i.title,i.summary,i.language)
    ORDER BY c.reviewed_at DESC,c.id DESC LIMIT 1
) reviewed_translation ON true
CROSS JOIN LATERAL (SELECT
  coalesce(reviewed_translation.item_id,machine_translation.item_id) AS item_id,
  CASE WHEN reviewed_translation.item_id IS NOT NULL THEN reviewed_translation.title_zh ELSE machine_translation.title_zh END AS title_zh,
  CASE WHEN reviewed_translation.item_id IS NOT NULL THEN reviewed_translation.summary_zh ELSE machine_translation.summary_zh END AS summary_zh,
  CASE WHEN reviewed_translation.item_id IS NOT NULL THEN 'geo-reviewed-v1'::text ELSE machine_translation.provider END AS provider,
  CASE WHEN reviewed_translation.item_id IS NOT NULL THEN reviewed_translation.reviewed_at ELSE machine_translation.updated_at END AS updated_at
) t`;
export const geoTranslationColumnsSql = sql`t.title_zh AS translation_title, t.summary_zh AS translation_summary, t.provider AS translation_provider`;

// Keep the prepared result shape stable when an online migration adds a storage column.
// SELECT i.* changed that shape on a warm pool and lost rows during cursor traversal.
const publicColumns = sql`i.id, i.title, i.url, i.summary, i.source_id, i.source_name, i.source_url,
  i.language, i.published_at, i.collected_at, i.matched_terms, i.publisher_name, i.publisher_url, i.image_url, i.image_origin, ${geoTranslationColumnsSql}`;

/** Classification describes the linked material, never a platform merely mentioned in its text. */
const hostSql = sql`lower(split_part(split_part(i.url, '/', 3), ':', 1))`;
export const geoPlatformSql = sql`CASE
  WHEN i.source_id = 'rss-google-news-zhihu-geo' AND ${hostSql} = 'news.google.com' THEN 'zhihu'
  WHEN ${hostSql} IN ('x.com','www.x.com','twitter.com','www.twitter.com') THEN 'x'
  WHEN ${hostSql} IN ('reddit.com','www.reddit.com','old.reddit.com') THEN 'reddit'
  WHEN ${hostSql} = 'bsky.app' THEN 'bluesky'
  WHEN i.source_id LIKE '%mastodon%' THEN 'mastodon'
  WHEN ${hostSql} IN ('youtube.com','www.youtube.com','youtu.be') THEN 'youtube'
  WHEN ${hostSql} IN ('zhihu.com','www.zhihu.com','zhuanlan.zhihu.com') THEN 'zhihu'
  WHEN ${hostSql} IN ('xiaohongshu.com','www.xiaohongshu.com','xhslink.com') THEN 'xiaohongshu'
  WHEN ${hostSql} IN ('mp.weixin.qq.com','weixin.sogou.com') THEN 'wechat'
  ELSE 'web' END`;
export const geoContentKindSql = sql`CASE WHEN ${hostSql} IN ('news.google.com','weixin.sogou.com') THEN 'aggregated'
  WHEN (${geoPlatformSql}) IN ('x','reddit','bluesky','mastodon','zhihu','xiaohongshu','wechat') THEN 'social'
  ELSE 'direct' END`;

/** Old URL-only bookmarks use canonical_id; an existing source-specific ID never changes attribution. */
export async function loadGeoPublicItem(value: string): Promise<GeoPublicItem | null> {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const id = value.toLowerCase();
  const [row] = await sql<BriefRow[]>`
    SELECT ${publicColumns}, (${geoPlatformSql}) AS platform, (${geoContentKindSql}) AS content_kind,
      b.brief AS reader_brief,b.input_hash AS brief_input_hash,b.updated_at AS brief_updated_at,b.provenance AS brief_provenance
    FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id = i.source_id AND s.enabled
    ${geoTranslationJoinSql}
    LEFT JOIN geo_public_reader_briefs b ON b.item_id=i.id
    WHERE i.id = ${id} OR (i.canonical_id = ${id} AND NOT EXISTS (SELECT 1 FROM geo_public_items exact WHERE exact.id = ${id}))
    ORDER BY i.collected_at ASC, i.id DESC LIMIT 1`;
  if (!row) return null;
  return publishedItemWithBrief(row);
}

/** Lightweight list status uses exactly the same snapshot and schema checks as the reader. */
export async function loadGeoReadingAvailability(items: Array<Pick<GeoPublicItem, "id" | "url" | "title" | "summary">>): Promise<Set<string>> {
  const rows = items.length ? await sql<{ item_id: string; input_hash: string; brief: unknown }[]>`
    SELECT item_id,input_hash,brief FROM geo_public_reader_briefs WHERE provenance='reviewed' AND item_id=ANY(${items.map(item => item.id)}::text[])` : [];
  const sourceById = new Map(items.map(item => [item.id, item]));
  const ready = new Set<string>();
  for (const row of rows) {
    const source = sourceById.get(row.item_id);
    const parsed = source && row.input_hash === readerBriefInputHash(source) ? readerBriefSchema.safeParse(row.brief) : null;
    if (parsed?.success && parsed.data.coverage === "full-article") ready.add(row.item_id);
  }
  return ready;
}

/** Original publication time and first brief publication are separate clocks.
 * Read across the full collection, independently of the overview's recent-item sample. */
export async function loadGeoDailyCandidates(now: number, library = false) {
  const since = new Date(now - 24 * 3600_000);
  const midnight = new Date(new Date(now + 8 * 3600_000).toISOString().slice(0, 10) + "T00:00:00+08:00");
  const rows = await sql<(BriefRow & { brief_created_at: Date | null; canonical_id: string })[]>`
    SELECT ${publicColumns}, i.canonical_id, (${geoPlatformSql}) AS platform, (${geoContentKindSql}) AS content_kind,
      b.brief AS reader_brief,b.input_hash AS brief_input_hash,b.updated_at AS brief_updated_at,
      b.provenance AS brief_provenance,b.created_at AS brief_created_at
    FROM (SELECT i.*, (${geoContentKindSql}) AS content_kind FROM geo_public_items i) i
    JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
    ${geoTranslationJoinSql}
    LEFT JOIN geo_public_reader_briefs b ON b.item_id=i.id
    WHERE (${!library} AND i.published_at >= ${since} AND i.published_at <= ${new Date(now)})
      OR ((${library} OR b.created_at >= ${midnight}) AND b.created_at <= ${new Date(now)} AND b.provenance='reviewed')
    ORDER BY ${geoReadingRankSql}, b.created_at DESC NULLS LAST, i.published_at DESC NULLS LAST, i.id
    LIMIT 2001`;
  return { truncated: rows.length > 2000, candidates: rows.slice(0, 2000).map(row => ({
    item: publishedItemWithBrief(row), canonicalId: row.canonical_id || row.id,
    briefCreatedAt: row.brief_created_at?.toISOString() ?? null,
  })) };
}

function cursorScope(query: GeoPublicQuery): string {
  return createHash("sha256").update(JSON.stringify({ q: parseGeoSearch(query.q).map(term => term.toLowerCase()).sort(), language: query.language || null, source: query.source || null, platform: query.platform || null, kind: query.kind || null, period: query.period || null, group: query.group ?? "none", groupKey: query.groupKey || null })).digest("hex");
}
export function readGeoCursor(value?: string, query?: GeoPublicQuery): GeoPublicCursor | null {
  if (!value) return null;
  try {
    if (value.length > 400 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof cursor.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/.test(cursor.at) || new Date(cursor.at).toISOString() !== cursor.at.replace(/\.(\d{3})\d{3}Z$/, ".$1Z") || !/^[a-f0-9]{64}$/.test(cursor.id)) throw new Error();
    if (cursor.v === undefined) {
      if (query?.sort === "recommended") throw new Error();
      return { at: cursor.at, id: cursor.id };
    }
    if (cursor.v !== 2 || !["recommended", "latest"].includes(cursor.sort) || cursor.policy !== READING_POLICY_VERSION || !/^[a-f0-9]{64}$/.test(cursor.scope)) throw new Error();
    if (cursor.sort === "recommended" && (!Number.isInteger(cursor.rank) || cursor.rank < 0 || cursor.rank > 2)) throw new Error();
    if (query && (query.sort && query.sort !== cursor.sort || cursor.scope !== cursorScope(query))) throw new Error();
    return { at: cursor.at, id: cursor.id, v: 2, sort: cursor.sort, policy: cursor.policy, scope: cursor.scope, ...(cursor.sort === "recommended" ? { rank: cursor.rank } : {}) };
  } catch { throw new Error("invalid GEO feed cursor"); }
}

export async function loadGeoPublicItems(query: GeoPublicQuery = {}): Promise<{ items: GeoPublicItem[]; total: number; totalGroups: number; groupMode: "title" | "none"; sort: GeoPublicSort; searchTerms: string[]; nextCursor: string | null; sources: Array<{ id: string; name: string; count: number; latestPublishedAt: string | null }>; languages: string[]; lastCollectedAt: string | null }> {
  const cursor = readGeoCursor(query.cursor, query);
  const sort = query.sort ?? cursor?.sort ?? "latest";
  const limit = Math.max(1, Math.min(50, Math.floor(query.limit ?? 30)));
  const searchTerms = parseGeoSearch(query.q);
  const groupMode = query.group ?? "none";
  const groupKey = query.groupKey || null;
  const language = query.language || null;
  const source = query.source || null;
  const platform = query.platform || null;
  const kind = query.kind || null;
  const hours = query.period === "24h" ? 24 : query.period === "7d" ? 168 : query.period === "30d" ? 720 : null;
  const condition = sql`s.enabled AND NOT EXISTS (SELECT 1 FROM unnest(${searchTerms}::text[]) AS term WHERE strpos(lower(i.title || ' ' || coalesce(i.summary, '') || ' ' || coalesce(t.title_zh, '') || ' ' || coalesce(t.summary_zh, '')), lower(term)) = 0)
    AND (${language}::text IS NULL OR i.language = ${language}) AND (${source}::text IS NULL OR i.source_id = ${source})
    AND (${platform}::text IS NULL OR (${geoPlatformSql}) = ${platform})
    AND (${kind}::text IS NULL OR (${geoContentKindSql}) = ${kind})
    AND (${hours}::int IS NULL OR i.published_at BETWEEN now() - ${hours}::int * interval '1 hour' AND now())
    AND (${groupKey}::text IS NULL OR coalesce(i.group_key, nullif(i.canonical_id,''), i.id) = ${groupKey})`;
  // Keep source text and attribution together. A second source already stored locally becomes
  // visible immediately when the first is disabled, including when its next fetch returns 304.
  const eligible = sql`SELECT DISTINCT ON (coalesce(nullif(i.canonical_id, ''), i.id)) ${publicColumns}, coalesce(i.group_key, nullif(i.canonical_id,''), i.id) AS effective_group, (${geoPlatformSql}) AS platform, (${geoContentKindSql}) AS content_kind FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id = i.source_id ${geoTranslationJoinSql}
    WHERE ${condition} ORDER BY coalesce(nullif(i.canonical_id, ''), i.id), i.collected_at ASC, i.id DESC`;
  const order = sort === "recommended" ? sql`i.reading_rank ASC, coalesce(i.published_at, i.collected_at) DESC, i.id DESC` : sql`coalesce(i.published_at, i.collected_at) DESC, i.id DESC`;
  // Only the group's representative prefers a direct link within its reading tier.
  // Global order and cursor comparisons continue to use the representative's date and ID.
  const groupOrder = sort === "recommended" ? sql`i.reading_rank ASC, ${geoGroupLinkPreferenceSql} ASC, coalesce(i.published_at, i.collected_at) DESC, i.id DESC` : order;
  const readingRank = sort === "recommended" ? geoReadingRankSql : sql`1`;
  const later = sql`(coalesce(i.published_at, i.collected_at), i.id) < (${cursor?.at ?? null}::text::timestamptz, ${cursor?.id ?? null}::text)`;
  const afterCursor = sort === "recommended" ? sql`(i.reading_rank > ${cursor?.rank ?? null}::int OR (i.reading_rank = ${cursor?.rank ?? null}::int AND ${later}))` : later;
  const [rows, [count], sources, languages, [latest]] = await Promise.all([
    sql<PublicRow[]>`
      WITH eligible AS (${eligible}), scored AS (SELECT i.*, ${readingRank} AS reading_rank FROM eligible i), ranked AS (
        SELECT i.*, count(*) OVER (PARTITION BY effective_group)::int AS group_count,
          row_number() OVER (PARTITION BY effective_group ORDER BY ${groupOrder}) AS group_rank FROM scored i
      )
      SELECT i.*, to_char(coalesce(i.published_at, i.collected_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM ranked i
      WHERE (${groupMode === "none"} OR group_rank = 1)
        AND (${cursor?.at ?? null}::text IS NULL OR ${afterCursor})
      ORDER BY ${order} LIMIT ${limit + 1}`,
    sql<{ total: number; groups: number }[]>`WITH eligible AS (${eligible}) SELECT count(*)::int AS total, count(DISTINCT effective_group)::int AS groups FROM eligible`,
    sql<{ id: string; name: string; count: number; latest: Date | null }[]>`SELECT s.source_id AS id, s.source_name AS name, count(DISTINCT coalesce(nullif(i.canonical_id,''),i.id))::int AS count, max(i.published_at) AS latest FROM geo_public_source_status s JOIN geo_public_items i ON i.source_id = s.source_id WHERE s.enabled GROUP BY s.source_id, s.source_name ORDER BY s.source_name, s.source_id`,
    sql<{ language: string }[]>`SELECT DISTINCT i.language FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id = i.source_id WHERE s.enabled ORDER BY i.language`,
    sql<{ at: Date | null }[]>`SELECT max(last_success_at) AS at FROM geo_public_source_status WHERE enabled`,
  ]);
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  const grouped = groupMode === "title" ? visible.filter(row => row.group_count > 1) : [];
  const members = grouped.length ? await sql<PublicRow[]>`
    WITH eligible AS (${eligible}), scored AS (SELECT i.*, ${readingRank} AS reading_rank FROM eligible i), members AS (
      SELECT i.*, row_number() OVER (PARTITION BY effective_group ORDER BY ${groupOrder}) AS member_rank
      FROM scored i WHERE effective_group = ANY(${grouped.map(row => row.effective_group)}::text[]) AND NOT (id = ANY(${grouped.map(row => row.id)}::text[]))
    ) SELECT * FROM members WHERE member_rank <= 19 ORDER BY effective_group, member_rank` : [];
  const extras = new Map<string, GeoPublicItem[]>();
  const ready = await loadGeoReadingAvailability([...visible, ...members]);
  const listItem = (row: PublicItemRow) => ({ ...publishedItem(row), readingReady: ready.has(row.id) });
  for (const member of members) { const list = extras.get(member.effective_group) ?? []; list.push(listItem(member)); extras.set(member.effective_group, list); }
  return {
    items: visible.map(row => {
      const item: GeoPublicItem = listItem(row);
      if (groupMode === "title" && row.group_count > 1) {
        const items = extras.get(row.effective_group) ?? [];
        item.nearDuplicates = { key: row.effective_group, count: row.group_count, items, remainingCount: Math.max(0, row.group_count - 1 - items.length) };
      }
      return item;
    }),
    total: count?.total ?? 0,
    totalGroups: groupMode === "title" ? count?.groups ?? 0 : count?.total ?? 0, groupMode, sort, searchTerms,
    nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ v: 2, sort, policy: READING_POLICY_VERSION, ...(sort === "recommended" ? { rank: last.reading_rank } : {}), at: last.cursor_at, id: last.id, scope: cursorScope(query) })).toString("base64url") : null,
    sources: sources.map(row => ({ id: row.id, name: row.name, count: row.count, latestPublishedAt: row.latest?.toISOString() ?? null })), languages: languages.map(row => row.language), lastCollectedAt: latest?.at?.toISOString() ?? null,
  };
}

/** The watcher checks due sources every 30 minutes; an ordinary scheduled wait is not a delay. */
export function geoSourceStale(enabled: boolean, lastAttemptAt: Date | null, intervalMinutes?: number, now = Date.now()): boolean {
  if (!enabled) return false;
  if (!lastAttemptAt || !Number.isFinite(lastAttemptAt.getTime())) return true;
  const thresholdMinutes = typeof intervalMinutes === "number" && Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes + 30 : 120;
  return now - lastAttemptAt.getTime() > thresholdMinutes * 60_000;
}

async function geoSourceIntervals(): Promise<Map<string, number>> {
  // Read the same current file as the public collector, rather than the separate AI pipeline's sources table.
  const pack = JSON.parse(await readFile(path.join(REPO_ROOT, "industry/sources.json"), "utf8")) as {
    sources: Array<{ id: string; kind: string; enabled?: boolean; participation_mode?: string; interval_minutes?: number }>;
  };
  return new Map(pack.sources.filter(source => source.enabled !== false && source.participation_mode !== "isolated" && ["rss", "web_list", "json_list"].includes(source.kind))
    .map(source => [source.id, typeof source.interval_minutes === "number" && Number.isFinite(source.interval_minutes) && source.interval_minutes > 0 ? source.interval_minutes : 120]));
}

export async function loadGeoCollectionStatus() {
  const [rows, [runtime], intervals] = await Promise.all([
    sql<Array<{ source_id: string; source_name: string; enabled: boolean; status: string; last_attempt_at: Date | null; last_success_at: Date | null; fetched_count: number; matched_count: number; error: string | null; discovery: unknown }>>`
      SELECT source_id, source_name, enabled, status, last_attempt_at, last_success_at, fetched_count, matched_count, error, cursor->'socialDiscovery' AS discovery
      FROM geo_public_source_status ORDER BY enabled DESC, source_name, source_id`,
    sql<Array<{ state: string; heartbeat_at: Date; next_run_at: Date | null; last_started_at: Date | null; last_completed_at: Date | null; interval_minutes: number; error: string | null }>>`SELECT * FROM geo_public_collector_runtime WHERE id = 'watch'`,
    geoSourceIntervals(),
  ]);
  const successTimes = rows.filter(row => row.enabled && row.last_success_at).map(row => row.last_success_at!.getTime());
  const now = Date.now();
  // Whitelist counts only. Internal cursors can contain URLs or vendor values and are never published.
  const discoveryCounts = (input: unknown): Record<string, number> | null => {
    if (!input || typeof input !== "object") return null;
    const result: Record<string, number> = {};
    for (const key of ["discoveryPagesChecked", "discoveryPagesFailed", "articlesQueued", "articlesChecked", "articlesPending", "articlesFailed", "postsDiscovered", "postsPending", "postsFailed"]) {
      const value = (input as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) result[key] = value;
    }
    return result;
  };
  return {
    sources: rows.map(row => ({ id: row.source_id, name: row.source_name, enabled: row.enabled, status: row.status, lastAttemptAt: row.last_attempt_at?.toISOString() ?? null, lastSuccessAt: row.last_success_at?.toISOString() ?? null, count: row.matched_count, fetchedCount: row.fetched_count, error: row.error,
      stale: geoSourceStale(row.enabled, row.last_attempt_at, intervals.get(row.source_id), now), discovery: discoveryCounts(row.discovery) })),
    lastCollectedAt: successTimes.length ? new Date(Math.max(...successTimes)).toISOString() : null,
    collector: {
      state: !runtime ? "unknown" : runtime.state !== "stopped" && now - runtime.heartbeat_at.getTime() > 180_000 ? "stale" : runtime.state,
      heartbeatAt: runtime?.heartbeat_at.toISOString() ?? null, nextRunAt: runtime?.next_run_at?.toISOString() ?? null,
      lastStartedAt: runtime?.last_started_at?.toISOString() ?? null, lastCompletedAt: runtime?.last_completed_at?.toISOString() ?? null,
      intervalMinutes: runtime?.interval_minutes ?? 30, error: runtime?.error ?? null,
    },
  };
}
