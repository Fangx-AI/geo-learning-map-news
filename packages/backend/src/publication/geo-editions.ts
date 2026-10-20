import { marked } from "marked";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { sql } from "../db.ts";
import { sanitizeBody } from "../content/sanitize.ts";
import { loadGeoPublicItem } from "./geo-public.ts";
import { normalizeUrl } from "../lib/url.ts";

export async function listGeoEditions() {
  const rows = await sql`SELECT id,day::text,issue,title,created_at FROM geo_daily_editions ORDER BY day DESC,issue DESC LIMIT 366`;
  return rows.map(r => ({ id: String(r.id), day: String(r.day), issue: Number(r.issue), title: String(r.title), importedAt: new Date(r.created_at).toISOString() }));
}
export async function loadGeoEdition(id: string) {
  const [r] = await sql`SELECT id,day::text,issue,title,markdown,source_url,source_links FROM geo_daily_editions WHERE id=${id}`;
  if (!r) return null;
  const $ = load(sanitizeBody(marked.parse(String(r.markdown), { async: false, gfm: true }), String(r.source_url)), null, false);
  const outline: { id: string; title: string }[] = [];
  // The page supplies the title and date; preserve every content section below them.
  const headings = $("h2").toArray();
  for (const h of headings) {
    const title = $(h).text().trim();
    if (/^(?:🌍 )?全球 GEO|^\d{4}\s*年.*第\s*\d+\s*期|^第\s*\d+\s*期.*\d{4}\s*年/u.test(title)) { $(h).remove(); continue; }
    const anchor = `section-${outline.length + 1}`;
    $(h).attr("id", anchor); outline.push({ id: anchor, title });
  }
  $("table").wrap('<div class="edition-table" tabindex="0" role="region" aria-label="数据表，可横向滚动"></div>');
  $("a").attr("target", "_blank").attr("rel", "noopener noreferrer");
  // Existing reviewed articles can be reused without treating a report's claims as verification.
  const links = Array.isArray(r.source_links) ? r.source_links as string[] : [];
  const canonicalIds = links.map(normalizeUrl).filter((url): url is string => !!url).map(url => createHash("sha256").update(url).digest("hex"));
  const matches = links.length ? await sql`SELECT DISTINCT id FROM geo_public_items WHERE canonical_id IN ${sql(canonicalIds)} OR url IN ${sql(links)} LIMIT 40` : [];
  const verified = [];
  for (const match of matches) {
    const item = await loadGeoPublicItem(String(match.id));
    if (item?.brief?.coverage === "full-article" && !item.brief.automated) verified.push({ id: item.id, title: item.translation?.title ?? item.title, conclusion: item.brief.conclusion, geoValue: item.brief.geoValue, publishedAt: item.publishedAt, sourceName: item.sourceName, url: item.url });
  }
  const chapters = outline.filter(h => /^[一二三四五六七八九十百]+[、．.]/u.test(h.title));
  return { id: String(r.id), day: String(r.day), title: String(r.title), html: $.html(), outline: chapters.length ? chapters : outline, verified: [...new Map(verified.map(v => [v.id, v])).values()] };
}
