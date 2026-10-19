/** Increment when cached Chinese needs a source-aware terminology repair. */
export const GEO_TRANSLATION_VERSION = "bing-geo-v4";

export interface GeoTranslationText { title: string; summary: string | null }
export interface GeoTranslationTerm {
  id: string;
  source: RegExp;
  chinese: string;
  mistranslations: readonly string[];
  context?: RegExp;
  exclude?: RegExp;
  translationExclude?: RegExp;
  reference: string;
}

const searchContext = /\b(?:SEO|GEO|AI|LLM|ChatGPT|Google|Bing|search|citat\w*|queries|retriev\w*)\b|AI検索|生成AI|AI搜索|搜索引擎/iu;
const geoContext = /\b(?:SEO|AEO|LLMO?|AI|IA|KI|ChatGPT|Perplexity|Gemini|search|marketing|generative)\b|generativeengineoptimization|aisearch|aiseo|AI検索|生成AI|AI搜索|搜索引擎/iu;
const googleAi = "https://developers.google.com/search/docs/appearance/ai-features?hl=zh-cn";
const bingTopics = "https://blogs.bing.com/webmaster/2026/10/introducing-topics-portfolio-beta-in-ai-performance/";
const token = (phrase: string) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${phrase})(?![\\p{L}\\p{N}_])`, "iu");
/** A statistical measure can coexist with the search brand; never rewrite its Chinese name globally. */
export const PERPLEXITY_STATISTICAL_CONTEXT = /\b(?:loss(?:es)?|metrics?|entropy)\b|\bperplexity\s+(?:filter(?:ing)?|ratios?|scores?|measures?|metrics?)\b|损失函数|困惑度指标/iu;

/** Only evidenced mistranslations are repaired. Correct English product names are also valid. */
export const GEO_TRANSLATION_TERMS: readonly GeoTranslationTerm[] = [
  { id: "generative-engine-optimization", source: token("generative engine optimi[sz]ation"), chinese: "生成式引擎优化", mistranslations: ["生成性引擎优化", "生成引擎优化", "基因引擎优化"], reference: "https://arxiv.org/abs/2311.09735" },
  { id: "geo", source: token("GEO"), chinese: "GEO", mistranslations: ["地理信息", "地理位置", "地理"], context: geoContext, exclude: /geograph|geospatial|geolocat|\blocations?\b|地理/iu, reference: "https://arxiv.org/abs/2311.09735" },
  { id: "ai-overviews", source: token("AI Overviews?|Aperçus IA"), chinese: "AI 概览", mistranslations: ["AI 概述", "AI概述", "AI 预览", "AI预览"], reference: googleAi },
  { id: "ai-mode", source: token("AI Mode"), chinese: "AI 模式", mistranslations: ["人工智能模式"], reference: googleAi },
  { id: "query-fan-out", source: token("query fan[- ]out"), chinese: "查询扇出", mistranslations: ["查询分发", "查询扩散"], reference: googleAi },
  { id: "fan-out-queries", source: token("fan[- ]out quer(?:y|ies)"), chinese: "扇出查询", mistranslations: ["扩散查询", "分发查询", "扩展查询"], reference: googleAi },
  { id: "grounding-queries", source: token("grounding quer(?:y|ies)"), chinese: "用于检索依据的查询", mistranslations: ["基础查询", "接地查询", "奠基查询"], context: searchContext, reference: bingTopics },
  { id: "gemini", source: token("Gemini"), chinese: "Gemini", mistranslations: ["双子座"], context: searchContext, exclude: /zodiac|astrolog|constellation|星座/iu, reference: "https://ai.google.dev/gemini-api/docs/google-search?hl=zh-cn" },
  { id: "perplexity", source: token("Perplexity"), chinese: "Perplexity", mistranslations: ["困惑度", "困惑性"], context: searchContext, exclude: PERPLEXITY_STATISTICAL_CONTEXT, reference: "https://docs.perplexity.ai/" },
  { id: "topics-portfolio", source: token("Topics Portfolio"), chinese: "Topics Portfolio", mistranslations: ["主题投资组合", "主题组合"], reference: bingTopics },
  { id: "ai-performance", source: token("AI Performance"), chinese: "AI Performance", mistranslations: ["AI 性能", "AI性能", "人工智能性能"], context: /Topics Portfolio|Bing Webmaster Tools|AI Performance (?:report|dashboard)/iu, reference: bingTopics },
  { id: "sites-cited", source: token("Sites Cited"), chinese: "被引用网站数", mistranslations: ["引用该主题的网站", "引用的网站"], context: /Topics Portfolio|Topic Size/iu, reference: bingTopics },
  { id: "organic-search", source: token("organic search"), chinese: "自然搜索", mistranslations: ["天然搜索", "有机搜索"], reference: "https://support.google.com/analytics/answer/9756891?hl=zh-Hans" },
  { id: "manual-action", source: token("manual actions?"), chinese: "人工处置措施", mistranslations: ["人工操作", "手动操作"], context: searchContext, reference: "https://support.google.com/webmasters/answer/9044175?hl=zh-Hans" },
  { id: "google-spam-update", source: token("spam updates?"), chinese: "垃圾内容更新", mistranslations: ["垃圾邮件更新"], context: /\bGoogle\b|Search Console|AI Overviews/iu, exclude: /\b(?:e-?mail|inbox|smtp|Gmail)\b/iu, reference: "https://developers.google.com/search/blog/2023/10/october-2023-spam-update" },
  { id: "google-spam-policy", source: token("spam polic(?:y|ies)"), chinese: "垃圾内容政策", mistranslations: ["垃圾邮件政策"], context: /Google Search|Google 搜索|Search Console/iu, exclude: /\b(?:e-?mail|inbox|smtp|Gmail)\b/iu, reference: "https://developers.google.com/search/docs/essentials/spam-policies?hl=zh-cn" },
  { id: "agentic-system", source: token("agentic (?:AI )?systems?"), chinese: "智能体系统", mistranslations: ["代理系统"], context: /\b(?:LLMs?|GEO|generative|AI|autonomous\w*)\b/iu, exclude: /\b(?:proxy|principal-agent|psychology)\b/iu, translationExclude: /智能代理系统|委托代理系统/u, reference: "https://arxiv.org/abs/2608.29063" },
  { id: "agentic-character", source: token("agentic"), chinese: "智能体特性", mistranslations: ["代理特性"], context: /\b(?:LLMs?|GEO|generative|AI|autonomous\w*)\b/iu, exclude: /\b(?:proxy|principal-agent|psychology)\b/iu, translationExclude: /智能代理特性/u, reference: "https://arxiv.org/abs/2608.29063" },
  { id: "google-discover", source: token("Google Discover"), chinese: "Google 探索", mistranslations: ["Google 发现", "Google发现", "谷歌发现", "谷歌 发现"], reference: "https://developers.google.com/search/docs/appearance/google-discover?hl=zh-cn" },
  { id: "discover-change", source: token("Discover (?:to )?chang(?:e|es|ing)"), chinese: "Discover变化", mistranslations: ["发现变化"], context: /\bGoogle\b/iu, reference: "https://developers.google.com/search/docs/appearance/google-discover?hl=zh-cn" },
  { id: "ai-visibility", source: token("AI visibility"), chinese: "AI 可见性", mistranslations: ["AI 能见度", "AI能见度", "人工智能能见度"], reference: "https://arxiv.org/abs/2311.09735" },
];

// URLs, code, handles, existing product names and numbers must never be edited by a term repair.
const protectedText = /https?:\/\/[^\s<>"“”]+|`[^`\n]+`|@[\p{L}\p{N}_.-]+|(?<![\p{L}\p{N}_])(?:GEO|SEO|Gemini|Perplexity|Topics Portfolio|AI Performance|AI Mode|AI Overviews?|Google Discover)(?![\p{L}\p{N}_])|[+-]?\d[\d,.]*(?:\s*[%％])?/giu;
const sourceWithoutUrls = (text: string) => text.replace(/https?:\/\/[^\s<>"“”]+|`[^`\n]+`/giu, " ");

/** The same source-conditioned glossary can be used in a local model prompt. */
export function geoTranslationGlossary(source: string, context = source): GeoTranslationTerm[] {
  const clean = sourceWithoutUrls(source), cleanContext = sourceWithoutUrls(context);
  return GEO_TRANSLATION_TERMS.filter(term => term.source.test(clean) && (!term.context || term.context.test(cleanContext)) && (!term.exclude || !term.exclude.test(cleanContext)));
}

function normalizeField(source: string, translated: string, context: string): string {
  const terms = geoTranslationGlossary(source, context);
  if (!terms.length) return translated;
  const protectedParts: string[] = [];
  let result = translated.replace(protectedText, text => { protectedParts.push(text); return `\uE000${String.fromCodePoint(0xF0000 + protectedParts.length - 1)}\uE001`; });
  for (const term of terms) {
    if (term.translationExclude?.test(translated)) continue;
    // GEO can also occur beside actual geography. Do not reinterpret a word if all original
    // acronym occurrences are already present in the translation, or the mapping is ambiguous.
    const sourceCount = [...sourceWithoutUrls(source).matchAll(new RegExp(term.source.source, "giu"))].length;
    if (term.id === "geo" && [...translated.matchAll(/(?<![\p{L}\p{N}_])GEO(?![\p{L}\p{N}_])/gu)].length >= sourceCount) continue;
    if (term.id === "geo" && /地理(?:学|空间|分析|技术)/u.test(result)) continue;
    const escaped = term.mistranslations.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const matches = [...result.matchAll(new RegExp(escaped, "gu"))];
    if (matches.length > sourceCount) continue;
    result = result.replace(new RegExp(escaped, "gu"), term.chinese);
  }
  return result.replace(/\uE000([\u{F0000}-\u{FFFFD}])\uE001/gu, (_, value: string) => protectedParts[value.codePointAt(0)! - 0xF0000]);
}

/** Pure, idempotent cache repair. Unmatched text and a null summary are byte-for-byte unchanged. */
export function normalizeGeoTranslation<T extends GeoTranslationText>(input: GeoTranslationText, output: T): T {
  const context = `${input.title}\n${input.summary ?? ""}`;
  return { ...output, title: normalizeField(input.title, output.title, context), summary: output.summary === null || input.summary === null ? output.summary : normalizeField(input.summary, output.summary, context) };
}

/** Only a label, or an explicit social handle/community label, is outside the prose. */
export function geoTranslationPrefix(text: string): string {
  return /^(?:帖文节选[｜|](?:(?:@[A-Za-z0-9_.-]{1,100}|r\/[A-Za-z0-9_]{1,80})[：:]\s*)?)/u.exec(text)?.[0] ?? "";
}

export type GeoTranslationIssue = "untranslated-prefix" | "invented-year";
export function geoTranslationIssues(input: GeoTranslationText, output: GeoTranslationText): GeoTranslationIssue[] {
  const issues = new Set<GeoTranslationIssue>();
  for (const field of ["title", "summary"] as const) {
    const source = input[field], translated = output[field];
    if (!source || !translated) continue;
    const legacyPrefix = /^帖文节选[｜|]([^\r\n：:]{1,100})[：:]\s*/u.exec(source);
    if (legacyPrefix && geoTranslationPrefix(source).length < legacyPrefix[0].length
      && (legacyPrefix[1].match(/[A-Za-z]{2,}/g)?.length ?? 0) >= 2
      && /[A-Za-z]{2,}/u.test(legacyPrefix[1].replace(/\b(?:GEO|SEO|AI|Mode|Overviews|Google|Search|Console|Bing|Perplexity|ChatGPT|Gemini)\b/giu, ""))
      && translated.startsWith(legacyPrefix[0])) issues.add("untranslated-prefix");
    const originalYears = new Set(sourceWithoutUrls(source).match(/(?<![\d.])(?:19|20)\d{2}(?!\d|[.,]\d)/g) ?? []);
    for (const year of sourceWithoutUrls(translated).matchAll(/(?<![\d.])((?:19|20)\d{2})\s*年/g)) {
      if (!originalYears.has(year[1])) issues.add("invented-year");
    }
  }
  return [...issues];
}

/** Terms are repaired locally; only faults that need a new translation request return true. */
export function needsTranslationUpgrade(input: GeoTranslationText, output: GeoTranslationText): boolean {
  return geoTranslationIssues(input, output).length > 0;
}
