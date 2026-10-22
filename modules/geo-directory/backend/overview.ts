import { CATEGORIES, IDENTITY_LEXICON } from "@aihot/industry/taxonomy";
import topicPack from "../../../industry/topics.json" with { type: "json" };
import type { GeoPublicItem } from "@aihot/backend/publication/geo-public";
import type { GeoOverviewInput } from "@aihot/backend/publication/geo-overview";
import type { GeoOverviewItem, GeoOverviewResponse } from "../types.ts";
import { readingFacts, readingPriority, groupLinkPreference } from "@aihot/backend/publication/geo-quality";
import { publicGroupKey } from "./public-grouping.ts";

type Topic = { slug: string; name: string; group: string; definition: string; entityId?: string; aliases?: string[] };
const topics: Topic[] = topicPack.topics;
const categoryPatterns: Record<string, RegExp> = {
  "platform-updates": /launch|rollout|roll.out|introduc|update|announc|policy|AI Overviews|AI Mode|平台|上线|发布|推出|更新|政策|検索機能|검색 기능/i,
  "crawling-indexing": /crawl|index|robots\.txt|llms\.txt|sitemap|schema|JSON-LD|rendering|抓取|爬虫|索引|收录|结构化|站点地图|クロール|크롤링/i,
  "content-optimization": /optimi[sz]|content|entity|entities|authority|E-E-A-T|knowledge graph|优化|優化|内容|实体|权威|最適化|최적화/i,
  "measurement-research": /research|study|studies|experiment|benchmark|dataset|measurement|statistics|citation|visibility|traffic|分析|研究|论文|实验|測定|调查|数据|引用|可见|流量|实测|측정/i,
  "case-studies": /case stud|case report|lessons learned|what we learned|our results|案例|复盘|实践记录|実例|事例|사례/i,
  tools: /tool|dashboard|monitor|tracking|open.source|github|plugin|integration|API\b|工具|监测|开源|插件|ツール|도구/i,
};
const topicPatterns: Record<string, RegExp> = {
  "geo-foundations": /\bGEO\b|\bAEO\b|generative (?:engine|search) optimi[sz]ation|answer engine optimi[sz]ation|生成式?(?:引擎|搜索)优化|答案引擎/i,
  "ai-search": /AI[- ]?(?:search|overviews?|mode)|ChatGPT Search|SearchGPT|AI搜索|AI 搜索|人工智能搜索|生成式搜索|AI検索|KI.Suche|búsqueda con IA/i,
  citations: /citation|cited|cites|citing|引用|被引/i, "brand-mentions": /brand|mention|品牌|提及|推荐/i,
  crawlers: /crawl|bot\b|抓取|爬虫|クロール/i, indexing: /index|sitemap|rendering|索引|收录|站点地图/i,
  robots: /robots\.txt/i, "llms-txt": /llms\.txt/i, "structured-data": /schema|JSON-LD|structured data|结构化数据/i,
  "content-quality": /content quality|helpful content|original content|内容质量|优质内容|原创内容/i,
  entities: /entit(?:y|ies)|knowledge graph|实体|知识图谱/i, trust: /E-E-A-T|authority|authoritative|trust|权威|信任/i,
  retrieval: /\bRAG\b|retrieval|rerank|检索|重排|查询扩展/i,
  visibility: /visibility|discoverability|可见|可見|可视|监测/i,
  attribution: /traffic|referral|attribution|click|conversion|流量|归因|点击|转化|零点击/i,
  experiments: /experiment|control group|replicat|实验|对照|复现/i,
  "failed-experiments": /negative result|doesn.t work|failed|failure|no effect|失败|无效|负结果|没有效果/i,
  "local-search": /local search|local SEO|local GEO|本地搜索|本地商家|本地 GEO|地图/i,
  commerce: /commerce|shopping|product feed|merchant|购物|电商|商品|商家/i,
  multilingual: /multilingual|international|language|global|多语言|多语种|全球|小语种/i,
  rights: /copyright|licensing|license|publisher polic|版权|授权|许可/i,
  "spam-safety": /spam|prompt injection|poisoning|misinformation|垃圾|注入|污染|虚假信息/i,
  "open-data": /open data|dataset|开放数据|数据集/i, "open-tools": /open.source|github|开源/i,
  communities: /reddit|bluesky|mastodon|community|forum|公众号|知乎|小红书|微博|论坛|社区|帖文节选/i,
  "platform-news": categoryPatterns["platform-updates"], "tool-releases": categoryPatterns.tools,
  papers: /paper|research|study|studies|arxiv|论文|研究|学术/i,
  benchmarks: /benchmark|evaluat|comparison|评测|基准|对比/i,
  tutorials: /guide|tutorial|how to|checklist|step.by.step|指南|教程|如何|方法|清单|入门/i,
  "case-studies": categoryPatterns["case-studies"], opinions: /opinion|perspective|analysis|think|观点|分析|看法|争议/i,
  trends: /trend|growth|decline|percent|趋势|增长|下降|变化/i,
  industry: /partner|acquisit|funding|invest|合作|收购|融资|投资/i,
  policy: /policy|guideline|terms|regulat|政策|规则|监管|条款/i,
};
const timestamp = (item: GeoPublicItem) => Date.parse(item.publishedAt ?? item.collectedAt);
const byDate = (a: GeoPublicItem, b: GeoPublicItem) => timestamp(b) - timestamp(a) || b.id.localeCompare(a.id);
export function archiveDay(item: GeoPublicItem): string { return new Date(timestamp(item) + 8 * 3600_000).toISOString().slice(0, 10); }
export function validOverviewDay(day: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day; }
function domain(item: GeoPublicItem): string { try { return new URL(item.url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return "unknown"; } }

export function classifyGeoItem(item: GeoPublicItem): GeoOverviewItem {
  const text = `${item.title}\n${item.summary ?? ""}`.normalize("NFKC");
  const categoryKeys = CATEGORIES.filter(category => categoryPatterns[category.key]?.test(text)).map(category => category.key);
  const topicSlugs = topics.filter(topic => topic.entityId
    ? IDENTITY_LEXICON.find(entity => entity.id === topic.entityId)?.patterns.some(pattern => pattern.test(text))
    : topicPatterns[topic.slug]?.test(text)).map(topic => topic.slug);
  const priority = readingPriority(item);
  return { ...item, readingPriority: priority, categoryKeys, topicSlugs, selectionReasons: priority.reasons, dateBasis: item.publishedAt ? "published" : "collected" };
}

export function buildGeoOverview(input: GeoOverviewInput, now = Date.now(), selectedTopicSlug?: string): GeoOverviewResponse {
  const items = input.items.map(classifyGeoItem).sort(byDate);
  const fresh = (hours: number) => items.filter(item => item.publishedAt && timestamp(item) <= now && timestamp(item) >= now - hours * 3600_000);
  const last48h = fresh(48), last7d = fresh(168);
  const kind = last48h.length >= 8 ? "48h" : last7d.length >= 8 ? "7d" : "recent";
  const windowItems = kind === "48h" ? last48h : kind === "7d" ? last7d : [...items].sort((a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt) || b.id.localeCompare(a.id)).slice(0, 200);
  const window: GeoOverviewResponse["window"] = { kind, label: kind === "48h" ? "近 48 小时发布" : kind === "7d" ? "近 7 天发布（48 小时内资料不足 8 条）" : "最近收录资料（含历史内容，最多 200 条）", from: kind === "recent" ? windowItems.at(-1)?.collectedAt ?? null : new Date(now - (kind === "48h" ? 48 : 168) * 3600_000).toISOString(), to: new Date(now).toISOString(), basis: kind === "recent" ? "collectedAt" : "publishedAt", itemCount: windowItems.length };
  const rankById = new Map(windowItems.map(item => [item.id, readingFacts(item).rank]));
  const linkPreferenceById = new Map(windowItems.map(item => [item.id, groupLinkPreference(item)]));
  const rankedAll = [...windowItems].sort((a, b) => rankById.get(a.id)! - rankById.get(b.id)! || linkPreferenceById.get(a.id)! - linkPreferenceById.get(b.id)! || byDate(a, b));
  const seenGroups = new Set<string>();
  const ranked = rankedAll.filter(item => {
    const key = publicGroupKey({ canonicalId: item.id, title: item.title, url: item.url, language: item.language, publishedAt: item.publishedAt ? new Date(item.publishedAt) : null });
    if (seenGroups.has(key)) return false;
    seenGroups.add(key); return true;
  }).sort((a, b) => rankById.get(a.id)! - rankById.get(b.id)! || byDate(a, b));
  const selected = new Set<string>(), perDomain = new Map<string, number>();
  const highlights: GeoOverviewItem[] = [];
  // The deprioritized tier (weakly related, promotion, rankings, reposts) never fills the front page.
  for (const rank of [0, 1]) {
    const tier = ranked.filter(item => rankById.get(item.id) === rank);
    for (const item of tier) { if (highlights.length === 20) break; const host = domain(item); if ((perDomain.get(host) ?? 0) >= 2) continue; highlights.push(item); selected.add(item.id); perDomain.set(host, (perDomain.get(host) ?? 0) + 1); }
    for (const item of tier) { if (highlights.length === 20) break; if (!selected.has(item.id)) { highlights.push(item); selected.add(item.id); } }
  }
  const collections = CATEGORIES.map(category => { const group = items.filter(item => item.categoryKeys.includes(category.key)); return { key: category.key, name: category.label, count: group.length, items: group.slice(0, 8) }; });
  const useful = items.filter(item => !item.readingPriority?.folded);
  const topicGroups = topics.map(topic => { const group = useful.filter(item => item.topicSlugs.includes(topic.slug)); return { slug: topic.slug, name: topic.name, group: topic.group, description: topic.definition, count: group.length, items: group.slice(0, 6) }; }).filter(topic => topic.count > 0).sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  const hotClusters = topics.map(topic => {
    const group = windowItems.filter(item => !item.readingPriority?.folded && item.topicSlugs.includes(topic.slug)).sort(byDate);
    const sourceDomains = [...new Set(group.map(domain))].sort();
    return { id: `topic-${topic.slug}`, title: topic.name, topicSlug: topic.slug, itemCount: group.length, sourceCount: sourceDomains.length, sourceDomains, items: group.slice(0, 6) };
  }).filter(cluster => cluster.itemCount >= 2).sort((a, b) => b.sourceCount - a.sourceCount || b.itemCount - a.itemCount || a.id.localeCompare(b.id)).slice(0, 15);
  const dailyItems = items.filter(item => archiveDay(item) === input.selectedDay).slice(0, 200);
  const selectedDefinition = topics.find(topic => topic.slug === selectedTopicSlug);
  const selectedMatches = selectedDefinition ? useful.filter(item => item.topicSlugs.includes(selectedDefinition.slug)) : [];
  const selectedTopic = selectedDefinition ? { slug: selectedDefinition.slug, name: selectedDefinition.name, group: selectedDefinition.group, description: selectedDefinition.definition, count: selectedMatches.length, items: selectedMatches.slice(0, 200) } : null;
  return {
    generatedAt: new Date(now).toISOString(), lastCollectedAt: input.lastCollectedAt,
    stats: { total: input.total, analyzedItems: items.length, sourceCount: input.sourceCount, topicCount: topicGroups.length, undatedCount: input.undatedCount, truncated: input.total > items.length },
    window,
    rules: { classification: "按标题与来源摘要中的明确关键词匹配现有分类和专题，可多选；只表示文字提及，不代表事实核验。统计基于最近收录 4,000 条及所选日最多 200 条，单个专题展示最多 200 条。", highlights: "在显示的时间范围内，优先含方法、样本或实测线索的直接相关资料与平台变化；服务推介、聚合转载和泛 AI 线索排后，同层按日期。相似标题同组只取最佳代表，每个原文域名前两条优先，不足 20 条补充。属于规则优选，不是已核验的质量评分或同一事件判断。", hotClusters: "按共同专题聚合，先按原文链接域名数、再按条目数排序。不是同一事件识别，也不是社交热度或独立报道数；新闻聚合域名只算一个域名。", daily: "按北京时间的原发布日期归档；缺少发布日期时按收录日归档，并标明日期待确认。每天最多展示 200 条，标题中的数量为当日实际收录总数。" },
    highlights, collections, topics: topicGroups, selectedTopic, hotClusters, days: input.days, selectedDay: input.selectedDay, dailyTotal: input.dailyTotal, dailyItems,
  };
}
