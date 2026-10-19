import { readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT, credential } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";
import { admitListing, filterPublicationWindow } from "@aihot/backend/sources/filters";
import { fetchRss } from "@aihot/backend/sources/rss";
import { fetchWebList } from "@aihot/backend/sources/web-list";
import { fetchJsonList } from "@aihot/backend/sources/json-list";
import type { Candidate, SourceRow } from "@aihot/backend/sources/types";
import { publicCollectionError, publicSourceIssue, safePublicUrl, toPublicCandidates, type PublicSource } from "./public-source.ts";
import { savePublicCandidates, upgradeLegacyPublicItems, upgradePublicGroups } from "./store-public.ts";
import { loadPublicSocialSources, type PublicSocialSource } from "./public-social.ts";
import { collectPublicSocial } from "./collect-social.ts";
import { completePublicDates, preservePublicDatePrecision } from "./public-dates.ts";
import { acquireCollectorLock } from "./collector-runtime.ts";
import { fetchSogouWeixinIndex, fetchZhihuGoogleNewsIndex } from "./public-domestic.ts";
import { collectPublicImages, type ImageCollectionResult } from "./collect-images.ts";
import { refreshStoredSummaries } from "./refresh-summaries.ts";

export interface SourceCollectionResult { id: string; status: "ok" | "partial" | "error" | "skipped"; fetched: number; matched: number; error: string | null }
export interface CollectionResult { sources: number; ok: number; partial: number; failed: number; skipped: number; fetched: number; matched: number; results: SourceCollectionResult[]; images?: ImageCollectionResult; summaries?: { updated: number; textChanged: number } }

export async function loadPublicSources(): Promise<PublicSource[]> {
  const pack = JSON.parse(await readFile(path.join(REPO_ROOT, "industry/sources.json"), "utf8")) as { sources: Array<Partial<PublicSource> & Pick<SourceRow, "id" | "name" | "kind" | "config">> };
  const directory = JSON.parse(await readFile(path.join(REPO_ROOT, "industry/source-directory.json"), "utf8")) as { sources: Array<{ sourceId?: string; url: string; language: string }> };
  const hints = new Map(directory.sources.filter(entry => entry.sourceId).map(entry => [entry.sourceId!, entry]));
  return pack.sources.filter(source => source.enabled !== false && source.participation_mode !== "isolated" && ["rss", "web_list", "json_list"].includes(source.kind)).map(source => {
    const hint = hints.get(source.id);
    const sourceUrl = safePublicUrl(hint?.url) ?? safePublicUrl(source.config.feedUrl ?? source.config.url) ?? "";
    const geoFocused = /\b(?:GEO|AEO|LLMO)\b|生成式引擎优化|AI Visibility/i.test(source.name) || /\/(?:geo|aeo|generative-engine-optimization|ai-search)(?:\/|$)/i.test(sourceUrl);
    return { tier: "T2", participation_mode: "editorial", first_party: false, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, ...source, sourceUrl, languageHint: hint?.language ?? null, geoFocused } as PublicSource;
  });
}

export function sourceCollectionWaitMs(intervalMinutes: number, lastAttemptAt: Date | null, now = Date.now()): number {
  if (!lastAttemptAt || !Number.isFinite(lastAttemptAt.getTime())) return 0;
  const minutes = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 120;
  return Math.max(0, lastAttemptAt.getTime() + minutes * 60_000 - now);
}

export async function collectSource(source: PublicSource, dependencies: { readRss?: typeof fetchRss; readWebList?: typeof fetchWebList; completeDates?: typeof completePublicDates; respectInterval?: boolean } = {}): Promise<SourceCollectionResult> {
  const issue = publicSourceIssue(source);
  if (issue) {
    await sql`UPDATE geo_public_source_status SET enabled = false, status = 'error', last_attempt_at = now(), error = ${issue} WHERE source_id = ${source.id}`;
    return { id: source.id, status: "skipped", fetched: 0, matched: 0, error: issue };
  }
  // This shared JSON reader adds a GitHub token automatically. Do not use it in no-key mode.
  if (source.kind === "json_list" && new URL(String(source.config.url)).hostname === "api.github.com" && credential("collectors", "GITHUB_TOKEN")) {
    const error = "此 JSON 读取器会自动附加已有 GitHub 凭据；公开免密钥模式跳过";
    await sql`UPDATE geo_public_source_status SET enabled = false, status = 'error', last_attempt_at = now(), error = ${error} WHERE source_id = ${source.id}`;
    return { id: source.id, status: "skipped", fetched: 0, matched: 0, error };
  }
  const [state] = await sql<{ cursor: SourceRow["cursor"]; last_attempt_at: Date | null }[]>`SELECT cursor,last_attempt_at FROM geo_public_source_status WHERE source_id = ${source.id}`;
  // Use the last attempt, including failures. Skipping must preserve the previous error and health timestamp.
  if (dependencies.respectInterval && sourceCollectionWaitMs(source.interval_minutes, state?.last_attempt_at ?? null) > 0) {
    return { id: source.id, status: "skipped", fetched: 0, matched: 0, error: null };
  }
  await sql`UPDATE geo_public_source_status SET status = 'running', last_attempt_at = now(), error = NULL WHERE source_id = ${source.id}`;
  try {
    assertSupportedConfig(source.kind, source.config);
    source.cursor = state?.cursor ?? null;
    let candidates: Candidate[];
    let cursor = source.cursor ?? {};
    let notModified = false;
    if (source.kind === "rss" && source.id === "rss-google-news-zhihu-geo") candidates = await fetchZhihuGoogleNewsIndex(source);
    else if (source.kind === "rss") {
      const result = await (dependencies.readRss ?? fetchRss)(source, { allowUpdatedAsPublished: false, titleFromExcerpt: true, includePublisher: true, includeImageMetadata: true, includeSummaryMetadata: true });
      candidates = result.candidates;
      cursor = { ...cursor, rss: result.validator };
      notModified = result.notModified;
    } else if (source.kind === "web_list" && /^https:\/\/weixin\.sogou\.com\/weixin\?/.test(String(source.config.url))) candidates = await fetchSogouWeixinIndex(source);
    else if (source.kind === "web_list") candidates = await (dependencies.readWebList ?? fetchWebList)(source);
    else candidates = await fetchJsonList(source);
    // The public stream intentionally does not apply the AI pipeline's initialBackfillLimit.
    const admitted = admitListing(candidates, source);
    const precise = await preservePublicDatePrecision(toPublicCandidates(admitted, source), source);
    const dated = await (dependencies.completeDates ?? completePublicDates)(precise, source, { startAfterId: typeof source.cursor?.publicDates?.lastAttemptedId === "string" ? source.cursor.publicDates.lastAttemptedId : null });
    const items = filterPublicationWindow(dated.items, source.config.publishedAfter);
    if (dated.metadata.enabled) cursor = { ...cursor, publicDates: dated.metadata };
    const incompleteDates = dated.metadata.failed > 0 || dated.metadata.deferred > 0 || dated.metadata.cacheFailed;
    // An unchanged feed still needs another pass when article-date work is unfinished.
    // Cached successful dates are reused, and lastAttemptedId rotates the bounded remainder.
    if (incompleteDates && source.kind === "rss") delete cursor.rss;
    const status = incompleteDates ? "partial" : "ok";
    const dateError = incompleteDates ? `已保存符合收录范围的公开内容；${dated.metadata.failed} 条发布日期暂未核实，${dated.metadata.deferred} 条等待后续核实${dated.metadata.cacheFailed ? "，日期缓存读取失败" : ""}` : null;
    await sql.begin(async tx => {
      await savePublicCandidates(tx, items);
      await tx`UPDATE geo_public_source_status SET status = ${status}, last_success_at = now(),
        fetched_count = CASE WHEN ${notModified} THEN fetched_count ELSE ${candidates.length} END,
        matched_count = CASE WHEN ${notModified} THEN matched_count ELSE ${items.length} END,
        cursor = ${tx.json(cursor)}, error = ${dateError} WHERE source_id = ${source.id}`;
    });
    return { id: source.id, status, fetched: candidates.length, matched: items.length, error: dateError };
  } catch (error) {
    const safeError = publicCollectionError(error);
    await sql`UPDATE geo_public_source_status SET status = 'error', error = ${safeError} WHERE source_id = ${source.id}`;
    return { id: source.id, status: "error", fetched: 0, matched: 0, error: safeError };
  }
}

/** Reconcile all module sources together, including when a CLI run selects only one source. */
export async function reconcilePublicSources(sources: PublicSource[], socialSources: PublicSocialSource[]): Promise<void> {
  // Edition references are imported only after source review, not fetched as an RSS feed.
  const allIds = ["geo-daily-references", ...sources.map(source => source.id), ...socialSources.map(source => source.id)];
  await sql.begin(async tx => {
    await tx`UPDATE geo_public_source_status SET enabled = false WHERE source_id <> ALL(${allIds}::text[])`;
    for (const source of sources) {
      await tx`INSERT INTO geo_public_source_status (source_id, source_name, source_url, enabled)
        VALUES (${source.id}, ${source.name}, ${source.sourceUrl}, ${publicSourceIssue(source) === null})
        ON CONFLICT (source_id) DO UPDATE SET source_name = EXCLUDED.source_name, source_url = EXCLUDED.source_url, enabled = EXCLUDED.enabled`;
    }
    for (const source of socialSources) {
      await tx`INSERT INTO geo_public_source_status (source_id, source_name, source_url, enabled)
        VALUES (${source.id}, ${source.name}, ${source.url}, true)
        ON CONFLICT (source_id) DO UPDATE SET source_name = EXCLUDED.source_name, source_url = EXCLUDED.source_url, enabled = true`;
    }
  });
}

/** Called by the explicit CLI, never by a page read. The normal AI pipeline is not started. */
export async function collectPublic(options: { sourceId?: string; concurrency?: number; respectIntervals?: boolean; onSource?: (result: SourceCollectionResult) => void; onLockLost?: () => void } = {}): Promise<CollectionResult> {
  if (process.env.PUBLIC_FEED_COLLECT_ENABLED !== "true") throw new Error("公开采集未开启：请显式设置 PUBLIC_FEED_COLLECT_ENABLED=true");
  const release = await acquireCollectorLock("cycle", options.onLockLost);
  try { return await collectPublicUnlocked(options); }
  finally { await release(); }
}

async function collectPublicUnlocked(options: { sourceId?: string; concurrency?: number; respectIntervals?: boolean; onSource?: (result: SourceCollectionResult) => void }): Promise<CollectionResult> {
  await upgradeLegacyPublicItems();
  await upgradePublicGroups();
  const [sources, socialSources] = await Promise.all([loadPublicSources(), loadPublicSocialSources()]);
  const chosen = options.sourceId ? sources.filter(source => source.id === options.sourceId) : sources;
  const chosenSocial = options.sourceId ? socialSources.filter(source => source.id === options.sourceId) : socialSources;
  if (options.sourceId && !chosen.length && !chosenSocial.length) throw new Error("指定来源不在已启用的公开信源配置中");
  await reconcilePublicSources(sources, socialSources);
  const summaries = await refreshStoredSummaries(options.sourceId);
  const results: SourceCollectionResult[] = [];
  let position = 0;
  const concurrency = Math.max(1, Math.min(8, Math.floor(options.concurrency ?? 4)));
  await Promise.all(Array.from({ length: Math.min(concurrency, chosen.length) }, async () => {
    for (;;) {
      const source = chosen[position++];
      if (!source) return;
      const result = await collectSource(source, { respectInterval: options.respectIntervals });
      results.push(result);
      options.onSource?.(result);
    }
  }));
  for (const source of chosenSocial) {
    const result = await collectPublicSocial(source);
    results.push(result); options.onSource?.(result);
  }
  const images = await collectPublicImages({ sourceId: options.sourceId });
  return { sources: chosen.length + chosenSocial.length, ok: results.filter(row => row.status === "ok").length, partial: results.filter(row => row.status === "partial").length, failed: results.filter(row => row.status === "error").length, skipped: results.filter(row => row.status === "skipped").length, fetched: results.reduce((n, row) => n + row.fetched, 0), matched: results.reduce((n, row) => n + row.matched, 0), results, images, summaries };
}
