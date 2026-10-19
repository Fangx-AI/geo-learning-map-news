import { sql } from "@aihot/backend/db";
import { GEO_TRANSLATION_VERSION, normalizeGeoTranslation, needsTranslationUpgrade, geoTranslationIssues } from "../../../industry/translation.ts";
import { translationHash, translationPercentages } from "./translate-public.ts";

export interface TranslationReference {
  itemId: string;
  contentHash: string;
  originalTitle: string;
  originalSummary: string | null;
  originalLanguage: string;
  referenceTitle: string;
  referenceSummary: string | null;
  publishable: boolean;
}
export const EDITED_TRANSLATION_PROVIDER = "geo-edited-v2";

/** Runs under the translation lease. References are opt-in and bound to exact source text. */
export async function repairCachedTranslations(options: { write?: boolean; references?: TranslationReference[] } = {}) {
  const references=new Map<string,TranslationReference>();
  for (const reference of options.references ?? []) {
    if (!reference.publishable) continue;
    const original={id:reference.itemId,title:reference.originalTitle,summary:reference.originalSummary,language:reference.originalLanguage};
    const output={title:reference.referenceTitle,summary:reference.referenceSummary};
    if (translationHash(original)!==reference.contentHash || !output.title.trim() || Boolean(original.summary?.trim())!==Boolean(output.summary?.trim())
      || geoTranslationIssues(original,output).length
      || (["title","summary"] as const).some(field=>JSON.stringify(translationPercentages(original[field] ?? ""))!==JSON.stringify(translationPercentages(output[field] ?? "")))) {
      throw new Error(`Invalid translation reference: ${reference.itemId}`);
    }
    references.set(reference.contentHash,reference);
  }
  const rows=await sql<Array<{id:string;title:string;summary:string|null;language:string;title_zh:string|null;summary_zh:string|null;
    provider:string|null;status:string|null;current:boolean;reviewed:boolean;content_hash:string|null;updated_at:string|null}>>`
    SELECT i.id,i.title,i.summary,i.language,t.title_zh,t.summary_zh,t.provider,t.status,t.content_hash,t.updated_at::text AS updated_at,
      EXISTS(SELECT 1 FROM geo_translation_corrections c WHERE c.item_id=i.id AND c.status='applied'
        AND (c.title_original,c.summary_original,c.language_original) IS NOT DISTINCT FROM (i.title,i.summary,i.language)) AS reviewed,
      (t.title_original,t.summary_original,t.language_original) IS NOT DISTINCT FROM (i.title,i.summary,i.language) AS current
    FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
    LEFT JOIN geo_public_translations t ON t.item_id=i.id
    WHERE i.language NOT IN ('zh','zh-CN','zh-TW')`;
  const result={examined:rows.length,normalized:0,edited:0,requeued:0,unchanged:0,stale:0,reviewed:0};
  for (const row of rows) {
    const hash=translationHash(row);
    const reference=references.get(hash);
    // Reviewed overlays always win; prior explicit reference edits are not machine drafts.
    if(row.reviewed || !reference && row.current && /^geo-edited-/.test(row.provider??"")){result.reviewed++;continue;}
    const previous={title:row.title_zh ?? "",summary:row.summary_zh};
    let output:typeof previous|null=null;
    let kind:"edited"|"normalized"|"requeued"|null=null;
    if (reference && reference.originalTitle===row.title && reference.originalSummary===row.summary && reference.originalLanguage===row.language) {
      output={title:reference.referenceTitle,summary:reference.referenceSummary};
      if (row.status!=='done' || !row.current || previous.title!==output.title || previous.summary!==output.summary) kind='edited';
    } else if (row.status==='done' && row.current && previous.title && (!row.summary?.trim() || previous.summary?.trim())) {
      if (needsTranslationUpgrade(row,previous)) kind='requeued';
      else {
        output=normalizeGeoTranslation(row,previous);
        if (output.title!==previous.title || output.summary!==previous.summary) kind='normalized';
      }
    }
    if (!kind) {result.unchanged++;continue;}
    if (options.write) {
      const changed=await sql`INSERT INTO geo_public_translations
        (item_id,content_hash,title_original,summary_original,language_original,title_zh,summary_zh,status,provider,attempts,next_attempt_at,last_error,updated_at)
        SELECT i.id,${hash},${row.title},${row.summary},${row.language},${kind==='requeued'?null:output!.title},${kind==='requeued'?null:output!.summary},
          ${kind==='requeued'?'error':'done'},${kind==='edited'?EDITED_TRANSLATION_PROVIDER:GEO_TRANSLATION_VERSION},0,now(),${kind==='requeued'?'quality-upgrade':null},now()
        FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
        WHERE i.id=${row.id} AND (i.title,i.summary,i.language) IS NOT DISTINCT FROM (${row.title},${row.summary},${row.language})
          AND NOT EXISTS(SELECT 1 FROM geo_translation_corrections c WHERE c.item_id=i.id AND c.status='applied'
            AND (c.title_original,c.summary_original,c.language_original) IS NOT DISTINCT FROM (i.title,i.summary,i.language))
        ON CONFLICT(item_id) DO UPDATE SET content_hash=EXCLUDED.content_hash,title_original=EXCLUDED.title_original,summary_original=EXCLUDED.summary_original,
          language_original=EXCLUDED.language_original,title_zh=EXCLUDED.title_zh,summary_zh=EXCLUDED.summary_zh,status=EXCLUDED.status,provider=EXCLUDED.provider,
          attempts=0,next_attempt_at=now(),last_error=EXCLUDED.last_error,updated_at=now()
          WHERE (geo_public_translations.status,geo_public_translations.provider,geo_public_translations.title_zh,geo_public_translations.summary_zh,geo_public_translations.content_hash,geo_public_translations.updated_at)
            IS NOT DISTINCT FROM (${row.status},${row.provider},${row.title_zh},${row.summary_zh},${row.content_hash},${row.updated_at}::text::timestamptz)
          RETURNING item_id`;
      if (!changed.length) {result.stale++;continue;}
    }
    result[kind]++;
  }
  return result;
}
