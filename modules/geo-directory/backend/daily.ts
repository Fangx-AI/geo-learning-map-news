import { decodeHTML } from "entities";
import { isSupplementaryResearch } from "@aihot/industry/reader-curation";
import type { loadGeoDailyCandidates } from "@aihot/backend/publication/geo-public";
import { groupLinkPreference, readingFacts } from "@aihot/backend/publication/geo-quality";
import type { GeoDailyDigest, GeoDailyItem } from "../types.ts";

type Candidates = Awaited<ReturnType<typeof loadGeoDailyCandidates>>;
const beijingDay = (at: number) => new Date(at + 8 * 3600_000).toISOString().slice(0, 10);

export function buildGeoDailyDigest(input: Candidates, now = Date.now(), library = false): GeoDailyDigest {
  const day = beijingDay(now), since = now - 24 * 3600_000;
  const candidates = input.candidates.filter(({ item }) => {
    if (!library && isSupplementaryResearch(item.url)) return false;
    if (library && (!item.brief || item.brief.automated || item.brief.coverage !== "full-article")) return false;
    if (item.publishedAt && Date.parse(item.publishedAt) > now) return false;
    const facts = readingFacts(item);
    if (facts.aggregated || facts.promotional || facts.compilation || facts.reprint || facts.referenceOnly) return false;
    if (item.contentKind === "social" && !(facts.firstHand && facts.method)) return false;
    // A short feed excerpt can omit the study entirely. A current reviewed full brief
    // supplies additional content evidence; an official/research source label never does.
    const reviewed = item.brief && !item.brief.automated && item.brief.coverage === "full-article" ? item.brief : null;
    const briefFacts = reviewed ? readingFacts({ ...item, summary: [reviewed.conclusion, ...reviewed.findings].join(" ") }) : null;
    return facts.rank === 0 || !!(reviewed && (facts.related || briefFacts?.related));
  });
  const ranked = candidates.sort((a, b) =>
    Number(isSupplementaryResearch(a.item.url)) - Number(isSupplementaryResearch(b.item.url)) ||
    groupLinkPreference(a.item) - groupLinkPreference(b.item) ||
    Number(!!b.item.brief && !b.item.brief.automated) - Number(!!a.item.brief && !a.item.brief.automated) ||
    Date.parse(b.item.publishedAt ?? b.item.collectedAt) - Date.parse(a.item.publishedAt ?? a.item.collectedAt) || a.item.id.localeCompare(b.item.id));
  const seenIds = new Set<string>(), seenTitles = new Set<string>();
  const recent: GeoDailyItem[] = [], research: GeoDailyItem[] = [];
  for (const candidate of ranked) {
    const { item, canonicalId, briefCreatedAt } = candidate;
    const fresh = !library && !!item.publishedAt && Date.parse(item.publishedAt) >= since;
    const added = !!item.brief && !item.brief.automated && item.brief.coverage === "full-article" &&
      !!briefCreatedAt && Date.parse(briefCreatedAt) <= now && beijingDay(Date.parse(briefCreatedAt)) === day;
    if (!library && !fresh && !added) continue;
    // Exact normalized long titles only: never merge different findings on a shared topic.
    const title = decodeHTML(item.title).normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, "");
    const key = title.length >= 18 ? `${item.language}:${title}` : canonicalId;
    if (seenIds.has(canonicalId) || seenTitles.has(key)) continue;
    seenIds.add(canonicalId); seenTitles.add(key);
    (fresh ? recent : research).push({ ...item, briefAddedAt: added ? briefCreatedAt : null });
  }
  // Round-robin by publisher avoids one prolific site taking the entire first screen.
  function diverse(items: GeoDailyItem[]) {
    const hosts = new Map<string, GeoDailyItem[]>();
    for (const item of items) {
      const host = new URL(item.url).hostname.replace(/^www\./, "");
      hosts.set(host, [...(hosts.get(host) ?? []), item]);
    }
    const result: GeoDailyItem[] = [];
    while (result.length < items.length) for (const group of hosts.values()) { const item = group.shift(); if (item) result.push(item); }
    return result;
  }
  return { view: library ? "library" : "daily", generatedAt: new Date(now).toISOString(), day, since: new Date(since).toISOString(),
    recent: diverse(recent), research: diverse(library ? research : research.sort((a, b) => Date.parse(b.briefAddedAt!) - Date.parse(a.briefAddedAt!) || a.id.localeCompare(b.id))), recentTotal: recent.length, researchTotal: research.length,
    candidatesTruncated: input.truncated };
}
