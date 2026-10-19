import { setTimeout as delay } from "node:timers/promises";
import { decodeHTML } from "entities";
import { guardedFetch, type GuardedFetchOptions, type GuardedResponse } from "@aihot/backend/lib/http-fetch";
import { GEO_TRANSLATION_VERSION, geoTranslationIssues, geoTranslationPrefix, normalizeGeoTranslation } from "@aihot/industry/translation";
import type { PublicTranslator, TranslationInput, TranslationOutput } from "./translate-public.ts";

const origin = "https://www.bing.com";
const pageUrl = `${origin}/translator`;
const blockedDelay = 15 * 60_000;
type ErrorKind = "blocked" | "unavailable" | "invalid";

/** Content failures carry no service retry-after and cannot cool down unrelated queue items. */
export class BingContentTranslationError extends Error {
  readonly kind = "invalid";
  constructor() { super("bing_content_invalid"); }
}

export class BingTranslationError extends Error {
  readonly status: number | undefined;
  readonly retryAfterMs: number;
  readonly kind: ErrorKind;
  constructor(kind: ErrorKind = "unavailable", status?: number, retryAfterMs = kind === "blocked" ? blockedDelay : 60_000) {
    super(`bing_${kind}`); this.kind = kind; this.status = status;
    this.retryAfterMs = Math.max(kind === "blocked" ? blockedDelay : 60_000, retryAfterMs);
  }
}

/** Preserve every source character, preferring sentence boundaries within the ordinary form limit. */
export function splitBingText(text: string): string[] {
  const parts: string[] = [];
  while (text.length > 1000) {
    const head = text.slice(0, 1000);
    let end = 0;
    for (const match of head.matchAll(/\r?\n|[.!?]\s+|[。！？]/gu)) end = match.index + match[0].length;
    if (end === 0) end = head.lastIndexOf(" ") + 1;
    if (end < 1) end = 1000;
    if (/[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
    parts.push(text.slice(0, end)); text = text.slice(end);
  }
  if (text) parts.push(text);
  return parts;
}

interface BingOptions {
  fetch?: (url: string, options: GuardedFetchOptions) => Promise<GuardedResponse>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}
interface FormSession { key: string; token: string; ig: string; iid: string; expiresAt: number }

/** The normal public translator form. It never retries a refused request or changes egress identity. */
export class BingPublicTranslator {
  private readonly stop = new AbortController();
  private readonly signal: AbortSignal;
  private readonly fetcher: NonNullable<BingOptions["fetch"]>;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private session: FormSession | null = null;
  private previousRequestAt = -Infinity;
  private cooldownUntil = 0;
  private sequence: Promise<unknown> = Promise.resolve();
  private readonly cache = new Map<string, string>();

  constructor(signal?: AbortSignal, options: BingOptions = {}) {
    this.signal = signal ? AbortSignal.any([signal, this.stop.signal]) : this.stop.signal;
    this.fetcher = options.fetch ?? guardedFetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? (milliseconds => delay(milliseconds, undefined, { signal: this.signal }));
  }

  private fail(kind: ErrorKind, status?: number, retryAfter?: string | null): never {
    const seconds = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter.trim()) ? Number(retryAfter) * 1000 : NaN;
    const date = retryAfter ? Date.parse(retryAfter) - this.now() : NaN;
    const requested = Number.isFinite(seconds) ? seconds : Number.isFinite(date) ? date : 0;
    const error = new BingTranslationError(kind, status, requested);
    this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + error.retryAfterMs);
    if (kind === "blocked") this.session = null;
    throw error;
  }

  private async request(url: string, options: GuardedFetchOptions): Promise<GuardedResponse> {
    if (this.signal.aborted) throw new BingTranslationError();
    if (this.cooldownUntil > this.now()) throw new BingTranslationError("unavailable", undefined, this.cooldownUntil - this.now());
    try {
      const wait = this.previousRequestAt + 1000 - this.now();
      if (wait > 0) await this.sleep(wait);
      if (this.signal.aborted) throw new BingTranslationError();
      this.previousRequestAt = this.now();
      const response = await this.fetcher(url, { ...options, maxRedirects: 0, redirectPolicy: "same-origin", timeoutMs: 20_000 });
      if (this.signal.aborted) throw new BingTranslationError();
      if (response.url !== url) this.fail("blocked");
      if ([401, 403, 429].includes(response.status)) this.fail("blocked", response.status, response.headers.get("retry-after"));
      if (response.status !== 200) this.fail(response.status >= 300 && response.status < 400 ? "blocked" : "unavailable", response.status, response.headers.get("retry-after"));
      return response;
    } catch (error) {
      if (error instanceof BingTranslationError) throw error;
      return this.fail("unavailable");
    }
  }

  private async form(): Promise<FormSession> {
    if (this.session && this.session.expiresAt > this.now()) return this.session;
    const response = await this.request(pageUrl, { maxBytes: 1_500_000 });
    const html = response.text();
    if (/<title>[^<]*(?:access denied|verify|captcha)|<input[^>]+type=["']password["']|id=["']b_captcha["']/iu.test(html)) this.fail("blocked");
    const ig = /IG:"([^"\r\n]+)"/u.exec(html)?.[1];
    const iid = /data-iid="([^"\r\n]+)"/u.exec(html)?.[1];
    const encoded = /params_AbusePreventionHelper\s*=\s*(\[[^\]\r\n]+\])/u.exec(html)?.[1];
    let fields: unknown;
    try { fields = encoded ? JSON.parse(encoded) : null; } catch { this.fail("invalid"); }
    if (!ig || ig.length > 100 || !iid || iid.length > 100 || !Array.isArray(fields) || fields.length < 3) this.fail("invalid");
    const [key, token, lifetime] = fields;
    if (!Number.isSafeInteger(key) || key <= 0 || typeof token !== "string" || !token || token.length > 5000 || !Number.isFinite(lifetime) || lifetime <= 0) this.fail("invalid");
    const expiresAt = Math.min(key + lifetime - 5000, this.now() + 60 * 60_000);
    if (expiresAt <= this.now()) this.fail("invalid");
    return this.session = { key: String(key), token, ig, iid, expiresAt };
  }

  private async segment(text: string): Promise<string> {
    const cached = this.cache.get(text);
    if (cached !== undefined) return cached;
    const session = await this.form();
    const url = new URL("/ttranslatev3", origin);
    url.search = new URLSearchParams({ isVertical: "1", IG: session.ig, IID: session.iid }).toString();
    const response = await this.request(url.toString(), {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", referer: pageUrl }, maxBytes: 80_000,
      body: new URLSearchParams({ fromLang: "auto-detect", to: "zh-Hans", text, token: session.token, key: session.key }).toString(),
    });
    const raw = response.text();
    if (/^\s*</u.test(raw)) {
      if (/captcha|access denied|verify|sign.?in|login/iu.test(raw)) this.fail("blocked", response.status, response.headers.get("retry-after"));
      this.fail("invalid");
    }
    let data: unknown;
    try { data = JSON.parse(raw); } catch { this.fail("invalid"); }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const failure = data as Record<string, unknown>;
      const status = Number(failure.StatusCode ?? failure.statusCode);
      if (failure.ShowCaptcha || [401, 403, 429].includes(status)) this.fail("blocked", Number.isFinite(status) ? status : undefined, response.headers.get("retry-after"));
      this.fail("invalid");
    }
    if (!Array.isArray(data) || data.length !== 1 || !Array.isArray(data[0]?.translations) || data[0].translations.length !== 1) this.fail("invalid");
    const translated = data[0].translations[0];
    if (translated.to !== "zh-Hans" || typeof translated.text !== "string" || !translated.text.trim() || translated.text.length > 20_000 || /<\/?(?:html|body|script|iframe)(?:\s|>)/iu.test(translated.text)) this.fail("invalid");
    const result = translated.text.trim();
    if (this.cache.size >= 512) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(text, result);
    return result;
  }

  private async text(value: string): Promise<string> {
    value = decodeHTML(value);
    if (!value.trim()) return value;
    const prefix = geoTranslationPrefix(value);
    const parts = splitBingText(value.slice(prefix.length));
    const translated: string[] = [];
    for (const part of parts) if (part.trim()) translated.push(await this.segment(part.trim()));
    return prefix + translated.join("\n");
  }

  translate: PublicTranslator = input => {
    const task = this.sequence.then(() => this.item(input));
    this.sequence = task.catch(() => {});
    return task;
  };

  private async item(input: TranslationInput): Promise<TranslationOutput> {
    if (this.signal.aborted) throw new BingTranslationError();
    if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 20_000 || (input.summary !== null && (typeof input.summary !== "string" || input.summary.length > 20_000))) throw new BingTranslationError("invalid");
    const title = await this.text(input.title);
    const summary = input.summary === null ? null : input.summary === input.title ? title : await this.text(input.summary);
    const translated = normalizeGeoTranslation(input, { title, summary, provider: GEO_TRANSLATION_VERSION });
    // A bad sentence is local to this item, not a service outage or an IP rate limit.
    if (geoTranslationIssues(input, translated).includes("invented-year")) throw new BingContentTranslationError();
    return translated;
  }

  dispose(): void { this.stop.abort(); this.session = null; this.cache.clear(); }
}
