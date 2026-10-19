import { sql } from "@aihot/backend/db";
import { fetchDetail } from "@aihot/backend/sources/web-list";
import { publicSourceIssue, safePublicUrl, type PublicCandidate, type PublicSource } from "./public-source.ts";

export interface PublicDateMetadata {
  enabled: boolean; eligible: number; cacheHits: number; attempted: number;
  /** All dates added, including cache hits. No generated or update-only timestamps. */
  completed: number; failed: number; deferred: number; cacheFailed: boolean;
  /** Cursor over eligible records, so persistent early failures cannot monopolize the budget. */
  lastAttemptedId: string | null;
}
async function loadCachedDates(ids: string[], sourceId: string): Promise<Map<string, Date>> {
  const rows = await sql<{ id: string; published_at: Date }[]>`
    SELECT id, published_at FROM geo_public_items
    WHERE source_id = ${sourceId} AND id = ANY(${ids}::text[]) AND published_at IS NOT NULL`;
  return new Map(rows.map(row => [row.id, row.published_at]));
}

/** A verified day-only listing must not erase a known timestamp when changing transport.
 * The parsed listing date is the start of its configured source day. Never carry dates across days. */
export async function preservePublicDatePrecision(input: PublicCandidate[], source: PublicSource, lookup = loadCachedDates): Promise<PublicCandidate[]> {
  if (source.publicDatePrecision !== "day" || !input.length) return input;
  const cached = await lookup(input.filter(item => item.sourceId === source.id).map(item => item.id), source.id);
  return input.map(item => {
    const prior = item.sourceId === source.id ? cached.get(item.id) : null;
    const start = item.publishedAt?.getTime();
    if (prior && start !== undefined && Number.isFinite(start) && prior.getTime() >= start && prior.getTime() < start + 86_400_000) {
      return {...item, publishedAt: new Date(prior)};
    }
    return item;
  });
}
interface DateOptions {
  now?: number;
  startAfterId?: string | null;
  /** I/O seams for local fixtures; production uses the guarded shared reader and source-scoped DB lookup. */
  readDetail?: typeof fetchDetail;
  loadCachedDates?: typeof loadCachedDates;
}
function jinaAddress(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try { return /(?:^|\.)jina\.ai$/i.test(new URL(value).hostname); } catch { return false; }
}
function validDate(value: Date | null | undefined, now: number): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() <= now + 24 * 3600_000;
}

/** Enrich already-matched public candidates only. Failure never removes an original item.
 * The authoritative regex is the sole date rule: generic time elements can be update/related dates. */
export async function completePublicDates(input: PublicCandidate[], source: PublicSource, options: DateOptions = {}): Promise<{ items: PublicCandidate[]; metadata: PublicDateMetadata }> {
  const items = input.map(item => ({ ...item }));
  const metadata: PublicDateMetadata = { enabled: false, eligible: 0, cacheHits: 0, attempted: 0, completed: 0, failed: 0, deferred: 0, cacheFailed: false, lastAttemptedId: options.startAfterId ?? null };
  const detail = source.config.detail;
  if (!detail || typeof detail.publishedAtRegex !== "string" || !detail.publishedAtRegex.trim() || detail.publishedAtAuthoritative !== true || publicSourceIssue(source)
    || [source.config.url, source.config.feedUrl, source.sourceUrl].some(jinaAddress)) return { items, metadata };
  metadata.enabled = true;
  let eligible = items.filter(item => item.sourceId === source.id && item.publishedAt === null && item.matchedTerms.length > 0 && safePublicUrl(item.url)
    && !publicSourceIssue({ kind: "web_list", config: { url: item.url } }));
  metadata.eligible = eligible.length;
  if (!eligible.length) return { items, metadata };
  const previousIndex = eligible.findIndex(item => item.id === options.startAfterId);
  if (previousIndex >= 0) eligible = [...eligible.slice(previousIndex + 1), ...eligible.slice(0, previousIndex + 1)];
  // A malformed configured expression is a date failure, not a reason to discard source content.
  try { new RegExp(detail.publishedAtRegex); } catch { metadata.failed = eligible.length; return { items, metadata }; }
  const now = options.now ?? Date.now();
  let cached = new Map<string, Date>();
  try { cached = await (options.loadCachedDates ?? loadCachedDates)(eligible.map(item => item.id), source.id); }
  catch { metadata.cacheFailed = true; }
  const remaining: PublicCandidate[] = [];
  for (const item of eligible) {
    const date = cached.get(item.id);
    if (validDate(date, now)) { item.publishedAt = new Date(date); metadata.cacheHits++; metadata.completed++; }
    else remaining.push(item);
  }
  const requested = Number(detail.maxFetches ?? 8);
  const limit = Number.isInteger(requested) && requested >= 0 ? Math.min(requested, 20) : 8;
  const pending = remaining.slice(0, limit);
  if (pending.length) metadata.lastAttemptedId = pending.at(-1)!.id;
  metadata.deferred = remaining.length - pending.length;
  const dateSource: PublicSource = { ...source, config: { ...source.config, detail: {
    publishedAtRegex: detail.publishedAtRegex, publishedAtAuthoritative: true,
    ...(typeof detail.publishedAtUtcOffset === "string" ? { publishedAtUtcOffset: detail.publishedAtUtcOffset } : {}),
  } } };
  let position = 0;
  await Promise.all(Array.from({ length: Math.min(2, pending.length) }, async () => {
    for (;;) {
      const item = pending[position++];
      if (!item) return;
      metadata.attempted++;
      try {
        const result = await (options.readDetail ?? fetchDetail)(item.url, dateSource, { date: true, title: false, summary: false, body: false });
        if (validDate(result.publishedAt, now)) { item.publishedAt = new Date(result.publishedAt); metadata.completed++; }
        else metadata.failed++;
      } catch { metadata.failed++; }
    }
  }));
  return { items, metadata };
}
