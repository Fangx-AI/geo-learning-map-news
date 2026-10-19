import { createHash } from "node:crypto";
import { decodeHTML } from "entities";
import { beijingDate } from "@aihot/contracts/time";

export const PUBLIC_GROUP_VERSION = 2;

/** A reading aid only: equal long titles on the same Beijing date, never deletion or event identity. */
export function publicGroupKey(item: { canonicalId: string; title: string; url: string; language: string; publishedAt: Date | null }): string {
  let title = decodeHTML(item.title).normalize("NFKC").toLocaleLowerCase("en-US").trim();
  try {
    if (new URL(item.url).hostname === "news.google.com") {
      const separator = title.lastIndexOf(" - ");
      if (separator > 0 && title.length - separator <= 163) title = title.slice(0, separator);
    }
  } catch { /* Invalid historical URLs retain their full title. */ }
  title = title.replace(/[\p{P}\p{Z}\s]+/gu, "");
  const day = item.publishedAt && Number.isFinite(item.publishedAt.getTime()) ? beijingDate(item.publishedAt) : null;
  const basis = day && [...title].length >= 18 ? `title-v${PUBLIC_GROUP_VERSION}\n${item.language}\n${day}\n${title}` : `item-v${PUBLIC_GROUP_VERSION}\n${item.canonicalId}`;
  return createHash("sha256").update(basis).digest("hex");
}
