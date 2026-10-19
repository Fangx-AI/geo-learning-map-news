import { sql } from "@aihot/backend/db";
import { publicCollectionError, toPublicCandidates, type PublicCandidate } from "./public-source.ts";
import { discoverPublicSocial, publicSocialArticleUrl, publicSocialUrl, readPublicSocialArticle, readPublicSocialPost, socialPublicationSource, type PublicSocialSource } from "./public-social.ts";
import { savePublicCandidates } from "./store-public.ts";
import type { SourceCollectionResult } from "./collect-public.ts";

/** A durable queue makes per-round limits pacing, rather than silently losing links after the first page. */
export async function collectPublicSocial(source: PublicSocialSource, dependencies: { discover?: typeof discoverPublicSocial; readArticle?: typeof readPublicSocialArticle; read?: typeof readPublicSocialPost } = {}): Promise<SourceCollectionResult> {
  const discover = dependencies.discover ?? discoverPublicSocial;
  const readArticle = dependencies.readArticle ?? readPublicSocialArticle;
  const read = dependencies.read ?? readPublicSocialPost;
  await sql`UPDATE geo_public_source_status SET status = 'running', last_attempt_at = now(), error = NULL WHERE source_id = ${source.id}`;
  let discoveryOk = 0, discoveryFailed = 0, fetched = 0, postFailed = 0, articlesChecked = 0, articlesOk = 0;
  let articlesQueued = 0, articlesPending = 0, articlesFailed = 0;
  try {
    const found = new Map(source.seedUrls.map(url => [publicSocialUrl(url, source.platform)!, source.url]));
    for (const entry of source.discovery) {
      try {
        const result = await discover(entry, source.platform);
        for (const link of result.links) {
          const url = publicSocialUrl(link.url, source.platform);
          if (url) found.set(url, link.discoveredFrom);
        }
        // Save the complete index result before applying request limits. Later index updates
        // can remove links, but cannot remove an article already waiting in this queue.
        for (const input of result.articles) {
          const url = publicSocialArticleUrl(input, entry);
          if (url) await sql`INSERT INTO geo_public_social_articles (source_id, discovery_url, url) VALUES (${source.id}, ${entry.url}, ${url}) ON CONFLICT (source_id, discovery_url, url) DO NOTHING`;
        }
        discoveryOk++;
      } catch { discoveryFailed++; }
      if (!entry.maxArticlePages || !entry.articlePathPrefix) continue;
      const scope = new URL(entry.url).origin + entry.articlePathPrefix;
      const refreshHours = entry.articleRefreshHours ?? 168;
      const articles = await sql<{ url: string }[]>`SELECT url FROM geo_public_social_articles
        WHERE source_id = ${source.id} AND discovery_url = ${entry.url} AND starts_with(url, ${scope})
          AND (last_attempt_at IS NULL OR last_attempt_at < now() - CASE WHEN error IS NOT NULL THEN interval '1 hour' ELSE ${refreshHours} * interval '1 hour' END)
        ORDER BY last_attempt_at NULLS FIRST, first_seen_at, url LIMIT ${entry.maxArticlePages}`;
      // Process old pending articles even when the index is temporarily unavailable.
      for (const { url } of articles) {
        articlesChecked++;
        try {
          const links = await readArticle(url, entry, source.platform);
          await sql.begin(async tx => {
            for (const link of links) {
              const post = publicSocialUrl(link.url, source.platform);
              if (post) await tx`INSERT INTO geo_public_social_links (source_id, url, discovered_from) VALUES (${source.id}, ${post}, ${url}) ON CONFLICT (source_id, url) DO NOTHING`;
            }
            await tx`UPDATE geo_public_social_articles SET last_attempt_at = now(), last_success_at = now(), error = NULL WHERE source_id = ${source.id} AND discovery_url = ${entry.url} AND url = ${url}`;
          });
          articlesOk++;
        } catch (error) {
          await sql`UPDATE geo_public_social_articles SET last_attempt_at = now(), error = ${publicCollectionError(error)} WHERE source_id = ${source.id} AND discovery_url = ${entry.url} AND url = ${url}`;
        }
      }
      const [counts] = await sql<{ total: number; pending: number; failed: number }[]>`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE last_attempt_at IS NULL OR last_attempt_at < now() - CASE WHEN error IS NOT NULL THEN interval '1 hour' ELSE ${refreshHours} * interval '1 hour' END)::int AS pending,
        count(*) FILTER (WHERE error IS NOT NULL)::int AS failed FROM geo_public_social_articles
        WHERE source_id = ${source.id} AND discovery_url = ${entry.url} AND starts_with(url, ${scope})`;
      articlesQueued += counts.total; articlesPending += counts.pending; articlesFailed += counts.failed;
    }
    for (const [url, discoveredFrom] of found) {
      await sql`INSERT INTO geo_public_social_links (source_id, url, discovered_from) VALUES (${source.id}, ${url}, ${discoveredFrom}) ON CONFLICT (source_id, url) DO NOTHING`;
    }
    const pending = await sql<{ url: string }[]>`SELECT url FROM geo_public_social_links
      WHERE source_id = ${source.id} AND (last_attempt_at IS NULL OR last_attempt_at < now() - CASE WHEN error IS NOT NULL THEN interval '1 hour' ELSE ${source.refreshHours} * interval '1 hour' END)
      ORDER BY last_attempt_at NULLS FIRST, first_seen_at, url LIMIT ${source.maxPostsPerRun}`;
    const items: PublicCandidate[] = [];
    for (const { url } of pending) {
      try {
        const candidate = await read(url, source.platform);
        fetched++;
        const relevant = toPublicCandidates([candidate], socialPublicationSource(source));
        if (source.platform === "reddit") {
          const community = new URL(url).pathname.split("/")[2];
          for (const item of relevant) item.sourceName = `Reddit · r/${community}${candidate.author ? ` · ${candidate.author}` : ""}`;
        }
        // Save content and the successful receipt together: a failed write must remain retryable.
        await sql.begin(async tx => {
          await savePublicCandidates(tx, relevant);
          await tx`UPDATE geo_public_social_links SET last_attempt_at = now(), last_success_at = now(), error = NULL WHERE source_id = ${source.id} AND url = ${url}`;
        });
        items.push(...relevant);
      } catch (error) {
        postFailed++;
        await sql`UPDATE geo_public_social_links SET last_attempt_at = now(), error = ${publicCollectionError(error)} WHERE source_id = ${source.id} AND url = ${url}`;
      }
    }
    const [posts] = await sql<{ total: number; pending: number; failed: number }[]>`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE last_attempt_at IS NULL OR last_attempt_at < now() - CASE WHEN error IS NOT NULL THEN interval '1 hour' ELSE ${source.refreshHours} * interval '1 hour' END)::int AS pending,
      count(*) FILTER (WHERE error IS NOT NULL)::int AS failed FROM geo_public_social_links WHERE source_id = ${source.id}`;
    const errors = discoveryFailed + articlesFailed + posts.failed;
    const status = errors ? discoveryOk + articlesOk + fetched > 0 ? "partial" : "error" : discoveryOk + articlesOk + fetched > 0 ? "ok" : "skipped";
    const error = errors ? `公开发现入口失败 ${discoveryFailed} 个，尚有 ${articlesFailed} 篇引用文章、${posts.failed} 条帖子读取失败（本轮帖子失败 ${postFailed} 条）；未取得的内容没有发布` : null;
    const socialDiscovery = { checkedAt: new Date().toISOString(), discoveryPagesChecked: discoveryOk, discoveryPagesFailed: discoveryFailed,
      articlesQueued, articlesChecked, articlesPending, articlesFailed, postsDiscovered: posts.total, postsPending: posts.pending, postsFailed: posts.failed };
    await sql`UPDATE geo_public_source_status SET status = ${status}, last_success_at = CASE WHEN ${status === "ok" || status === "partial"} THEN now() ELSE last_success_at END,
      fetched_count = ${fetched}, matched_count = ${items.length}, error = ${error},
      cursor = jsonb_set(cursor, '{socialDiscovery}', ${sql.json(socialDiscovery)}::jsonb) WHERE source_id = ${source.id}`;
    return { id: source.id, status, fetched, matched: items.length, error };
  } catch (error) {
    const safeError = publicCollectionError(error);
    await sql`UPDATE geo_public_source_status SET status = 'error', error = ${safeError} WHERE source_id = ${source.id}`;
    return { id: source.id, status: "error", fetched, matched: 0, error: safeError };
  }
}
