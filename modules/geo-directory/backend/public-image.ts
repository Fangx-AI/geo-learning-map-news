import * as cheerio from "cheerio";
import { isNonArticleImage } from "@aihot/backend/lib/image-url";
import type { Candidate } from "@aihot/backend/sources/types";
import { safePublicUrl } from "./public-source.ts";

export type PublicImageOrigin = "rss" | "og-image" | "social";

/** Cover metadata only; exclude trackers, author avatars and generic site marks. */
export function publicImageUrl(value: unknown, base?: string, width?: number, height?: number): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 4000) return null;
  try {
    const url = new URL(value, base);
    if (!safePublicUrl(url.href) || isNonArticleImage(url.href, width?.toString(), height?.toString())) return null;
    if ((width !== undefined && width < 120) || (height !== undefined && height < 60)) return null;
    if (/(?:^|[\/_.-])(?:logo|avatar|favicon|pixel|spacer|tracking)(?:[\/_.-]|$)/i.test(url.pathname)) return null;
    // Search Central changelog entries share this site-wide lockup, not an article cover.
    if (url.hostname === "developers.google.com" && url.pathname === "/static/search/images/home-social-share-lockup.jpg") return null;
    // This RSS attachment returns 404; the article advertises a working /images/featured.jpg.
    if (url.hostname === "brave.com" && url.pathname === "/blog/alphasignal-hackathon/alphasignal-hackathon.jpeg") return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

export function candidateImage(candidate: Candidate): string | null {
  for (const media of candidate.media ?? []) {
    if (media.kind !== "image") continue;
    const url = publicImageUrl(media.url, candidate.url, media.width ?? undefined, media.height ?? undefined);
    if (url) return url;
  }
  return null;
}

/** Never use unrelated body thumbnails, organization logos or publisher avatars as a cover. */
export function pageCover(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const dimension = (value: unknown): number | undefined => value !== undefined && value !== null && String(value).trim() && Number.isFinite(Number(value)) ? Number(value) : undefined;
  if ($("input[type='password']").length || /captcha|verify.{0,15}(?:human|browser)|access denied/i.test($("title").text())) throw new Error("public image page unavailable");
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[property="twitter:image"]']) {
    for (const element of $(selector).toArray()) {
      const meta = $(element), og = meta.attr("property") === "og:image";
      const siblings = meta.nextUntil('meta[property="og:image"]');
      const width = og ? dimension(siblings.filter('meta[property="og:image:width"]').first().attr("content")) : undefined;
      const height = og ? dimension(siblings.filter('meta[property="og:image:height"]').first().attr("content")) : undefined;
      const url = publicImageUrl(meta.attr("content"), pageUrl, width, height);
      if (url) return url;
    }
  }
  const images: unknown[] = [];
  const visit = (input: unknown, depth = 0): void => {
    if (depth > 5 || !input || typeof input !== "object") return;
    if (Array.isArray(input)) { for (const value of input.slice(0, 100)) visit(value, depth + 1); return; }
    const value = input as Record<string, unknown>;
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.some(type => typeof type === "string" && /^(?:Article|NewsArticle|BlogPosting|ScholarlyArticle|TechArticle)$/.test(type))) images.push(value.image);
    visit(value["@graph"], depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, element) => {
    try { visit(JSON.parse($(element).text())); } catch { /* An invalid block cannot invent an image. */ }
  });
  for (const entry of images.flat()) {
    const object = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
    const url = publicImageUrl(object ? object.url ?? object.contentUrl : entry, pageUrl, dimension(object?.width), dimension(object?.height));
    if (url) return url;
  }
  return null;
}
