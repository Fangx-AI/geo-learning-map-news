import * as cheerio from "cheerio";
import { z } from "zod";
import { sql } from "@aihot/backend/db";
import { credential } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { normalizeUrl } from "@aihot/backend/lib/url";
import { fetchRss } from "@aihot/backend/sources/rss";
import { fetchWebList } from "@aihot/backend/sources/web-list";
import { fetchJsonList } from "@aihot/backend/sources/json-list";
import { loadPublicSources } from "./collect-public.ts";
import { loadPublicSocialSources, readPublicSocialPost, socialPublicationSource } from "./public-social.ts";
import { publicCollectionError, publicSourceIssue, safePublicUrl, toPublicCandidates, type PublicCandidate } from "./public-source.ts";
import { cleanSourceSummary, makePublicSummary, PUBLIC_SUMMARY_VERSION, type PublicSummary } from "./public-summary.ts";
import { acquireCollectorLock } from "./collector-runtime.ts";
import { fetchSogouWeixinIndex, fetchZhihuGoogleNewsIndex } from "./public-domestic.ts";

const originalSchema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), canonical_id: z.string().regex(/^[a-f0-9]{64}$/), source_id: z.string().min(1), title: z.string(), summary: z.string().nullable(), language: z.string(), url: z.string().url(), summary_version: z.number().int().min(0) });
const summarySchema = z.object({ summary: z.string().max(1800).nullable(), summaryRaw: z.string().max(16000).nullable(), summaryVersion: z.literal(PUBLIC_SUMMARY_VERSION), summaryOrigin: z.enum(["rss", "listing", "social", "body-excerpt", "metadata"]), summarySourceUrl: z.string().url() });
export const summaryPlanSchema = z.object({ schemaVersion: z.literal(1), summaryVersion: z.literal(PUBLIC_SUMMARY_VERSION), createdAt: z.string(), examined: z.number().int(), entries: z.array(z.object({ before: originalSchema, after: summarySchema })).max(500), outcomes: z.array(z.object({ sourceId: z.string(), status: z.string(), count: z.number().int(), error: z.string().optional() })) });
export type SummaryOriginal = z.infer<typeof originalSchema>;
export type SummaryBackfillPlan = z.infer<typeof summaryPlanSchema>;
const PRIORITY = ["rss-arxiv-geo", "rss-arxiv-ir", "rss-gsqi", "rss-rich-sanger", "rss-sparktoro", "rss-bing-webmaster", "rss-ahrefs", "rss-hacker-news-geo"];

/** Metadata must identify the same article, and extend its existing text. No full body extraction. */
export function extendedMetadataSummary(html: string, row: SummaryOriginal, responseUrl: string): PublicSummary | null {
  if (!safePublicUrl(responseUrl) || normalizeUrl(responseUrl) !== normalizeUrl(row.url)) return null;
  const $ = cheerio.load(html);
  const canonical = $('link[rel="canonical"]').first().attr("href");
  if (canonical && normalizeUrl(new URL(canonical, responseUrl).href) !== normalizeUrl(row.url)) return null;
  const prior = cleanSourceSummary(row.summary ?? "", row.url, row.url).replace(/\s*(?:…|\.\.\.|\[\s*…\s*\])\s*$/u, "").trimEnd();
  if (prior.length < 80) return null;
  const options = $('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]').toArray().map(node => $(node).attr("content") ?? "");
  for (const text of options.sort((a, b) => b.length - a.length)) {
    const result = makePublicSummary({ text, articleUrl: row.url, sourceUrl: responseUrl, origin: "metadata" });
    if (result.summary?.startsWith(prior) && result.summary.length > (row.summary?.length ?? 0) + 30) return result;
  }
  return null;
}

function fields(item: PublicCandidate): PublicSummary {
  return { summary: item.summary, summaryRaw: item.summaryRaw ?? null, summaryVersion: PUBLIC_SUMMARY_VERSION, summaryOrigin: item.summaryOrigin ?? "listing", summarySourceUrl: item.summarySourceUrl ?? item.sourceUrl };
}

/** Read-only: re-read bounded public sources; the resulting plan is an immutable review artifact. */
export async function planSummaryBackfill(options: { sourceId?: string; limit?: number; metadataLimit?: number; postLimit?: number } = {}): Promise<SummaryBackfillPlan> {
  const limit = Math.max(1, Math.min(500, options.limit ?? 100));
  const rows = await sql<SummaryOriginal[]>`SELECT i.id,i.canonical_id,i.source_id,i.title,i.summary,i.language,i.url,
    coalesce((to_jsonb(i)->>'summary_version')::integer,0) AS summary_version
    FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
    WHERE coalesce((to_jsonb(i)->>'summary_version')::integer,0) < ${PUBLIC_SUMMARY_VERSION}
      AND (${options.sourceId ?? null}::text IS NULL OR i.source_id=${options.sourceId ?? null})
    ORDER BY CASE WHEN length(i.summary)>=350 THEN 0 ELSE 1 END, coalesce(array_position(${PRIORITY}::text[],i.source_id),100),
      coalesce(i.published_at,i.collected_at) DESC,i.id LIMIT ${limit}`;
  const plan: SummaryBackfillPlan = { schemaVersion: 1, summaryVersion: PUBLIC_SUMMARY_VERSION, createdAt: new Date().toISOString(), examined: rows.length, entries: [], outcomes: [] };
  const [sources, socials] = await Promise.all([loadPublicSources(), loadPublicSocialSources()]);
  const pending = new Map(rows.map(row => [row.id, row]));
  const chosen = sources.filter(source => rows.some(row => row.source_id === source.id));
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(2, chosen.length) }, async () => {
    for (;;) {
      const source = chosen[index++]; if (!source) return;
      if (publicSourceIssue(source) || source.kind === "json_list" && new URL(String(source.config.url)).hostname === "api.github.com" && credential("collectors", "GITHUB_TOKEN")) { plan.outcomes.push({ sourceId: source.id, status: "unsupported", count: 0 }); continue; }
      try {
        const candidates = source.id === "rss-google-news-zhihu-geo" ? await fetchZhihuGoogleNewsIndex(source)
          : source.kind === "rss" ? (await fetchRss(source, { force: true, allowUpdatedAsPublished: false, titleFromExcerpt: true, includePublisher: true, includeSummaryMetadata: true })).candidates
          : source.kind === "json_list" ? await fetchJsonList(source)
          : /^https:\/\/weixin\.sogou\.com\/weixin\?/.test(String(source.config.url)) ? await fetchSogouWeixinIndex(source) : await fetchWebList(source);
        let count = 0;
        for (const fresh of toPublicCandidates(candidates, source)) {
          const before = pending.get(fresh.id);
          if (!before || before.canonical_id !== fresh.canonicalId || before.title !== fresh.title) continue;
          plan.entries.push({ before, after: fields(fresh) }); pending.delete(before.id); count++;
        }
        plan.outcomes.push({ sourceId: source.id, status: "read", count });
      } catch (error) { plan.outcomes.push({ sourceId: source.id, status: "failed", count: 0, error: publicCollectionError(error) }); }
    }
  }));
  let posts = 0, metadata = 0;
  for (const before of pending.values()) {
    const social = socials.find(source => source.id === before.source_id);
    try {
      if (social && posts < Math.max(0, Math.min(20, options.postLimit ?? 10))) {
        posts++;
        const fresh = toPublicCandidates([await readPublicSocialPost(before.url, social.platform)], socialPublicationSource(social))[0];
        if (fresh?.id === before.id && fresh.title === before.title) { plan.entries.push({ before, after: fields(fresh) }); plan.outcomes.push({ sourceId: social.id, status: "post", count: 1 }); }
      } else {
        const source = sources.find(item => item.id === before.source_id);
        if (!source || metadata >= Math.max(0, Math.min(10, options.metadataLimit ?? 5)) || !safePublicUrl(before.url) || new URL(source.sourceUrl).hostname !== new URL(before.url).hostname || !before.summary?.endsWith("…")) continue;
        metadata++;
        const response = await guardedFetch(before.url, { timeoutMs: 20_000, maxBytes: 1024 * 1024, headers: { accept: "text/html" } });
        if (response.status !== 200) { plan.outcomes.push({ sourceId: before.source_id, status: "metadata-unavailable", count: 0 }); continue; }
        const after = extendedMetadataSummary(response.body.toString("utf8"), before, response.url);
        if (after) plan.entries.push({ before, after });
        plan.outcomes.push({ sourceId: before.source_id, status: "metadata", count: after ? 1 : 0 });
      }
    } catch (error) { plan.outcomes.push({ sourceId: before.source_id, status: "failed", count: 0, error: publicCollectionError(error) }); }
  }
  plan.entries.sort((a,b) => a.before.id.localeCompare(b.before.id));
  return plan;
}

/** Writes only the reviewed plan, under the collector cycle lease and original-text CAS. */
export async function applySummaryBackfill(input: unknown): Promise<{ updated: number; skipped: number; textChanged: number }> {
  const plan = summaryPlanSchema.parse(input);
  const ids = new Set<string>();
  for (const { before, after } of plan.entries) {
    if (ids.has(before.id) || before.summary_version >= PUBLIC_SUMMARY_VERSION || !safePublicUrl(after.summarySourceUrl) || [...(after.summary ?? "")].length > 900 || [...(after.summaryRaw ?? "")].length > 8000) throw new Error("Invalid summary plan");
    ids.add(before.id);
    const expected = makePublicSummary({ text: after.summaryRaw, articleUrl: before.url, sourceUrl: after.summarySourceUrl, origin: after.summaryOrigin });
    if (expected.summary !== after.summary) throw new Error("Summary plan no longer matches its source excerpt");
  }
  const stopped = new AbortController();
  const release = await acquireCollectorLock("cycle", () => stopped.abort());
  let updated = 0, skipped = 0, textChanged = 0;
  try {
    for (const { before, after } of plan.entries) {
      stopped.signal.throwIfAborted();
      const changed = await sql`UPDATE geo_public_items i SET summary=${after.summary},summary_raw=${after.summaryRaw},summary_version=${after.summaryVersion},summary_origin=${after.summaryOrigin},summary_source_url=${after.summarySourceUrl}
        WHERE i.id=${before.id} AND i.source_id=${before.source_id} AND i.canonical_id=${before.canonical_id}
          AND i.title=${before.title} AND i.summary IS NOT DISTINCT FROM ${before.summary} AND i.language=${before.language}
          AND i.url=${before.url} AND i.summary_version=${before.summary_version}
          AND EXISTS (SELECT 1 FROM geo_public_source_status s WHERE s.source_id=i.source_id AND s.enabled)
        RETURNING i.id`;
      if (changed.length) { updated++; if (before.summary !== after.summary) textChanged++; } else skipped++;
    }
    return { updated, skipped, textChanged };
  } finally { await release(); }
}
