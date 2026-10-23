import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import * as cheerio from "cheerio";
import { sql } from "@aihot/backend/db";
import { guardedFetch, type GuardedResponse } from "@aihot/backend/lib/http-fetch";
import { normalizeUrl } from "@aihot/backend/lib/url";
import { readable } from "@aihot/backend/content/extract";
import { geoContentKindSql } from "../../../packages/backend/src/publication/geo-public.ts";
import { geoReadingRankSql } from "../../../packages/backend/src/publication/geo-quality.ts";
import { acquireCollectorLock } from "./collector-runtime.ts";
import { readerBriefInputHash, readerBriefSchema, saveReaderBrief } from "./reader-brief.ts";
import { createReaderBriefModel, ReaderBriefModelError, readerBriefReviewPassed, validateReaderBriefReview, type ReaderBriefReview } from "./reader-brief-model.ts";
import { sources } from "../data.ts";

export interface ReaderParagraph { id: string; text: string }
interface DraftClaim { text: string; evidenceIds: string[] }
export interface ReaderBriefDraft {
  conclusion: DraftClaim; findings: DraftClaim[]; geoValue: DraftClaim[]; caveats: DraftClaim[];
  model: string; promptVersion: string; inputTokens: number;
  generationMs?: number; review?: ReaderBriefReview;
}
export interface ReaderBriefGenerator {
  model: string; maxInputChars: number;
  promptVersion?: string;
  generate(input: { title: string; url: string; paragraphs: ReaderParagraph[] }, signal?: AbortSignal): Promise<ReaderBriefDraft>;
  review?(input: { title: string; url: string; paragraphs: ReaderParagraph[] }, draft: ReaderBriefDraft, signal?: AbortSignal): Promise<ReaderBriefReview>;
  repair?(input: { title: string; url: string; paragraphs: ReaderParagraph[] }, draft: ReaderBriefDraft, issues: string[], signal?: AbortSignal): Promise<ReaderBriefDraft>;
  close(): Promise<void>;
}
export type ReaderArticleFetch = (url: string) => Promise<GuardedResponse>;
export class ReaderArticleError extends Error {
  readonly kind: string;
  readonly retryAfterMs?: number;
  constructor(kind: string, retryAfterMs?: number) { super(kind); this.kind = kind; this.retryAfterMs = retryAfterMs; }
}
interface ArticleBody { url: string; text: string; hash: string; paragraphs: ReaderParagraph[] }
interface Candidate {
  id: string; canonical_id: string; title: string; summary: string | null; url: string;
  reviewed_hash: string | null; input_hash: string | null; attempts: number | null; status: string | null;
  private_body: string | null; body_url: string | null; body_hash: string | null;
  paragraphs: ReaderParagraph[] | null; draft: ReaderBriefDraft | null;
}
const HOUR = 60 * 60 * 1000;
const REFRESH_MS = 7 * 24 * HOUR;
// The default zh-CN preference makes sites such as developers.google.com redirect to a
// ?hl=zh-cn translation, which is a different page from the reported article.
const fetchArticle: ReaderArticleFetch = url => guardedFetch(url, { timeoutMs: 20_000, maxBytes: 6 * 1024 * 1024, headers: { accept: "text/html,application/xhtml+xml", "accept-language": "en" } });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const primarySourceIds = sources.filter(source => source.evidence === "official" || source.evidence === "research").flatMap(source => source.sourceId ? [source.sourceId] : []);
function rejectAbstractOnly(url: string): void {
  const source = new URL(url);
  if (/(^|\.)arxiv\.org$/i.test(source.hostname) && source.pathname.startsWith("/abs/")) throw new ReaderArticleError("unsupported-abstract");
}

export function readerRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return;
  const seconds = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function fragmentSection($: cheerio.CheerioAPI, id: string): string {
  const target = $("[id]").filter((_, element) => $(element).attr("id") === id).first();
  if (!target.length) throw new ReaderArticleError("no-article-section");
  const level = /^h([1-6])$/i.exec(target.prop("tagName") ?? "")?.[1];
  if (!level) return $.html(target);
  // A heading's section runs until the next heading of the same or a higher level.
  const parts = [$.html(target)];
  for (let next = target.next(); next.length; next = next.next()) {
    const nextLevel = /^h([1-6])$/i.exec(next.prop("tagName") ?? "")?.[1];
    if (nextLevel && Number(nextLevel) <= Number(level)) break;
    parts.push($.html(next));
  }
  return parts.join("");
}

/** Only the same public HTML article may become model input; never a login/challenge teaser. */
export function extractReaderArticle(url: string, response: GuardedResponse): ArticleBody {
  rejectAbstractOnly(url);
  if (response.status !== 200) throw new ReaderArticleError(`http-${response.status}`, readerRetryAfter(response.headers.get("retry-after")));
  if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get("content-type") ?? "")) throw new ReaderArticleError("not-html");
  if (normalizeUrl(url) !== normalizeUrl(response.url)) throw new ReaderArticleError("different-article");
  const html = response.text();
  const $ = cheerio.load(html);
  const canonical = $('link[rel="canonical"]').first().attr("href");
  if (canonical && normalizeUrl(new URL(canonical, response.url).href) !== normalizeUrl(url)) throw new ReaderArticleError("different-canonical");
  const heading = $("title,h1").text();
  const visible = $("body").text().replace(/\s+/g, " ");
  if (/just a moment|access denied|verify (?:you are|you're) human|checking your browser|security verification|captcha|访问验证|安全验证/i.test(heading)
    || /(?:sign|log) in to (?:continue|read)|subscribe to (?:continue|read)|unlock (?:this|the full) article|订阅后(?:阅读|查看)|登录后(?:阅读|查看)|请完成验证/i.test(visible)
    || /"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(html)
    || $("form input[type=password]").length) throw new ReaderArticleError("restricted-content");
  // A fragment names one entry of a longer page, such as one month of a changelog.
  const fragment = decodeURIComponent(new URL(url).hash.slice(1));
  const article = fragment ? { html: fragmentSection($, fragment) } : readable(html, response.url);
  if (!article) throw new ReaderArticleError("no-article-body");
  // Insert paragraph boundaries without dropping any text from the extracted body, including tables.
  const body = cheerio.load(article.html);
  // Keep a table's headers and rows in one evidence paragraph. textContent alone merges
  // adjacent cells (100 + 200 becomes 100200), silently changing the reported data.
  for (const table of body("table").toArray().reverse()) {
    const rows = body(table).find("tr").toArray().filter(row => body(row).closest("table")[0] === table)
      .map(row => body(row).children("th,td").toArray().map(cell => body(cell).text().replace(/\s+/g, " ").trim()).join(" | "));
    if (rows.length) body(table).replaceWith(body("<p></p>").text(rows.join("\n")));
  }
  body("p,li,h1,h2,h3,h4,h5,h6,blockquote,tr,pre,div,section,article").append("\n\n");
  body("br").replaceWith("\n");
  const paragraphs = body.root().text().split(/\n\s*\n/u).map(text => text.replace(/[^\S\n]+/g, " ").trim()).filter(Boolean)
    .map((text, index) => ({ id: `p${index + 1}`, text }));
  const text = paragraphs.map(paragraph => paragraph.text).join("\n\n");
  if (text.length < 200) throw new ReaderArticleError("no-article-body");
  return { url: response.url, text, hash: hash(text), paragraphs };
}

function validateDraft(value: ReaderBriefDraft, paragraphs: ReaderParagraph[]): ReaderBriefDraft {
  const ids = new Set(paragraphs.map(paragraph => paragraph.id));
  const claims = [value.conclusion, ...value.findings, ...value.geoValue, ...value.caveats];
  if (claims.some(claim => !claim.evidenceIds?.length || claim.evidenceIds.some(id => !ids.has(id)))) throw new ReaderArticleError("invalid-evidence");
  readerBriefSchema.parse({ conclusion: value.conclusion.text, findings: value.findings.map(claim => claim.text), geoValue: value.geoValue.map(claim => claim.text), caveats: value.caveats.map(claim => claim.text), coverage: "full-article" });
  if (!value.model || !value.promptVersion || !Number.isFinite(value.inputTokens) || JSON.stringify(value).length > 100_000) throw new ReaderArticleError("invalid-draft");
  return value;
}

async function nextCandidate(itemId?: string): Promise<Candidate | undefined> {
  // A stable representative makes one canonical URL one private fetch/draft job across feeds.
  const rows = await sql<Candidate[]>`WITH candidates AS (
    SELECT i.id,coalesce(nullif(i.canonical_id,''),i.id) AS canonical_id,i.title,i.summary,i.url,i.collected_at,i.published_at,i.source_id,
      ${geoContentKindSql} AS content_kind
    FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
    WHERE (${itemId ?? null}::text IS NULL OR i.id=${itemId ?? null})
      AND i.url !~* '^https?://(www[.])?arxiv[.]org/abs/'
      AND i.url !~* '^https?://news[.]ycombinator[.]com/item'
  ), ranked AS (
    SELECT i.*,${geoReadingRankSql} AS reading_rank FROM candidates i WHERE i.content_kind='direct'
  ), representatives AS (
    SELECT DISTINCT ON (canonical_id) * FROM ranked WHERE reading_rank<2 ORDER BY canonical_id,collected_at,id
  ) SELECT i.id,i.canonical_id,i.title,i.summary,i.url,b.input_hash AS reviewed_hash,j.input_hash,j.attempts,j.status,
      j.private_body,j.body_url,j.body_hash,j.paragraphs,j.draft
    FROM representatives i LEFT JOIN geo_public_reader_jobs j ON j.canonical_id=i.canonical_id
    LEFT JOIN geo_public_reader_briefs b ON b.item_id=i.id AND b.provenance='reviewed'
    WHERE (j.canonical_id IS NULL OR (j.title_original,j.summary_original,j.url_original) IS DISTINCT FROM (i.title,i.summary,i.url) OR j.next_attempt_at<=now())
      AND NOT EXISTS (SELECT 1 FROM geo_public_reader_jobs blocked WHERE blocked.error='unavailable' AND blocked.next_attempt_at>now())
      AND NOT EXISTS (SELECT 1 FROM geo_public_reader_jobs blocked WHERE blocked.error IN ('http-403','http-429') AND blocked.next_attempt_at>now()
        AND regexp_replace(lower(split_part(blocked.url_original,'/',3)),'^www[.]','')=regexp_replace(lower(split_part(i.url,'/',3)),'^www[.]',''))
    ORDER BY i.reading_rank,(i.source_id=ANY(${primarySourceIds}::text[])) DESC,(coalesce(i.published_at,i.collected_at)>=now()-interval '48 hours') DESC,coalesce(i.published_at,i.collected_at) DESC,i.id`;
  return rows.find(row => row.reviewed_hash !== readerBriefInputHash(row));
}

function retryMs(error: unknown, attempts: number): number {
  const kind = error instanceof ReaderArticleError ? error.kind : error && typeof error === "object" && "kind" in error ? String(error.kind) : "failed";
  const requested = error && typeof error === "object" && "retryAfterMs" in error ? Number(error.retryAfterMs) : 0;
  const base = kind === "http-403" ? 24 * HOUR : /restricted|different-|not-html|no-article|too_long|unsupported-abstract/.test(kind) ? REFRESH_MS : HOUR;
  return Math.max(Number.isFinite(requested) ? requested : 0, Math.min(REFRESH_MS, base * 2 ** Math.min(attempts - 1, 6)));
}

export interface ReaderBriefRunResult { attempted: number; drafted: number; published: number; unchanged: number; failed: number; stale: number }
interface RunOptions {
  limit?: number; itemId?: string; signal?: AbortSignal; watch?: boolean;
  fetcher?: ReaderArticleFetch;
  createModel?: (options: { signal: AbortSignal }) => Promise<ReaderBriefGenerator>;
  onItem?: (id: string, outcome: string) => void;
}

/** Optional automatic publication requires both source checks and a separate semantic verification. */
export async function draftPublicReaderBriefs(options: RunOptions = {}): Promise<ReaderBriefRunResult> {
  const result: ReaderBriefRunResult = { attempted: 0, drafted: 0, published: 0, unchanged: 0, failed: 0, stale: 0 };
  if (process.env.PUBLIC_READER_BRIEFS_ENABLED !== "true") return result;
  const stop = new AbortController();
  const signal = options.signal ? AbortSignal.any([stop.signal, options.signal]) : stop.signal;
  signal.throwIfAborted();
  const release = await acquireCollectorLock("reader-brief", () => stop.abort(new Error("Reader brief lease lost")));
  let model: ReaderBriefGenerator | undefined;
  const limit = Math.max(1, Math.min(20, Math.floor(options.limit ?? 1)));
  try {
    while (!signal.aborted && (options.watch || result.attempted < limit)) {
      const item = await nextCandidate(options.itemId);
      if (!item) {
        await model?.close(); model = undefined;
        if (!options.watch) break;
        await delay(60_000, undefined, { signal }); continue;
      }
      const inputHash = readerBriefInputHash(item);
      const sameInput = item.input_hash === inputHash;
      const attempts = (sameInput ? item.attempts ?? 0 : 0) + 1;
      let article: ArticleBody | undefined;
      let draft: ReaderBriefDraft | undefined;
      let approved = false;
      let error: unknown;
      result.attempted++;
      signal.throwIfAborted();
      await sql`INSERT INTO geo_public_reader_jobs (canonical_id,item_id,input_hash,title_original,summary_original,url_original,status,attempts,next_attempt_at)
        VALUES (${item.canonical_id},${item.id},${inputHash},${item.title},${item.summary},${item.url},'processing',${attempts},${new Date(Date.now()+HOUR)})
        ON CONFLICT (canonical_id) DO UPDATE SET item_id=excluded.item_id,input_hash=excluded.input_hash,title_original=excluded.title_original,
          summary_original=excluded.summary_original,url_original=excluded.url_original,status='processing',attempts=excluded.attempts,
          next_attempt_at=excluded.next_attempt_at,error=NULL,updated_at=now(),
          draft=CASE WHEN geo_public_reader_jobs.input_hash=excluded.input_hash THEN geo_public_reader_jobs.draft END,
          private_body=CASE WHEN geo_public_reader_jobs.input_hash=excluded.input_hash THEN geo_public_reader_jobs.private_body END,
          body_hash=CASE WHEN geo_public_reader_jobs.input_hash=excluded.input_hash THEN geo_public_reader_jobs.body_hash END,
          body_url=CASE WHEN geo_public_reader_jobs.input_hash=excluded.input_hash THEN geo_public_reader_jobs.body_url END,
          paragraphs=CASE WHEN geo_public_reader_jobs.input_hash=excluded.input_hash THEN geo_public_reader_jobs.paragraphs END`;
      try {
        signal.throwIfAborted();
        rejectAbstractOnly(item.url);
        // The factory verifies local assets without starting inference. Missing assets must not
        // cause a stream of article downloads that can never become useful drafts.
        model ??= await (options.createModel ?? createReaderBriefModel)({ signal });
        // A model retry reuses a complete private body; scheduled refreshes always re-read the source.
        article = sameInput && item.status !== "ready-draft" && item.private_body && item.body_url && item.body_hash && item.paragraphs?.length
          ? { url: item.body_url, text: item.private_body, hash: item.body_hash, paragraphs: item.paragraphs }
          : extractReaderArticle(item.url, await (options.fetcher ?? fetchArticle)(item.url));
        signal.throwIfAborted();
        const [stillEnabled] = await sql`SELECT i.id FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
          WHERE i.id=${item.id} AND (i.title,i.summary,i.url) IS NOT DISTINCT FROM (${item.title},${item.summary},${item.url})`;
        if (!stillEnabled) throw new ReaderArticleError("source-changed");
        if (sameInput && item.body_hash === article.hash && item.draft && item.draft.model === model.model
          && (!model.promptVersion || item.draft.promptVersion === model.promptVersion)) {
          draft = validateDraft(item.draft, article.paragraphs); result.unchanged++;
        } else {
          if (article.text.length > model.maxInputChars) throw new ReaderArticleError("too_long");
          options.onItem?.(item.id, "generating");
          draft = validateDraft(await model.generate({ title: item.title, url: item.url, paragraphs: article.paragraphs }, signal), article.paragraphs);
        }
        if (process.env.PUBLIC_READER_BRIEF_PUBLISH_ENABLED === "true") {
          if (!model.review) throw new ReaderArticleError("review-unavailable");
          const input = { title: item.title, url: item.url, paragraphs: article.paragraphs };
          options.onItem?.(item.id, "checking");
          let review = validateReaderBriefReview(await model.review(input, draft, signal), draft);
          draft.review = review;
          if (!readerBriefReviewPassed(review) && model.repair) {
            const issues = [...review.issues, ...review.checks.filter(check => !check.supported).map(check => `${check.id}: ${check.reason}`)];
            if (!review.complete) issues.push("遗漏了主结论、关键数据或重要限定，请据全文补齐。");
            options.onItem?.(item.id, "repairing");
            draft = validateDraft(await model.repair(input, draft, issues, signal), article.paragraphs);
            options.onItem?.(item.id, "rechecking");
            review = validateReaderBriefReview(await model.review(input, draft, signal), draft);
          }
          draft.review = review;
          approved = readerBriefReviewPassed(review);
          if (!approved) error = new ReaderArticleError("review-rejected");
        }
      } catch (cause) {
        if (signal.aborted) throw cause;
        error = cause;
        // Local diagnostic only; never expose model failures or source evidence in the public API.
        if (cause instanceof ReaderBriefModelError) console.warn(`站内概要 ${item.id}: ${cause.kind} · ${cause.message}`);
      }
      signal.throwIfAborted();
      const outcome = await sql.begin(async tx => {
        const [current] = await tx<{ url: string; title: string; summary: string | null }[]>`SELECT i.url,i.title,i.summary FROM geo_public_items i
          JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled WHERE i.id=${item.id} FOR UPDATE OF i FOR SHARE OF s`;
        if (!current || readerBriefInputHash(current) !== inputHash) return "stale";
        const errorKind = error instanceof ReaderArticleError ? error.kind : error && typeof error === "object" && "kind" in error ? String(error.kind).slice(0,80) : "draft-failed";
        await tx`UPDATE geo_public_reader_jobs SET status=${draft ? "ready-draft" : "failed"},body_url=${article?.url ?? null},body_hash=${article?.hash ?? null},
          private_body=${article?.text ?? null},paragraphs=${article ? tx.json(article.paragraphs as never) : null},draft=${draft ? tx.json(draft as never) : null},
          model=${draft?.model ?? model?.model ?? null},prompt_version=${draft?.promptVersion ?? null},error=${error ? errorKind : null},
          attempts=${draft ? 0 : attempts},next_attempt_at=${new Date(Date.now()+(approved ? 5 * 60_000 : draft ? REFRESH_MS : retryMs(error,attempts)))},fetched_at=CASE WHEN ${Boolean(article)} THEN now() ELSE fetched_at END,updated_at=now()
          WHERE canonical_id=${item.canonical_id} AND input_hash=${inputHash}`;
        return draft ? "drafted" : "failed";
      });
      if (outcome === "stale") result.stale++;
      else if (outcome === "drafted") result.drafted++;
      else result.failed++;
      let published = false;
      if (outcome === "drafted" && approved && draft && article && process.env.PUBLIC_READER_BRIEF_PUBLISH_ENABLED === "true") {
        signal.throwIfAborted();
        const saved = await saveReaderBrief({ id: item.id, inputHash, sourceUrl: item.url, bodyHash: article.hash,
          brief: { conclusion: draft.conclusion.text, findings: draft.findings.map(claim => claim.text), geoValue: draft.geoValue.map(claim => claim.text), caveats: draft.caveats.map(claim => claim.text), coverage: "full-article" },
          evidence: { claims: { conclusion: draft.conclusion, findings: draft.findings, geoValue: draft.geoValue, caveats: draft.caveats }, review: draft.review },
          provenance: "local-model", model: draft.model, promptVersion: draft.promptVersion });
        if (saved.saved) { result.published++; published = true; }
        await sql`UPDATE geo_public_reader_jobs SET next_attempt_at=${new Date(Date.now() + REFRESH_MS)} WHERE canonical_id=${item.canonical_id} AND input_hash=${inputHash}`;
      }
      options.onItem?.(item.id, published ? "published" : error && draft ? "review-pending" : outcome);
      // A model call already takes tens of seconds; do not add a full idle minute to every success.
      if (options.watch || result.attempted < limit) await delay(5_000, undefined, { signal });
    }
  } catch (error) { if (!signal.aborted) throw error; }
  finally { stop.abort(); try { await model?.close(); } finally { await release(); } }
  return result;
}

export async function watchPublicReaderBriefs(signal: AbortSignal): Promise<void> {
  if (process.env.PUBLIC_READER_BRIEFS_ENABLED !== "true") return;
  while (!signal.aborted) {
    try { await draftPublicReaderBriefs({ watch: true, signal, onItem: (id, outcome) => console.log(`${new Date().toISOString()} 站内概要：${id} ${outcome}`) }); }
    catch { if (!signal.aborted) console.error("站内概要任务暂不可用，5 分钟后重试。"); }
    if (!signal.aborted) { try { await delay(5 * 60_000, undefined, { signal }); } catch { break; } }
  }
}
