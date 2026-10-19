// Imports metadata obtained from permitted APIs/exports. No platform scraping or social posting.
// Dry-run is the default; --send calls only the site's existing ingestion endpoint.
import { readFile, stat } from "node:fs/promises";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const PLATFORMS = ["x", "reddit", "youtube", "linkedin", "bluesky", "mastodon", "wechat", "zhihu", "xiaohongshu", "weibo", "bilibili", "douyin", "juejin", "csdn", "v2ex"] as const;
export type Platform = typeof PLATFORMS[number];
const LABELS: Record<Platform, string> = { x: "X", reddit: "Reddit", youtube: "YouTube", linkedin: "LinkedIn", bluesky: "Bluesky", mastodon: "Mastodon", wechat: "微信公众号", zhihu: "知乎", xiaohongshu: "小红书", weibo: "微博", bilibili: "哔哩哔哩", douyin: "抖音", juejin: "掘金", csdn: "CSDN", v2ex: "V2EX" };
const HOSTS: Record<Exclude<Platform, "mastodon">, string[]> = {
  x: ["x.com", "twitter.com"], reddit: ["reddit.com"], youtube: ["youtube.com", "youtu.be"],
  linkedin: ["linkedin.com"], bluesky: ["bsky.app"], wechat: ["mp.weixin.qq.com"],
  zhihu: ["zhihu.com"], xiaohongshu: ["xiaohongshu.com", "rednote.com"],
  weibo: ["weibo.com", "weibo.cn"], bilibili: ["bilibili.com"], douyin: ["douyin.com"],
  juejin: ["juejin.cn"], csdn: ["csdn.net"], v2ex: ["v2ex.com"],
};
const FIELDS = new Set(["platform", "title", "url", "publishedAt", "author", "sourceId", "sourceName", "language", "externalId", "backfill"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_RECORDS = 5000;

export interface IngestItem {
  title: string;
  url: string;
  publishedAt: string | null;
  author?: string;
  raw: { _geo: { platform: Platform; language?: string; externalId?: string }; _aihot?: { backfill: true } };
}
export interface IngestBatch { sourceId: string; sourceName: string; items: IngestItem[] }
export interface ImportPlan { batches: IngestBatch[]; received: number; accepted: number; duplicates: number; unknownDates: number }

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function textField(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw new Error(`${field} 必须是 1–${max} 个字符的文本`);
  }
  return value.trim();
}

/** Unknown dates stay unknown; never replace a publication date with the collection time. */
export function publicationDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("publishedAt 必须是带时区的 ISO 时间，未知日期请显式填 null");
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) throw new Error("publishedAt 必须包含日期、时分秒和 Z 或 ±HH:mm 时区");
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const time = Date.parse(value);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(time)) {
    throw new Error("publishedAt 不是有效的日历时间");
  }
  return new Date(time).toISOString();
}

/** Require a canonical content URL, not a profile, search page, credential or short-link redirect. */
export function originalUrl(value: unknown, platform: Platform): string {
  const raw = textField(value, "url", 4096);
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("url 必须是完整 HTTPS 原文网址"); }
  if (u.protocol !== "https:" || u.username || u.password || u.port || isIP(u.hostname) || !u.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal)$/.test(u.hostname)) {
    throw new Error("url 必须是不带凭据的公开 HTTPS 原文网址");
  }
  if (platform !== "mastodon" && !HOSTS[platform].some(host => u.hostname === host || u.hostname.endsWith(`.${host}`))) {
    throw new Error("url 域名与 platform 不匹配");
  }
  if ([...u.searchParams.keys()].some(key => /(?:token|secret|password|cookie|session|authorization|api[_-]?key)/i.test(key))) {
    throw new Error("url 含认证或会话参数；请提供不含凭据的原文永久链接");
  }
  const p = u.pathname;
  const contentPath: Record<Platform, boolean> = {
    x: /^\/(?:[^/]+\/status|i\/web\/status|i\/article)\/\d+\/?$/.test(p),
    reddit: /\/(?:comments)\/[a-z0-9]+(?:\/|$)/i.test(p),
    youtube: u.hostname === "youtu.be" ? /^\/[A-Za-z0-9_-]{11}\/?$/.test(p) : p === "/watch" && /^[A-Za-z0-9_-]{11}$/.test(u.searchParams.get("v") ?? "") || /^\/(?:shorts|live)\/[A-Za-z0-9_-]{11}\/?$/.test(p),
    linkedin: /^\/(?:posts|pulse|feed\/update)\/[^/]+/.test(p),
    bluesky: /^\/profile\/[^/]+\/post\/[^/]+\/?$/.test(p),
    mastodon: /^\/@[^/]+\/\d+\/?$/.test(p) || /^\/users\/[^/]+\/statuses\/\d+\/?$/.test(p),
    wechat: /^\/s\/[^/]+\/?$/.test(p) || p === "/s" && u.searchParams.has("__biz") && u.searchParams.has("mid"),
    zhihu: /^\/p\/\d+\/?$/.test(p) || /^\/question\/\d+\/answer\/\d+\/?$/.test(p),
    xiaohongshu: /^\/(?:explore|discovery\/item)\/[a-z0-9]+\/?$/i.test(p),
    weibo: /^\/\d+\/[a-z0-9]{5,}\/?$/i.test(p) || /^\/(?:detail|status)\/[a-z0-9]+\/?$/i.test(p) || p === "/ttarticle/p/show" && u.searchParams.has("id"),
    bilibili: /^\/(?:video\/(?:BV[A-Za-z0-9]+|av\d+)|read\/cv\d+|opus\/\d+)\/?$/.test(p),
    douyin: /^\/(?:video|note)\/\d+\/?$/.test(p),
    juejin: /^\/post\/\d+\/?$/.test(p),
    csdn: /^\/[^/]+\/article\/details\/\d+\/?$/.test(p),
    v2ex: /^\/t\/\d+\/?$/.test(p),
  };
  if (!contentPath[platform]) throw new Error("url 必须指向原始帖子、文章或视频，不能是搜索/账号页或短链");
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) if (/^utm_/i.test(key) || ["s", "t", "si", "feature", "share_source"].includes(key)) u.searchParams.delete(key);
  return u.href;
}

export function parseInput(input: string, format: "json" | "jsonl"): unknown[] {
  const text = input.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("输入文件为空");
  if (format === "jsonl") return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line) as unknown]; } catch { throw new Error(`第 ${index + 1} 行不是有效 JSON`); }
  });
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("输入不是有效 JSON"); }
  if (Array.isArray(value)) return value;
  if (object(value) && Array.isArray(value.items) && Object.keys(value).every(k => ["schemaVersion", "items"].includes(k)) && (value.schemaVersion === undefined || value.schemaVersion === 1)) return value.items;
  throw new Error("JSON 须为条目数组，或 { schemaVersion: 1, items: [...] }");
}

/** Validate the entire input before sending anything, deduplicate, then respect the API's 50-item cap. */
export function prepareImport(records: unknown[], backfill = false): ImportPlan {
  if (!records.length || records.length > MAX_RECORDS) throw new Error(`每个文件须有 1–${MAX_RECORDS} 条记录`);
  const groups = new Map<string, IngestBatch & { platform: Platform }>();
  const seen = new Set<string>();
  let duplicates = 0, unknownDates = 0;
  for (const [index, record] of records.entries()) {
    try {
      if (!object(record) || Object.keys(record).some(k => !FIELDS.has(k))) throw new Error("条目须为对象且只包含文档列出的字段");
      if (!(PLATFORMS as readonly unknown[]).includes(record.platform)) throw new Error(`platform 须为 ${PLATFORMS.join(" / ")}`);
      const platform = record.platform as Platform;
      const title = textField(record.title, "title", 500);
      const url = originalUrl(record.url, platform);
      const publishedAt = publicationDate(record.publishedAt);
      const sourceId = record.sourceId === undefined ? `geo-social-${platform}` : textField(record.sourceId, "sourceId", 80);
      if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sourceId)) throw new Error("sourceId 须为 3–80 位小写字母、数字或连字符");
      const sourceName = record.sourceName === undefined ? `${LABELS[platform]}：GEO 外部导入` : textField(record.sourceName, "sourceName", 200);
      const item: IngestItem = { title, url, publishedAt, raw: { _geo: { platform } } };
      if (record.author !== undefined) item.author = textField(record.author, "author", 200);
      if (record.externalId !== undefined) item.raw._geo.externalId = textField(record.externalId, "externalId", 200);
      if (record.language !== undefined) {
        const language = textField(record.language, "language", 35);
        if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) throw new Error("language 须为 zh-CN / en / ja 等语言标签");
        item.raw._geo.language = language;
      }
      if (record.backfill !== undefined && typeof record.backfill !== "boolean") throw new Error("backfill 须为布尔值");
      if (backfill || record.backfill === true) item.raw._aihot = { backfill: true };
      const existing = groups.get(sourceId);
      if (existing && (existing.platform !== platform || existing.sourceName !== sourceName)) throw new Error("同一 sourceId 的 platform 与 sourceName 必须一致");
      if (seen.has(url)) { duplicates += 1; continue; }
      seen.add(url);
      if (publishedAt === null) unknownDates += 1;
      if (existing) existing.items.push(item);
      else groups.set(sourceId, { sourceId, sourceName, platform, items: [item] });
    } catch (error) {
      throw new Error(`第 ${index + 1} 条：${error instanceof Error ? error.message : "校验失败"}`);
    }
  }
  const batches: IngestBatch[] = [];
  for (const { sourceId, sourceName, items } of groups.values()) {
    for (let i = 0; i < items.length; i += 50) batches.push({ sourceId, sourceName, items: items.slice(i, i + 50) });
  }
  return { batches, received: records.length, accepted: seen.size, duplicates, unknownDates };
}

export function ingestEndpoint(base: string): string {
  let u: URL;
  try { u = new URL(base); } catch { throw new Error("api-base 须为站点 API 的完整根地址"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.username || u.password || u.search || u.hash || u.pathname !== "/" || (u.protocol !== "https:" && !(u.protocol === "http:" && loopback))) {
    throw new Error("api-base 须为无路径和凭据的 HTTPS 根地址；仅本机地址允许 HTTP");
  }
  return new URL("/api/ingest/items", u).href;
}

export async function sendImport(plan: ImportPlan, options: { base: string; token: string; fetcher?: typeof fetch; wait?: (ms: number) => Promise<unknown>; onBatch?: (sent: number, total: number, created: number) => void }): Promise<number> {
  const endpoint = ingestEndpoint(options.base);
  if (options.token.length < 16 || /\s/.test(options.token) || /^(?:changeme|change-me|placeholder|xxx+|todo|test|dev|your[-_]?token.*)$/i.test(options.token)) throw new Error("请通过环境变量 INGEST_TOKEN 配置至少 16 位的有效令牌");
  const fetcher = options.fetcher ?? fetch;
  let created = 0;
  for (const [index, batch] of plan.batches.entries()) {
    if (index) await (options.wait ?? delay)(6100);
    let response: Response;
    try {
      response = await fetcher(endpoint, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", authorization: `Bearer ${options.token}` }, body: JSON.stringify(batch), signal: AbortSignal.timeout(30_000) });
    } catch { throw new Error(`第 ${index + 1} 批网络请求失败；已完成 ${index} 批。可检查服务后重跑，后端按 URL 判重。`); }
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const retryHint = retry && /^\d{1,6}$/.test(retry) ? `；请至少等待 ${retry} 秒` : "";
      throw new Error(`第 ${index + 1} 批返回 HTTP ${response.status}，已停止且未自动重试${retryHint}。已完成 ${index} 批。`);
    }
    let result: unknown;
    try { result = await response.json(); } catch { throw new Error(`第 ${index + 1} 批响应不是 JSON；结果未知，重跑前检查后台`); }
    if (!object(result) || result.ok !== true || !Number.isInteger(result.created) || Number(result.created) < 0 || Number(result.created) > batch.items.length) throw new Error(`第 ${index + 1} 批响应不符合 ingest API 格式；结果未知，重跑前检查后台`);
    created += Number(result.created);
    options.onBatch?.(index + 1, plan.batches.length, Number(result.created));
  }
  return created;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  let file = "", format: "json" | "jsonl" | undefined, base = process.env.GEO_INGEST_API_BASE ?? "http://127.0.0.1:3001";
  let send = false, dryRun = false, backfill = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help") {
      console.log("node modules/geo-directory/scripts/social-ingest.ts --file <json|jsonl> [--format json|jsonl] [--backfill] [--dry-run | --send] [--api-base http://127.0.0.1:3001]\n默认只校验，不发请求。--send 从环境变量读取 INGEST_TOKEN。详见 docs/geo-social.md。");
      return;
    }
    if (arg === "--send") send = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--backfill") backfill = true;
    else if (["--file", "--format", "--api-base"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} 缺少值`);
      if (arg === "--file") file = value;
      else if (arg === "--api-base") base = value;
      else if (value === "json" || value === "jsonl") format = value;
      else throw new Error("format 仅支持 json 或 jsonl");
    } else throw new Error("存在不支持的参数；使用 --help 查看用法");
  }
  if (send && dryRun) throw new Error("--send 与 --dry-run 不能同时使用");
  if (!file) throw new Error("必须通过 --file 指定输入文件");
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error("输入须为不超过 10 MiB 的本地文件");
  ingestEndpoint(base);
  const input = await readFile(file, "utf8");
  const plan = prepareImport(parseInput(input, format ?? (/\.jsonl$/i.test(file) ? "jsonl" : "json")), backfill);
  console.log(`${send ? "待导入" : "DRY RUN"}：${plan.received} 条输入，${plan.accepted} 条有效，${plan.duplicates} 条重复，${plan.batches.length} 批；${plan.unknownDates} 条日期未知（后端不会直接公开）。`);
  if (!send) return;
  const created = await sendImport(plan, { base, token: process.env.INGEST_TOKEN ?? "", onBatch: (n, total, added) => console.log(`已完成 ${n}/${total} 批，新增 ${added} 条。`) });
  console.log(`导入完成：新增 ${created} 条。新建 external 信源默认隔离；需在后台确认参与方式及处理状态。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Input payloads, response bodies and authorization headers are never printed.
    console.error(error instanceof Error ? error.message : "导入失败");
    process.exitCode = 1;
  });
}
