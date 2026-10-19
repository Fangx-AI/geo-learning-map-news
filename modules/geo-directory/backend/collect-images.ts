import { sql } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { FetchError } from "@aihot/backend/sources/types";
import { candidateImage, pageCover } from "./public-image.ts";
import { publicCollectionError, safePublicUrl } from "./public-source.ts";
import { publicSocialUrl, readPublicSocialPost } from "./public-social.ts";

export interface ImageCollectionResult { attempted: number; found: number; noCover: number; failed: number; reused: number }
const INDIRECT = '^https?://(news[.]google[.]com|news[.]ycombinator[.]com|weixin[.]sogou[.]com|([^/]*[.])?(reddit[.]com|zhihu[.]com|xiaohongshu[.]com))/';

/** Only a stored article's public head metadata is read; no full text or image bytes are stored here. */
export async function readPublicCover(url: string, fetcher: typeof guardedFetch = guardedFetch): Promise<string | null> {
  if (!safePublicUrl(url) || /\.(?:pdf|zip)(?:[?#]|$)/i.test(url)) return null;
  if (publicSocialUrl(url, "x")) return candidateImage(await readPublicSocialPost(url, "x", target => fetcher(target, {
    timeoutMs: 12_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3, redirectPolicy: "same-origin", headers: { accept: "application/json" },
  })));
  const response = await fetcher(url, { timeoutMs: 12_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3,
    redirectPolicy: "same-origin", headers: { accept: "text/html,application/xhtml+xml" } });
  if (response.status < 200 || response.status >= 300) throw new FetchError("public cover unavailable", response.status);
  if (/\/(?:login|signin|sign-in|auth|captcha|challenge)(?:\/|[?#]|$)/i.test(response.url)) throw new Error("public cover requires access check");
  if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") ?? "")) return null;
  return pageCover(response.text(), response.url);
}

/** Called under the collector's cycle lease. Bounded work survives restarts and respects retry cooldowns. */
export async function collectPublicImages(options: { limit?: number; sourceId?: string; read?: typeof readPublicCover } = {}): Promise<ImageCollectionResult> {
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(500, Math.floor(options.limit!))) : 40;
  // One canonical article can arrive through several feeds. Reuse its existing cover before any GET.
  const reused = await sql`WITH candidates AS (
    SELECT i.id, cover.image_url, cover.image_origin, cover.image_checked_at
    FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id = i.source_id AND s.enabled
    JOIN LATERAL (SELECT p.image_url, p.image_origin, p.image_checked_at FROM geo_public_items p
      WHERE p.canonical_id = i.canonical_id AND p.image_url IS NOT NULL
      ORDER BY (p.image_origin = 'rss') DESC, p.image_checked_at DESC NULLS LAST, p.id LIMIT 1) cover ON true
    WHERE i.image_url IS NULL AND i.canonical_id <> ''
      AND (${options.sourceId ?? null}::text IS NULL OR i.source_id = ${options.sourceId ?? null})
    ORDER BY i.id LIMIT 500
  ) UPDATE geo_public_items i SET image_url = c.image_url, image_origin = c.image_origin, image_status = 'found',
    image_checked_at = coalesce(c.image_checked_at, now()), image_error = NULL FROM candidates c
    WHERE i.id = c.id AND i.image_url IS NULL RETURNING i.id`;
  const rows = await sql<{ canonical_id: string; url: string }[]>`
    SELECT canonical_id, url FROM (
      SELECT DISTINCT ON (i.canonical_id) i.canonical_id, i.url, i.image_checked_at, coalesce(i.published_at, i.collected_at) AS at
      FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id = i.source_id AND s.enabled
      WHERE i.image_url IS NULL AND i.url !~* ${INDIRECT}
        AND (${options.sourceId ?? null}::text IS NULL OR i.source_id = ${options.sourceId ?? null})
        AND (i.image_checked_at IS NULL OR i.image_checked_at < now() - CASE WHEN i.image_status = 'error' THEN interval '1 day' ELSE interval '7 days' END)
      ORDER BY i.canonical_id, i.image_checked_at NULLS FIRST, coalesce(i.published_at, i.collected_at) DESC, i.id
    ) candidates ORDER BY image_checked_at NULLS FIRST, at DESC, canonical_id LIMIT ${limit}`;
  const result: ImageCollectionResult = { attempted: 0, found: 0, noCover: 0, failed: 0, reused: reused.length };
  let position = 0;
  await Promise.all(Array.from({ length: Math.min(2, rows.length) }, async () => {
    for (;;) {
      const row = rows[position++];
      if (!row) return;
      result.attempted++;
      let image: string | null = null, error: string | null = null;
      try { image = await (options.read ?? readPublicCover)(row.url); }
      catch (cause) { error = publicCollectionError(cause); }
      const status = image ? "found" : error ? "error" : "none";
      // A concurrently received RSS cover always wins over an older metadata request.
      await sql`UPDATE geo_public_items SET image_url = ${image}, image_origin = ${image ? publicSocialUrl(row.url, "x") ? "social" : "og-image" : null},
        image_status = ${status}, image_checked_at = now(), image_error = ${error}
        WHERE canonical_id = ${row.canonical_id} AND image_url IS NULL`;
      if (image) result.found++; else if (error) result.failed++; else result.noCover++;
    }
  }));
  return result;
}
