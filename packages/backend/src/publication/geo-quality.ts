import { PUBLIC_READING_POLICY as policy } from "@aihot/industry/public-reading";
import { PUBLISHER_DOMAINS } from "@aihot/industry/taxonomy";
import { sql } from "../db.ts";

export type ReadingTier = "priority" | "standard" | "deprioritized";
export interface ReadingPriority { tier: ReadingTier; label: string; reasons: string[]; limitations: string[]; policyVersion: number }
export interface ReadingInput { title: string; summary: string | null; url: string; contentKind?: string; publishedAt?: string | null }
export const READING_POLICY_VERSION = policy.version;
const regex = Object.fromEntries(Object.entries(policy.patterns).map(([key, value]) => [key, new RegExp(value, "i")])) as Record<keyof typeof policy.patterns, RegExp>;
const platformIds = new Set(["google", "microsoft", "openai", "perplexity", "anthropic", "baidu", "doubao", "deepseek", "tencent", "kimi", "qwen", "xai", "meta", "mistral", "brave", "you"]);
const platformDomains = PUBLISHER_DOMAINS.filter(entry => platformIds.has(entry.entityId)).flatMap(entry => [...entry.domains]).map(host => host.replace(/^www\./, ""));
const platformPattern = "Google|Bing|OpenAI|ChatGPT|Perplexity|Gemini|AI Overviews|AI Mode|百度|豆包|DeepSeek|Kimi|千问";
const indirectHosts = ["news.ycombinator.com", "news.google.com", "weixin.sogou.com"];
/** A same-tier group tie-break, not an assertion of originality or a global social penalty. */
export function groupLinkPreference(item: ReadingInput): number {
  let host = ""; try { host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return 1; }
  const text = `${item.title}\n${item.summary ?? ""}`.replace(new RegExp(policy.ignoredEvidence, "gi"), " ");
  return item.contentKind === "social" || item.contentKind === "aggregated" || indirectHosts.includes(host) || regex.reprint.test(text) ? 1 : 0;
}
export function readingFacts(item: ReadingInput) {
  const title = item.title.replace(new RegExp(policy.ignoredEvidence, "gi"), " ");
  const text = `${title}\n${item.summary ?? ""}`.replace(new RegExp(policy.ignoredEvidence, "gi"), " ");
  const signals = Object.fromEntries(Object.entries(regex).map(([key, pattern]) => [key, pattern.test(text)])) as Record<keyof typeof regex, boolean>;
  let host = ""; try { host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* Unknown links receive no authority shortcut. */ }
  const aggregated = item.contentKind === "aggregated" || ["news.google.com", "weixin.sogou.com"].includes(host);
  const related = signals.explicit || signals.ai && signals.discovery || signals.aiSummary && signals.google && signals.searchInteraction;
  const promotional = (signals.promotion || signals.listicle && !signals.firstHand) && !signals.critique;
  const official = platformDomains.some(domain => host === domain || host.endsWith(`.${domain}`));
  const platformChange = signals.change && (official || new RegExp(platformPattern, "i").test(title) && !regex.toolIntegration.test(title));
  const research = signals.method && (!signals.attributedStudy || signals.firstHand);
  const rank = !related || aggregated || promotional || signals.compilation || signals.reprint ? 2 : (signals.referenceOnly && !signals.firstHand) ? 1 : research || platformChange ? 0 : 1;
  return { ...signals, related, aggregated, promotional, official, platformChange, rank };
}

export function readingPriority(item: ReadingInput): ReadingPriority {
  const facts = readingFacts(item);
  const tier: ReadingTier = facts.rank === 0 ? "priority" : facts.rank === 1 ? "standard" : "deprioritized";
  const reasons: string[] = [];
  if (!facts.related) reasons.push("标题与短摘要的 GEO 直接关联较弱");
  if (facts.aggregated) reasons.push("聚合索引，优先查阅原始出处");
  if (facts.promotional) reasons.push("含服务推介、选型榜单或转化邀约线索");
  if (facts.compilation) reasons.push("汇总或赞助播报线索");
  if (facts.reprint) reasons.push("明确标注转载来源");
  if (facts.attributedStudy && !facts.firstHand) reasons.push("含引用他人研究的表述，优先追溯原始研究");
  if (facts.referenceOnly && !facts.firstHand) reasons.push("文章推荐或转发线索，优先追溯原始出处");
  if (facts.related && facts.method && !facts.aggregated && !facts.promotional) reasons.push("含与 GEO 直接相关的方法、样本或实测线索");
  if (facts.related && facts.platformChange && !facts.aggregated && !facts.promotional) reasons.push("涉及 AI 搜索平台、抓取或展示变化");
  if (facts.related && facts.official) reasons.push("平台官方域名");
  if (facts.firstHand && facts.method && !facts.aggregated) reasons.push("含作者自行测试或采集的表述");
  if (facts.critique && facts.related) reasons.push("保留批评、失败实验与反例讨论");
  if (!reasons.length) reasons.push("GEO 相关资料，按时间继续阅读");
  return { tier, label: policy.labels[tier], reasons: reasons.slice(0, 4), limitations: [policy.limitations, ...(!item.summary ? ["摘要缺失，可判断的信息有限。"] : []), ...(!item.publishedAt ? ["发布日期未知，排序使用首次收录时间。"] : [])], policyVersion: policy.version };
}

// One pattern table powers both the full-database order and the displayed explanations.
// All regexes are fixed policy values bound as SQL parameters, never user-authored SQL.
const textSql = sql`regexp_replace((i.title || E'\n' || coalesce(i.summary, '')), ${policy.ignoredEvidence}, ' ', 'gi')`;
const titleSql = sql`regexp_replace(i.title, ${policy.ignoredEvidence}, ' ', 'gi')`;
const matches = (key: keyof typeof policy.patterns) => sql`${textSql} ~* ${policy.patterns[key]}`;
const hostSql = sql`regexp_replace(lower(split_part(split_part(i.url, '/', 3), ':', 1)), '^www[.]', '')`;
const officialSql = sql`EXISTS (SELECT 1 FROM unnest(${platformDomains}::text[]) domain WHERE ${hostSql} = domain OR right(${hostSql}, length(domain) + 1) = '.' || domain)`;
export const geoGroupLinkPreferenceSql = sql`CASE WHEN i.content_kind IN ('social','aggregated') OR ${hostSql} = ANY(${indirectHosts}::text[]) OR ${matches("reprint")} THEN 1 ELSE 0 END`;
const relatedSql = sql`(${matches("explicit")} OR (${matches("ai")} AND ${matches("discovery")}) OR (${matches("aiSummary")} AND ${matches("google")} AND ${matches("searchInteraction")}))`;
const platformChangeSql = sql`(${matches("change")} AND (${officialSql} OR (${titleSql} ~* ${platformPattern} AND NOT ${titleSql} ~* ${policy.patterns.toolIntegration})))`;
export const geoReadingRankSql = sql`CASE
  WHEN NOT ${relatedSql} OR i.content_kind = 'aggregated' OR ${hostSql} IN ('news.google.com', 'weixin.sogou.com') OR ((${matches("promotion")} OR (${matches("listicle")} AND NOT ${matches("firstHand")})) AND NOT ${matches("critique")}) OR ${matches("compilation")} OR ${matches("reprint")} THEN 2
  WHEN ${matches("referenceOnly")} AND NOT ${matches("firstHand")} THEN 1
  WHEN (${matches("method")} AND (NOT ${matches("attributedStudy")} OR ${matches("firstHand")})) OR ${platformChangeSql} THEN 0
  ELSE 1 END`;
