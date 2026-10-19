import { createHash } from "node:crypto";
import { sql, type Tx } from "@aihot/backend/db";
import type { PublicCandidate } from "./public-source.ts";
import { publicGroupKey, PUBLIC_GROUP_VERSION } from "./public-grouping.ts";

/** Bounded conversion outside release DDL; missing publication dates never get merged. */
export async function upgradePublicGroups(): Promise<number> {
  let updated = 0;
  for (;;) {
    const count = await sql.begin(async tx => {
      const rows = await tx<Array<{ id: string; canonical_id: string; title: string; url: string; language: string; published_at: Date | null }>>`SELECT id, canonical_id, title, url, language, published_at FROM geo_public_items WHERE group_key IS NULL OR group_version < ${PUBLIC_GROUP_VERSION} ORDER BY id LIMIT 250 FOR UPDATE SKIP LOCKED`;
      for (const row of rows) await tx`UPDATE geo_public_items SET group_key = ${publicGroupKey({ canonicalId: row.canonical_id || row.id, title: row.title, url: row.url, language: row.language, publishedAt: row.published_at })}, group_version = ${PUBLIC_GROUP_VERSION} WHERE id = ${row.id}`;
      return rows.length;
    });
    updated += count;
    if (!count) return updated;
  }
}

/** Bounded, resumable data conversion outside release DDL, as required by migration policy. */
export async function upgradeLegacyPublicItems(): Promise<number> {
  let converted = 0;
  for (;;) {
    const count = await sql.begin(async tx => {
      const rows = await tx<{ id: string; source_id: string }[]>`SELECT id, source_id FROM geo_public_items WHERE canonical_id = '' ORDER BY id LIMIT 250 FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return 0;
      for (const row of rows) {
        const id = createHash("sha256").update(`${row.source_id}\n${row.id}`).digest("hex");
        await tx`UPDATE geo_public_items SET canonical_id = ${row.id}, id = ${id} WHERE id = ${row.id}`;
      }
      // Earlier URL-only records could have mixed attribution. Refresh every feed, including
      // those whose duplicates were previously absorbed into another source's record.
      await tx`UPDATE geo_public_source_status SET cursor = '{}'::jsonb`;
      return rows.length;
    });
    converted += count;
    if (!count) return converted;
  }
}

/** Each source keeps its own original text; public reads choose one enabled source per URL. */
export async function savePublicCandidates(tx: Tx, items: PublicCandidate[], collectedAt = new Date()): Promise<void> {
  // Lists already fetched within the shared response-size limit remain complete. Batch writes
  // bound SQL parameter counts without imposing an arbitrary cutoff on older matching entries.
  for (let start = 0; start < items.length; start += 500) {
    const rows = items.slice(start, start + 500).map(item => ({ id: item.id, canonical_id: item.canonicalId, title: item.title, url: item.url, summary: item.summary, summary_raw: item.summaryRaw ?? null, summary_version: item.summaryVersion ?? 0, summary_origin: item.summaryOrigin ?? null, summary_source_url: item.summarySourceUrl ?? null, source_id: item.sourceId, source_name: item.sourceName, source_url: item.sourceUrl, language: item.language, published_at: item.publishedAt, collected_at: collectedAt, matched_terms: item.matchedTerms, group_key: publicGroupKey(item), group_version: PUBLIC_GROUP_VERSION, publisher_name: item.publisherName ?? null, publisher_url: item.publisherUrl ?? null, image_url: item.imageUrl ?? null, image_origin: item.imageOrigin ?? null, image_status: item.imageUrl ? "found" : "pending", image_checked_at: item.imageUrl ? collectedAt : null }));
    await tx`INSERT INTO geo_public_items ${tx(rows, "id", "canonical_id", "title", "url", "summary", "summary_raw", "summary_version", "summary_origin", "summary_source_url", "source_id", "source_name", "source_url", "language", "published_at", "collected_at", "matched_terms", "group_key", "group_version", "publisher_name", "publisher_url", "image_url", "image_origin", "image_status", "image_checked_at")}
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url, summary = EXCLUDED.summary,
        summary_raw = EXCLUDED.summary_raw, summary_version = EXCLUDED.summary_version, summary_origin = EXCLUDED.summary_origin, summary_source_url = EXCLUDED.summary_source_url,
        source_name = EXCLUDED.source_name, source_url = EXCLUDED.source_url,
        language = EXCLUDED.language, published_at = EXCLUDED.published_at, matched_terms = EXCLUDED.matched_terms,
        group_key = EXCLUDED.group_key, group_version = EXCLUDED.group_version, publisher_name = EXCLUDED.publisher_name, publisher_url = EXCLUDED.publisher_url,
        image_url = coalesce(EXCLUDED.image_url, geo_public_items.image_url),
        image_origin = CASE WHEN EXCLUDED.image_url IS NOT NULL THEN EXCLUDED.image_origin ELSE geo_public_items.image_origin END,
        image_status = CASE WHEN EXCLUDED.image_url IS NOT NULL THEN 'found' ELSE geo_public_items.image_status END,
        image_checked_at = CASE WHEN EXCLUDED.image_url IS NOT NULL THEN EXCLUDED.image_checked_at ELSE geo_public_items.image_checked_at END,
        image_error = CASE WHEN EXCLUDED.image_url IS NOT NULL THEN NULL ELSE geo_public_items.image_error END`;
  }
}
