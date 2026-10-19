import { decodeHTML } from "entities";
import { collapseWhitespace, stripTags } from "@aihot/backend/lib/text";

export const PUBLIC_SUMMARY_VERSION = 3;
export type PublicSummaryOrigin = "rss" | "listing" | "social" | "body-excerpt" | "metadata";
export interface PublicSummary {
  summary: string | null;
  summaryRaw: string | null;
  summaryVersion: typeof PUBLIC_SUMMARY_VERSION;
  summaryOrigin: PublicSummaryOrigin;
  summarySourceUrl: string;
}

export function summaryPlainText(raw: string): string {
  // Candidate excerpts are normally already text. Do not interpret scientific comparisons
  // such as "x < y > z" or escaped literal examples as markup on a second pass.
  const html = /<\/?(?:p|div|span|a|br|strong|em|b|i|ul|ol|li|blockquote|script|style|iframe)\b[^>]*>/iu.test(raw);
  return collapseWhitespace(decodeHTML(html ? stripTags(raw) : raw));
}

function hostname(url: string): string { try { return new URL(url).hostname.replace(/^www\./u, "").toLowerCase(); } catch { return ""; } }
const FIRST_APPEARED_PUBLISHERS: Record<string,string> = {
  "searchenginejournal.com": "Search Engine Journal",
  "screamingfrog.co.uk": "Screaming Frog",
  "brodieclark.com": "Brodie Clark Consulting",
  "richsanger.com": "Rich Sanger",
  "mariehaynes.com": "Marie Haynes",
  "ipullrank.com": "iPullRank",
  "wordlift.io": "WordLift Blog",
  "oncrawl.com": "Oncrawl",
  "clarity.microsoft.com": "Understand your customers | Microsoft Clarity Blog",
};

/** These are observed feed templates, not generic "read more" removal from article prose. */
export function cleanSourceSummary(raw: string, sourceUrl: string, articleUrl: string): string {
  let text = summaryPlainText(raw);
  const host = hostname(articleUrl), feed = hostname(sourceUrl);
  const publisher = FIRST_APPEARED_PUBLISHERS[host];
  if (publisher) {
    const literalPublisher = publisher.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    text = text.replace(new RegExp(`\\s+The post .{1,900} appeared first on ${literalPublisher}\\s*\\.?$`, "u"), "");
  }
  if (host === "gsqi.com") text = text.replace(/\s+The post .{1,900} first appeared on The Internet Marketing Driver\s*\.?$/u, "");
  if (host === "abondance.com") text = text.replace(/\s+L[’']article .{1,900} a été publié sur le site Abondance\s*\.?$/u, "");
  if (host === "sistrix.com" && feed === "sistrix.com") text = text.replace(/\s+Der Beitrag .{1,900} erschien zuerst auf SISTRIX\s*\.?$/u, "");
  if (host === "ahrefs.com") text = text.replace(/\s+Read more\s*[›»→]\s*$/u, "");
  if (host === "gsqi.com") text = text.replace(/((?:…|\.\.\.|\[\s*(?:…|\.\.\.)\s*\]))\s+Read more\s*[›»→]?\s*$/u, "$1");
  if (feed === "hnrss.org") {
    // HN's RSS appends link/vote metadata. It is not an excerpt of the linked article.
    text = text.replace(/(?:^|\s+)Article URL:\s+https?:\/\/\S+\s+Comments URL:\s+https?:\/\/\S+\s+Points:\s*\d+\s+# Comments:\s*\d+\s*$/u, "");
    text = text.replace(/(?:^|\s+)Comments URL:\s+https?:\/\/\S+\s+Points:\s*\d+\s+# Comments:\s*\d+\s*$/u, "");
  }
  if (host === "arxiv.org" || host === "export.arxiv.org") text = text.replace(/^arXiv:\S+\s+Announce Type:\s*(?:new|replace|cross|replace-cross)\s+Abstract:\s*/u, "");
  return text.trim();
}

/** Retain whole sentences when they use most of the budget; otherwise cut at a word boundary.
 * An ellipsis always signals omitted material, including an incomplete source-provided teaser. */
export function excerptAtSentence(text: string, limit: number): string {
  if ([...text].length <= limit) return text;
  const budget = Math.max(1, limit - 1);
  const head = [...text].slice(0, budget).join("");
  let sentenceEnd = 0;
  for (const match of head.matchAll(/[。！？](?:[”’」』）)]*)|[.!?](?:["”’')\]]*)(?=\s|$)/gu)) {
    // A decimal never ends a sentence; common abbreviations are not useful excerpt boundaries.
    const prefix = head.slice(0, match.index + match[0].length);
    if (/\b(?:e\.g|i\.e|Mr|Mrs|Ms|Dr|Prof|vs|Inc|U\.S)\.$/iu.test(prefix)) continue;
    sentenceEnd = prefix.length;
  }
  if (sentenceEnd >= head.length * 0.55) return head.slice(0, sentenceEnd).trimEnd() + "…";
  let end = head.length;
  const space = head.lastIndexOf(" ");
  if (space >= head.length * 0.75) end = space;
  return head.slice(0, end).trimEnd().replace(/[.…]+$/u, "") + "…";
}

export function makePublicSummary(input: { text: string | null | undefined; sourceUrl: string; articleUrl: string; origin: PublicSummaryOrigin }): PublicSummary {
  const supplied = input.text ?? "";
  const raw = [...supplied].slice(0, 8000).join("");
  const cleaned = cleanSourceSummary(raw, input.sourceUrl, input.articleUrl);
  const cjk = (cleaned.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0) > [...cleaned].length * 0.2;
  const summary = cleaned ? excerptAtSentence(cleaned + ([...supplied].length > 8000 ? "…" : ""), cjk ? 450 : 900) : null;
  return { summary, summaryRaw: raw || null, summaryVersion: PUBLIC_SUMMARY_VERSION, summaryOrigin: input.origin, summarySourceUrl: input.sourceUrl };
}
