// Wide recall for public GEO material. These are inclusion signals, not an assessment of truth/quality.
const DIRECT: Array<[string, RegExp]> = [
  ["GEO", /generative\s+(?:engine|search)\s+optimi[sz]ation|生成式?(?:引擎|搜索|搜尋)(?:优化|優化)|\bGEO\b.{0,30}\b(?:SEO|AEO)\b|\bSEO\b.{0,30}\bGEO\b/i],
  ["AEO / LLMO", /answer\s+engine\s+optimi[sz]ation|\bLLMO\b|\bAEO\b.{0,30}\b(?:SEO|GEO)\b|\bSEO\b.{0,30}\bAEO\b|答案引擎(?:优化|優化)|大模型(?:优化|優化)/i],
  ["AI search", /\bAI[- ]?(?:search|overviews?|mode)\b|\bgenerative\s+search\b|\b(?:ChatGPT|Gemini|Copilot)\s+search\b|\bSearchGPT\b|(?:AI|人工智能)(?:搜索|搜尋|検索)|生成AI検索|生成式(?:搜索|搜尋)/i],
  ["AI visibility", /\b(?:AI|LLM)\s+(?:visibility|discoverability|citations?)\b|(?:AI|大模型)(?:可见性|可見性|可見度|引用)|llms\.txt|OAI-SearchBot|PerplexityBot|Google-Extended/i],
  ["AI summaries in Google results", /(?=[\s\S]*\bAI summar(?:y|ies)\b)(?=[\s\S]*\bGoogle\b)(?=[\s\S]*\b(?:results?|clicks?|clicked|clicking)\b)/i],
  ["日本語 GEO", /生成(?:AI|エンジン)(?:検索|最適化)|AI検索最適化/],
  ["한국어 GEO", /(?:AI|생성형)\s*검색|생성형\s*엔진\s*최적화/],
  ["Español / Português GEO", /(?:motores|mecanismos)\s+(?:de\s+(?:búsqueda|busca)\s+)?generativos|(?:optimización|otimização)\s+generativa|búsqueda\s+con\s+IA|busca\s+com\s+IA/i],
  ["Français GEO", /moteurs\s+(?:de\s+recherche\s+)?génératifs|recherche\s+générative|visibilité\s+IA/i],
  ["Deutsch GEO", /KI[- ]?(?:Suche|Sichtbarkeit)|generative[nr]?\s+Suchmaschinen/i],
  ["Italiano / Nederlands GEO", /motori\s+generativi|ricerca\s+generativa|generatieve\s+zoekmachines|AI[- ]?zoekmachines/i],
  ["العربية GEO", /محركات البحث التوليدية|تحسين محركات الذكاء الاصطناعي/],
  ["हिन्दी / Türkçe / Русский GEO", /एआई खोज|जनरेटिव सर्च|üretken arama|yapay zeka arama|генеративный поиск/i],
];
const AI = /\b(?:AI|LLM|LLMs|ChatGPT|Perplexity|Gemini|Copilot|Claude|DeepSeek|Kimi|Qwen)\b|large\s+language\s+model|生成式|人工智能|豆包|千问|文心|元宝|智谱/i;
const DISCOVERY = /\b(?:SEO|GEO|AEO|search|searches|cite|cites|cited|citing|citation|citations|visibility|discoverability|crawler|crawling|indexing|robots|publisher|publishers|referral|referrals|ranking|rankings|traffic)\b|抓取|索引|推荐|推薦|引用|排名|流量|可见性|可見度|爬虫|品牌|搜索|搜尋|検索|검색/i;

export function matchGeoTerms(text: string): string[] {
  const content = text.slice(0, 20_000).normalize("NFKC");
  const terms = DIRECT.filter(([, pattern]) => pattern.test(content)).map(([term]) => term);
  if (AI.test(content) && (DISCOVERY.test(content) || /\b(?:query[- ]?fan[- ]?out|fan[- ]?out\s+quer(?:y|ies))\b|查询(?:扩展|扇出)/i.test(content))) terms.push("AI + search / discovery");
  return terms;
}

/** Prefer script evidence, otherwise the directory's source language; unknown stays unknown. */
export function inferLanguage(text: string, hint?: string | null): string {
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/[\u0900-\u097f]/.test(text)) return "hi";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (hint && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(hint) && !["und", "multi"].includes(hint)) return hint.toLowerCase().split("-")[0];
  return "und";
}
