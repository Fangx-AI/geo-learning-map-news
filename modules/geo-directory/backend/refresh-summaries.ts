import { sql } from "@aihot/backend/db";
import { makePublicSummary, PUBLIC_SUMMARY_VERSION, type PublicSummaryOrigin } from "./public-summary.ts";

/** Run under the collection lease. Old entries can disappear from RSS before a cleanup rule changes. */
export async function refreshStoredSummaries(sourceId?: string): Promise<{ updated: number; textChanged: number }> {
  const result = { updated: 0, textChanged: 0 };
  for (;;) {
    const batch = await sql.begin(async tx => {
      const rows = await tx<Array<{ id: string; url: string; summary: string | null; summary_raw: string; summary_origin: PublicSummaryOrigin; summary_source_url: string }>>`
        SELECT i.id,i.url,i.summary,i.summary_raw,i.summary_origin,i.summary_source_url
        FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
        WHERE i.summary_version > 0 AND i.summary_version < ${PUBLIC_SUMMARY_VERSION}
          AND nullif(btrim(i.summary_raw),'') IS NOT NULL
          AND i.summary_origin IN ('rss','listing','social','body-excerpt','metadata')
          AND nullif(btrim(i.summary_source_url),'') IS NOT NULL
          AND (${sourceId ?? null}::text IS NULL OR i.source_id=${sourceId ?? null})
        ORDER BY i.id LIMIT 250 FOR UPDATE OF i SKIP LOCKED`;
      let textChanged = 0;
      for (const row of rows) {
        const after = makePublicSummary({ text: row.summary_raw, sourceUrl: row.summary_source_url, articleUrl: row.url, origin: row.summary_origin });
        await tx`UPDATE geo_public_items SET summary=${after.summary},summary_version=${PUBLIC_SUMMARY_VERSION} WHERE id=${row.id}`;
        if (after.summary !== row.summary) textChanged++;
      }
      return { updated: rows.length, textChanged };
    });
    result.updated += batch.updated; result.textChanged += batch.textChanged;
    if (!batch.updated) return result;
  }
}
