import directory from "../../industry/source-directory.json" with { type: "json" };

export interface GeoSource {
  id: string;
  name: string;
  url: string;
  description: string;
  language: string;
  region: string;
  type: string;
  topics: string[];
  access: string;
  feedUrl?: string;
  sourceId?: string;
  evidence: string;
  checkedAt: string;
  collectionStatus?: string;
}

export const sources: readonly GeoSource[] = directory.sources;
export const languageNames: Record<string, string> = {
  zh: "中文", en: "英语", de: "德语", fr: "法语", es: "西班牙语",
  ja: "日语", ko: "韩语", pt: "葡萄牙语", it: "意大利语", multi: "多语言", und: "语言未识别", ar: "阿拉伯语", hi: "印地语", ru: "俄语", nl: "荷兰语", tr: "土耳其语",
};
export const evidenceNames: Record<string, string> = {
  official: "官方一手", research: "研究资料", editorial: "编辑与作者",
  vendor: "厂商自述", community: "社区讨论",
};

export function collectionLabel(source: GeoSource): string {
  if (source.collectionStatus === "requires_api") return "需配置 API";
  if (source.collectionStatus === "requires_login") return "部分内容需登录";
  if (source.sourceId) return "已接采集";
  if (source.feedUrl) return "可订阅 RSS";
  return "访问原站";
}

export function filterSources(list: readonly GeoSource[], params: URLSearchParams): GeoSource[] {
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  return list.filter((source) => {
    for (const key of ["language", "region", "type"] as const) {
      const value = params.get(key);
      if (value && source[key] !== value) return false;
    }
    if (params.get("access") === "rss" && !source.feedUrl) return false;
    if (params.get("access") === "configured" && (!source.sourceId || source.collectionStatus === "requires_api")) return false;
    if (params.get("access") === "social" && source.evidence !== "community" && source.access !== "community") return false;
    const haystack = [source.name, source.url, source.description, ...source.topics,
      languageNames[source.language] ?? source.language, source.region, source.type].join(" ").toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);

export function sourcesOpml(list: readonly GeoSource[]): string {
  const feeds = [...new Map(list.filter((source) => source.feedUrl).map((source) => [source.feedUrl, source])).values()];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>GEO 学习地图 · 全球订阅源</title></head><body>\n${feeds.map((source) => `  <outline type="rss" text="${escapeXml(source.name)}" title="${escapeXml(source.name)}" xmlUrl="${escapeXml(source.feedUrl!)}" htmlUrl="${escapeXml(source.url)}"/>`).join("\n")}\n</body></opml>\n`;
}
