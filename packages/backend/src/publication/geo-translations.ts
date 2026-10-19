import { sql } from "../db.ts";
import { geoTranslationJoinSql, geoTranslationColumnsSql, publicTranslation } from "./geo-public.ts";

export interface GeoTranslationStatus {
  total: number;
  translated: number;
  pending: number;
  retrying: number;
  state: "complete" | "running" | "waiting" | "paused";
  updatedAt: string | null;
  retryAt: string | null;
}

/** Count the same canonical representative readers see, without exposing worker errors or text. */
export async function loadGeoTranslationStatus(): Promise<GeoTranslationStatus> {
  const [counts, [runtime]] = await Promise.all([
    sql<Array<{ total: number; translated: number; retrying: number; updated_at: Date | null }>>`
      WITH visible AS (
        SELECT DISTINCT ON (coalesce(nullif(i.canonical_id,''),i.id))
          i.language,t.item_id AS translated_id,t.updated_at,
          EXISTS(SELECT 1 FROM geo_public_translations failed WHERE failed.item_id=i.id AND failed.status='error'
            AND (failed.title_original,failed.summary_original,failed.language_original) IS NOT DISTINCT FROM (i.title,i.summary,i.language)) AS retrying
        FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
        ${geoTranslationJoinSql}
        ORDER BY coalesce(nullif(i.canonical_id,''),i.id),i.collected_at ASC,i.id DESC
      ) SELECT count(*) FILTER(WHERE language NOT IN ('zh','zh-CN','zh-TW'))::int AS total,
        count(*) FILTER(WHERE language NOT IN ('zh','zh-CN','zh-TW') AND translated_id IS NOT NULL)::int AS translated,
        count(*) FILTER(WHERE language NOT IN ('zh','zh-CN','zh-TW') AND translated_id IS NULL AND retrying)::int AS retrying,
        max(updated_at) AS updated_at FROM visible`,
    sql<Array<{ active: boolean; retry_at: Date | null }>>`SELECT EXISTS(
        SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
        WHERE l.locktype='advisory' AND l.granted AND a.datname=current_database()
          AND l.classid=hashtext('geo-public-collector')::oid AND l.objid=hashtext('translation')::oid AND l.objsubid=2
      ) AS active,
      (SELECT retry_after FROM geo_public_translation_runtime
        WHERE provider=${process.env.PUBLIC_TRANSLATION_PROVIDER === "local" ? "local" : "bing"} AND retry_after>now()) AS retry_at`,
  ]);
  const row = counts[0];
  const pending = row.total - row.translated;
  return { total: row.total, translated: row.translated, pending, retrying: row.retrying,
    state: !pending ? "complete" : runtime.retry_at ? "waiting" : runtime.active ? "running" : "paused",
    updatedAt: row.updated_at?.toISOString() ?? null, retryAt: runtime.retry_at?.toISOString() ?? null };
}

/** Refresh translations in place; callers match the original fields before replacing a visible card. */
export async function loadGeoTranslations(ids: string[]) {
  if (!ids.length) return [];
  const rows = await sql<Array<{ id: string; title: string; summary: string | null; language: string;
    translation_title: string | null; translation_summary: string | null; translation_provider: string | null }>>`
    SELECT i.id,i.title,i.summary,i.language,${geoTranslationColumnsSql}
    FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
    ${geoTranslationJoinSql} WHERE i.id=ANY(${[...new Set(ids)].slice(0,100)}::text[])`;
  return rows.map(row => ({id:row.id,title:row.title,summary:row.summary,language:row.language,translation:publicTranslation(row)}));
}
