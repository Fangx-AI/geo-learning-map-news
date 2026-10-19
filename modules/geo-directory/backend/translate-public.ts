import { createHash, randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { decodeHTML } from "entities";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "@aihot/backend/db";
import { geoContentKindSql } from "../../../packages/backend/src/publication/geo-public.ts";
import { geoReadingRankSql } from "../../../packages/backend/src/publication/geo-quality.ts";
import { acquireCollectorLock } from "./collector-runtime.ts";
import { geoTranslationGlossary, normalizeGeoTranslation, geoTranslationIssues } from "../../../industry/translation.ts";

export interface TranslationInput { id: string; title: string; summary: string | null; language: string }
export interface TranslationOutput { title: string; summary: string | null; provider: string }
export type PublicTranslator = (input: TranslationInput) => Promise<TranslationOutput>;
export class PublicTranslationError extends Error {
  readonly kind: "unavailable" | "unsupported" | "invalid";
  readonly retryAfterMs?: number;
  constructor(kind: "unavailable" | "unsupported" | "invalid", retryAfterMs?: number) { super(kind); this.kind = kind; this.retryAfterMs = retryAfterMs; }
}
export const translationHash = (input: TranslationInput) => createHash("sha256").update(JSON.stringify(["geo-zh-v1", input.language, input.title, input.summary])).digest("hex");

export function translationPercentages(text: string): number[] {
  return [...text.normalize("NFKC").replace(/百分之\s*([+-]?\d+(?:[.,]\d+)?)/g, "$1%").matchAll(/([+-]?\d+(?:[.,]\d+)*)\s*[%％]/g)].map(match => {
    let value = match[1];
    if (value.includes(",") && value.includes(".")) value = value.lastIndexOf(",") > value.lastIndexOf(".") ? value.replaceAll(".", "").replace(",", ".") : value.replaceAll(",", "");
    else if (value.includes(",")) value = /,\d{3}(?:,|$)/.test(value) ? value.replaceAll(",", "") : value.replace(",", ".");
    return Number(value);
  }).sort((a, b) => a-b);
}

/** Optional dedicated translation model. The Node worker owns the server process and its lifetime. */
export class LocalPublicTranslator {
  private child: ChildProcess | null = null;
  private signal: AbortSignal;
  private stop = new AbortController();
  private address = "";
  private key = randomBytes(24).toString("hex");
  private cache = new Map<string, string>();
  private parentSignal?: AbortSignal;
  constructor(signal?: AbortSignal) {
    this.parentSignal = signal;
    this.signal = signal ? AbortSignal.any([signal, this.stop.signal]) : this.stop.signal;
    signal?.addEventListener("abort", this.close, { once: true });
  }
  private async start(): Promise<void> {
    const root = path.resolve(import.meta.dirname, "../../..");
    const binary = path.join(root, ".data/translation/runtime", process.platform === "win32" ? "llama-server.exe" : "llama-server");
    const model = path.join(root, ".data/translation/models/model.gguf");
    if (!existsSync(binary) || !existsSync(model)) throw new PublicTranslationError("unavailable");
    const port = await new Promise<number>((resolve, reject) => {
      const socket = createServer(); socket.once("error", reject);
      socket.listen(0, "127.0.0.1", () => { const address = socket.address(); socket.close(error => error ? reject(error) : resolve(typeof address === "object" && address ? address.port : 0)); });
    });
    this.address = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(root, "modules/geo-directory/scripts/translation-server.ts"), binary, "--model", model, "--host", "127.0.0.1", "--port", String(port), "--ctx-size", "4096", "--threads", "4", "--threads-batch", "4", "--parallel", "1", "--n-gpu-layers", "0", "--api-key", this.key, "--no-webui", "--jinja"], {
      cwd: root, windowsHide: true, stdio: ["pipe", "ignore", "pipe"],
    });
    this.child = child;
    child.stderr?.resume();
    const failed = () => { if (this.child === child) this.child = null; };
    child.once("error", failed); child.once("exit", failed);
    const deadline = Date.now() + 90_000;
    while (this.child === child && Date.now() < deadline && !this.signal.aborted) {
      try {
        const response = await fetch(this.address + "/health", { headers: { authorization: `Bearer ${this.key}` }, signal: AbortSignal.any([this.signal, AbortSignal.timeout(2000)]), redirect: "error" });
        if (response.ok && (await response.json() as { status?: string }).status === "ok") return;
      } catch { /* The child may still be loading its local model. */ }
      await delay(500, undefined, { signal: this.signal });
    }
    this.close(); throw new PublicTranslationError("unavailable");
  }
  private async requestText(original: string): Promise<string> {
    const text = decodeHTML(original).trim();
    const cached = this.cache.get(text);
    if (cached) return cached;
    const percentages = translationPercentages(text);
    const terms = geoTranslationGlossary(text).map(term => [text.match(term.source)![0], term.chinese]);
    terms.push(["traffic", "流量"], ["store", "商店"], ["Universal Cart", "Universal Cart"]);
    const glossary = terms.filter(([original]) => text.toLowerCase().includes(original.toLowerCase()))
      .map(([original, translated]) => `${original} 翻译成 ${translated}`);
    // The model's documented plain-text prompt works better than JSON grammar:
    // real JSON trials mixed title/summary fields and emitted wrapper fragments.
    const prompt = (glossary.length ? `参考下面的翻译：\n${glossary.join("\n")}\n\n` : "")
      + "将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释：\n\n";
    const response = await fetch(this.address + "/v1/chat/completions", {
      method: "POST", redirect: "error", signal: AbortSignal.any([this.signal, AbortSignal.timeout(120_000)]),
      headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ messages: [{ role: "user", content: prompt + text }], temperature: 0.7, top_p: 0.6, top_k: 20, repeat_penalty: 1.05, seed: 7,
        max_tokens: Math.min(2048, Math.max(700, Math.ceil(text.length * 1.5))) }),
    });
    if (!response.ok) throw new PublicTranslationError("unavailable");
    const result = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }> };
    const choice = result.choices?.[0];
    if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string" || !choice.message.content.trim()) throw new PublicTranslationError("invalid");
    const translated = choice.message.content.trim();
    if (translated.length > 20_000 || translated.startsWith("```") || /^\{\s*"translation"\s*:/.test(translated)
      || /"\s*\}\s*$/.test(translated) && !/"\s*\}\s*$/.test(text)) throw new PublicTranslationError("invalid");
    if (JSON.stringify(translationPercentages(translated)) !== JSON.stringify(percentages)) throw new PublicTranslationError("invalid");
    if (this.cache.size >= 512) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(text, translated);
    return translated;
  }
  translate: PublicTranslator = async input => {
    if (this.signal.aborted) throw new PublicTranslationError("unavailable");
    if (!this.child) await this.start();
    try { return normalizeGeoTranslation(input, { title: await this.requestText(input.title), summary: input.summary?.trim() ? await this.requestText(input.summary) : null, provider: "hunyuan-mt2-local" }); }
    catch (error) { if (error instanceof PublicTranslationError) throw error; throw new PublicTranslationError("unavailable"); }
  };
  close = (): void => {
    this.stop.abort(); const child = this.child; this.child = null; child?.stdin?.end();
  };
  dispose(): void { this.parentSignal?.removeEventListener("abort", this.close); this.close(); }
}

export async function createPublicTranslator(signal?: AbortSignal): Promise<{ translate: PublicTranslator; dispose(): void }> {
  if (process.env.PUBLIC_TRANSLATION_PROVIDER === "local") return new LocalPublicTranslator(signal);
  const { BingPublicTranslator } = await import("./translation-bing.ts");
  return new BingPublicTranslator(signal);
}

export interface PublicTranslationResult { attempted: number; translated: number; reused: number; failed: number; stale: number }
interface QueueRow extends TranslationInput { attempts: number }
const providerName = () => process.env.PUBLIC_TRANSLATION_PROVIDER === "local" ? "local" : "bing";
async function deferTranslation(error: unknown): Promise<number> {
  const requested = error && typeof error === "object" && "retryAfterMs" in error ? Number(error.retryAfterMs) : 60_000;
  const retryMs = Number.isFinite(requested) ? Math.max(60_000, requested) : 60_000;
  await sql`INSERT INTO geo_public_translation_runtime (provider,retry_after,last_error) VALUES (${providerName()},${new Date(Date.now()+retryMs)},'provider-unavailable')
    ON CONFLICT (provider) DO UPDATE SET retry_after=greatest(geo_public_translation_runtime.retry_after,EXCLUDED.retry_after),last_error=EXCLUDED.last_error,updated_at=now()`;
  return retryMs;
}

/** Call under the translation lease. Text revisions, retries and duplicate reuse survive restarts. */
export async function translatePublicBatch(options: { translate: PublicTranslator; limit?: number; signal?: AbortSignal }): Promise<PublicTranslationResult> {
  const [cooldown] = await sql<{ retry_after: Date }[]>`SELECT retry_after FROM geo_public_translation_runtime WHERE provider=${providerName()} AND retry_after>now()`;
  if (cooldown) throw new PublicTranslationError("unavailable", cooldown.retry_after.getTime()-Date.now());
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 10)));
  const rows = await sql<QueueRow[]>`WITH candidates AS (
    SELECT i.id, i.title, i.summary, i.language, i.url, i.published_at, i.collected_at, ${geoContentKindSql} AS content_kind,
      CASE WHEN (t.title_original,t.summary_original,t.language_original) IS NOT DISTINCT FROM (i.title,i.summary,i.language) THEN t.attempts ELSE 0 END AS attempts
    FROM geo_public_items i JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
    LEFT JOIN geo_public_translations t ON t.item_id=i.id
    WHERE i.language NOT IN ('zh','zh-CN','zh-TW') AND (
      t.item_id IS NULL OR (t.title_original,t.summary_original,t.language_original) IS DISTINCT FROM (i.title,i.summary,i.language)
      OR (t.status='done' AND (nullif(btrim(t.title_zh),'') IS NULL OR (nullif(btrim(i.summary),'') IS NOT NULL AND nullif(btrim(t.summary_zh),'') IS NULL)))
      OR (t.status='error' AND t.next_attempt_at<=now()))
  ) SELECT i.id,i.title,i.summary,i.language,coalesce(i.attempts,0)::int AS attempts FROM candidates i
    ORDER BY (coalesce(i.published_at,i.collected_at) >= now()-interval '48 hours') DESC,
      ${geoReadingRankSql}, coalesce(i.published_at,i.collected_at) DESC, i.id LIMIT ${limit}`;
  const result: PublicTranslationResult = { attempted: 0, translated: 0, reused: 0, failed: 0, stale: 0 };
  for (const item of rows) {
    if (options.signal?.aborted) break;
    const hash = translationHash(item);
    const [cached] = await sql<{ title: string; summary: string | null; provider: string }[]>`SELECT title_zh AS title,summary_zh AS summary,provider FROM geo_public_translations
      WHERE content_hash=${hash} AND status='done' AND title_original=${item.title} AND summary_original IS NOT DISTINCT FROM ${item.summary} AND language_original=${item.language}
        AND nullif(btrim(title_zh),'') IS NOT NULL AND (nullif(btrim(summary_original),'') IS NULL OR nullif(btrim(summary_zh),'') IS NOT NULL) LIMIT 1`;
    let translated: TranslationOutput | null = cached ?? null;
    let error: PublicTranslationError | null = null;
    try {
      if (!translated) { result.attempted++; translated = await options.translate(item); }
      if (!translated.title?.trim() || (item.summary?.trim() && !translated.summary?.trim()) || !/[\p{Script=Han}]/u.test(translated.title + (translated.summary ?? ""))) throw new PublicTranslationError("invalid");
      if (geoTranslationIssues(item,translated).length) throw new PublicTranslationError("invalid");
      for (const field of ["title","summary"] as const) {
        const expected=translationPercentages(decodeHTML(item[field] ?? ""));
        const actual=translationPercentages(translated[field] ?? "");
        for (const value of expected) {
          const index=actual.indexOf(value);
          if (index<0) throw new PublicTranslationError("invalid");
          actual.splice(index,1);
        }
      }
    } catch (cause) {
      translated = null;
      error = cause instanceof PublicTranslationError ? cause : new PublicTranslationError("invalid");
      if (options.signal?.aborted) throw cause;
      if (error.kind === "unavailable" || cause && typeof cause === "object" && "retryAfterMs" in cause && Number.isFinite(cause.retryAfterMs)) { await deferTranslation(cause); throw cause; }
    }
    const attempts = item.attempts + (cached ? 0 : 1);
    const retryHours = error?.kind === "unsupported" ? 168 : Math.min(24, 2 ** Math.min(attempts - 1, 5));
    const saved = await sql`INSERT INTO geo_public_translations
      (item_id,content_hash,title_original,summary_original,language_original,title_zh,summary_zh,status,provider,attempts,next_attempt_at,last_error,updated_at)
      SELECT i.id,${hash},${item.title},${item.summary},${item.language},${translated?.title ?? null},${translated?.summary ?? null},${error ? "error" : "done"},${translated?.provider ?? process.env.PUBLIC_TRANSLATION_PROVIDER ?? "bing"},${attempts},now()+${retryHours}*interval '1 hour',${error?.kind ?? null},now()
      FROM geo_public_items i WHERE i.id=${item.id} AND i.title=${item.title} AND i.summary IS NOT DISTINCT FROM ${item.summary} AND i.language=${item.language}
      ON CONFLICT (item_id) DO UPDATE SET content_hash=EXCLUDED.content_hash,title_original=EXCLUDED.title_original,summary_original=EXCLUDED.summary_original,language_original=EXCLUDED.language_original,
        title_zh=EXCLUDED.title_zh,summary_zh=EXCLUDED.summary_zh,status=EXCLUDED.status,provider=EXCLUDED.provider,attempts=EXCLUDED.attempts,next_attempt_at=EXCLUDED.next_attempt_at,last_error=EXCLUDED.last_error,updated_at=now()
      RETURNING item_id`;
    if (!saved.length) result.stale++;
    else if (error) result.failed++;
    else if (cached) result.reused++;
    else result.translated++;
  }
  return result;
}

/** Independently drains the backlog while the source collector fetches or waits. */
export async function watchPublicTranslations(signal: AbortSignal, log: (message: string) => void = console.log): Promise<void> {
  if (process.env.PUBLIC_TRANSLATION_ENABLED !== "true") return;
  while (!signal.aborted) {
    let release: (() => Promise<void>) | null = null;
    const stop = new AbortController();
    const combined = AbortSignal.any([signal, stop.signal]);
    const provider = await createPublicTranslator(combined);
    try {
      release = await acquireCollectorLock("translation", () => stop.abort());
      const [cooldown] = await sql<{ retry_after: Date }[]>`SELECT retry_after FROM geo_public_translation_runtime WHERE provider=${providerName()}`;
      if (cooldown && cooldown.retry_after.getTime() > Date.now()) await delay(cooldown.retry_after.getTime() - Date.now(), undefined, { signal: combined });
      while (!combined.aborted) {
        const result = await translatePublicBatch({ translate: provider.translate, signal: combined });
        if (result.attempted || result.reused) log(`中文翻译：完成 ${result.translated}，复用 ${result.reused}，暂缓 ${result.failed}。`);
        await delay(result.attempted || result.reused ? 1000 : 60_000, undefined, { signal: combined });
      }
    } catch (error) {
      if (!signal.aborted) {
        const retryMs = await deferTranslation(error).catch(() => 60_000);
        log(`翻译暂不可用，${Math.ceil(retryMs/60_000)} 分钟后重试；采集继续。`);
      }
    }
    finally { provider.dispose(); await release?.().catch(() => {}); }
    if (!signal.aborted) await delay(60_000, undefined, { signal }).catch(() => {});
  }
}
