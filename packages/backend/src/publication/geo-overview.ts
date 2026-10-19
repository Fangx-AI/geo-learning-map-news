import { sql } from "../db.ts";
import type { GeoPublicItem } from "./geo-public.ts";
import { geoPlatformSql, geoContentKindSql, geoTranslationJoinSql, geoTranslationColumnsSql, publicTranslation, loadGeoReadingAvailability } from "./geo-public.ts";
import { proxiedImage } from "../media/imgproxy.ts";
import { readingPriority } from "./geo-quality.ts";

export interface GeoOverviewDay { day: string; count: number; publishedCount: number; collectedOnlyCount: number }
export interface GeoOverviewInput { items: GeoPublicItem[]; days: GeoOverviewDay[]; selectedDay: string | null; dailyTotal: number; total: number; sourceCount: number; undatedCount: number; lastCollectedAt: string | null }
type StoredItem = { id: string; title: string; url: string; summary: string | null; source_id: string; source_name: string; source_url: string; language: string; published_at: string | null; collected_at: string; matched_terms: string[]; platform: string; content_kind: "direct" | "social" | "aggregated"; publisher_name: string | null; publisher_url: string | null; image_url: string | null; image_origin: string | null; translation_title: string | null; translation_summary: string | null; translation_provider: string | null };

/** One bounded read: latest 4,000 collected URLs plus up to 200 entries for the requested day.
 * Counts and archive dates cover the complete enabled collection, not just the analysis sample. */
export async function loadGeoOverviewInput(day?: string): Promise<GeoOverviewInput> {
  const [result] = await sql<Array<{ items: StoredItem[] | null; days: GeoOverviewDay[] | null; selected_day: string | null; daily_total: number; total: number; source_count: number; undated_count: number; last_collected_at: Date | null }>>`
    WITH eligible AS MATERIALIZED (
      SELECT DISTINCT ON (coalesce(nullif(i.canonical_id, ''), i.id)) i.id, i.canonical_id, i.title, i.url, i.summary, i.source_id, i.source_name, i.source_url, i.language, i.published_at, i.collected_at, i.matched_terms, i.publisher_name, i.publisher_url, i.image_url, i.image_origin,
        ${geoTranslationColumnsSql},
        (${geoPlatformSql}) AS platform, (${geoContentKindSql}) AS content_kind,
        to_char(coalesce(i.published_at, i.collected_at) AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS archive_day
      FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id = i.source_id ${geoTranslationJoinSql}
      WHERE s.enabled ORDER BY coalesce(nullif(i.canonical_id, ''), i.id), i.collected_at ASC, i.id DESC
    ), archive AS (
      SELECT archive_day AS day, count(*)::int AS count, count(published_at)::int AS "publishedCount",
        count(*) FILTER (WHERE published_at IS NULL)::int AS "collectedOnlyCount"
      FROM eligible GROUP BY archive_day
    ), selected AS (
      SELECT coalesce(${day ?? null}::text, (SELECT max(day) FROM archive WHERE day <= to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')), (SELECT max(day) FROM archive)) AS day
    ), recent AS (SELECT id FROM eligible ORDER BY collected_at DESC, id DESC LIMIT 4000),
    daily AS (SELECT id FROM eligible WHERE archive_day = (SELECT day FROM selected) ORDER BY coalesce(published_at, collected_at) DESC, id DESC LIMIT 200),
    chosen AS (SELECT id FROM recent UNION SELECT id FROM daily)
    SELECT (SELECT jsonb_agg(to_jsonb(i) - 'canonical_id' - 'archive_day') FROM eligible i JOIN chosen c ON c.id = i.id) AS items,
      (SELECT jsonb_agg(a ORDER BY a.day DESC) FROM (SELECT * FROM archive WHERE day IN (SELECT day FROM archive ORDER BY day DESC LIMIT 90) OR day = (SELECT day FROM selected)) a) AS days,
      (SELECT day FROM selected) AS selected_day,
      coalesce((SELECT count FROM archive WHERE day = (SELECT day FROM selected)), 0)::int AS daily_total,
      (SELECT count(*)::int FROM eligible) AS total,
      (SELECT count(DISTINCT source_id)::int FROM eligible) AS source_count,
      (SELECT count(*)::int FROM eligible WHERE published_at IS NULL) AS undated_count,
      (SELECT max(last_success_at) FROM geo_public_source_status WHERE enabled) AS last_collected_at`;
  const ready = await loadGeoReadingAvailability(result?.items ?? []);
  return {
    items: (result?.items ?? []).map(row => {
      const item = { id: row.id, title: row.title, url: row.url, summary: row.summary, sourceId: row.source_id, sourceName: row.source_name, sourceUrl: row.source_url, language: row.language, publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null, collectedAt: new Date(row.collected_at).toISOString(), matchedTerms: row.matched_terms, platform: row.platform, contentKind: row.content_kind, publisherName: row.publisher_name, publisherUrl: row.publisher_url, imageUrl: proxiedImage(row.image_url, "card"), imageOrigin: row.image_origin };
      return { ...item, readingReady: ready.has(item.id), translation: publicTranslation(row), readingPriority: readingPriority(item) };
    }),
    days: result?.days ?? [], selectedDay: result?.selected_day ?? null, dailyTotal: result?.daily_total ?? 0,
    total: result?.total ?? 0, sourceCount: result?.source_count ?? 0, undatedCount: result?.undated_count ?? 0,
    lastCollectedAt: result?.last_collected_at?.toISOString() ?? null,
  };
}
