import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchRss } from "@aihot/backend/sources/rss";
import { toPublicCandidates, type PublicSource } from "../backend/public-source.ts";

// Native social RSS shapes: Bluesky omits title and uses plain description text; Mastodon
// uses HTML descriptions. Text is synthetic, while field structure follows those feeds.
const socialFeeds: Record<string, string> = {
  "/bluesky": `<rss version="2.0"><channel><title>Research posts</title>
    <item><link>https://bsky.app/profile/research.example/post/3abc</link><description>AI Overviews &amp; citations: what changed in search discovery?</description><pubDate>Thu, 15 Oct 2026 12:00:00 GMT</pubDate><guid isPermaLink="false">at://research/3abc</guid></item>
    <item><link>https://bsky.app/profile/research.example/post/3def</link><description>A photograph from today's walk</description><pubDate>Thu, 15 Oct 2026 11:00:00 GMT</pubDate><guid isPermaLink="false">at://research/3def</guid></item>
    <item><link>https://bsky.app/profile/research.example/post/3ghi</link><title>GEO study original title</title><description>Generative engine optimization results</description><pubDate>Thu, 15 Oct 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`,
  "/mastodon": `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>AI search posts</title>
    <item><link>https://mastodon.social/@research/123</link><description><![CDATA[<p>LLM visibility and <strong>AI search</strong> research.</p><p>Compare <a href="https://research.example/study">the original study</a>.</p>]]></description><pubDate>Thu, 15 Oct 2026 12:00:00 GMT</pubDate></item>
    <item><link>https://mastodon.social/@research/124</link><content:encoded><![CDATA[<p>${"Research notes. ".repeat(12)}AI Overviews citation comparison.</p>]]></content:encoded><pubDate>Thu, 15 Oct 2026 11:00:00 GMT</pubDate></item>
    </channel></rss>`,
  "/atom-post": `<feed xmlns="http://www.w3.org/2005/Atom"><title>Social posts</title><entry><id>urn:post</id><link href="https://social.example/@research/123"/><content type="html">&lt;p&gt;AI search citation experiments with source links.&lt;/p&gt;</content><published>2026-10-15T12:00:00Z</published><updated>2026-10-15T13:00:00Z</updated></entry></feed>`,
};
const server = http.createServer((req, res) => {
  if (socialFeeds[req.url!]) {
    res.setHeader("content-type", "application/rss+xml");
    res.setHeader("etag", '"social-fixture"');
    if (req.headers["if-none-match"] === '"social-fixture"') { res.writeHead(304); res.end(); return; }
    res.end(socialFeeds[req.url!]); return;
  }
  res.setHeader("content-type", "application/atom+xml");
  res.end(`<feed xmlns="http://www.w3.org/2005/Atom"><title>GEO research</title><entry><id>urn:research</id><title>AI search study</title><link href="https://research.example/article"/><updated>2026-10-15T00:00:00Z</updated>${req.url === "/published" ? "<published>2026-10-01T00:00:00Z</published>" : ""}</entry></feed>`);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const previous = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => { config.allowPrivateNetworkFetch = previous; await new Promise<void>(resolve => server.close(() => resolve())); });

test("opt-in social RSS excerpts preserve text, links and dates while GEO excludes unrelated posts", async () => {
  const source: PublicSource = { id: "geo-social-fixture", name: "Social research", kind: "rss", config: { feedUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/bluesky` }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://bsky.app/profile/research.example", languageHint: "en" };
  const original = await fetchRss(source);
  assert.equal(original.candidates.length, 1, "default readers still require a supplied title");
  source.cursor = { rss: original.validator };
  const optedIn = await fetchRss(source, { titleFromExcerpt: true, allowUpdatedAsPublished: false });
  assert.equal(optedIn.notModified, false, "a parsing-option change must bypass old validators");
  assert.equal(optedIn.candidates.length, 3);
  const items = toPublicCandidates(optedIn.candidates, source);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "帖文节选｜AI Overviews & citations: what changed in search discovery?");
  assert.equal(items[0].summary, "AI Overviews & citations: what changed in search discovery?");
  assert.equal(items[0].url, "https://bsky.app/profile/research.example/post/3abc");
  assert.equal(items[0].publishedAt?.toISOString(), "2026-10-15T12:00:00.000Z");
  assert.equal(items[0].language, "en", "the Chinese excerpt label is not source-language evidence");
  assert.equal(items[1].title, "GEO study original title");
  source.cursor = { rss: optedIn.validator };
  assert.equal((await fetchRss(source, { titleFromExcerpt: true, allowUpdatedAsPublished: false })).notModified, true);

  source.cursor = null;
  source.config.feedUrl = source.config.feedUrl.replace("/bluesky", "/mastodon");
  const mastodon = toPublicCandidates((await fetchRss(source, { titleFromExcerpt: true })).candidates, source);
  assert.equal(mastodon.length, 2);
  assert.match(mastodon[0].title, /^帖文节选｜LLM visibility and AI search/);
  assert.doesNotMatch(mastodon[0].summary!, /<[^>]+>/);
  assert.match(mastodon[0].summary!, /the original study/);
  assert.ok([...mastodon[1].title].length <= 126);
  assert.match(mastodon[1].summary!, /AI Overviews citation comparison/, "content-only post retains text beyond the abbreviated title");
  source.config.feedUrl = source.config.feedUrl.replace("/mastodon", "/atom-post");
  const atom = toPublicCandidates((await fetchRss(source, { titleFromExcerpt: true })).candidates, source);
  assert.equal(atom[0].title, "帖文节选｜AI search citation experiments with source links.");
  assert.equal(atom[0].summary, "AI search citation experiments with source links.");
});
test("public Atom reading keeps update-only dates unknown and preserves real publication dates", async () => {
  const source: PublicSource = { id: "geo-atom", name: "Atom research", kind: "rss", config: { feedUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/updated` }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://research.example", languageHint: "en" };
  const updated = await fetchRss(source, { allowUpdatedAsPublished: false });
  assert.equal(updated.candidates[0].publishedAt, null);
  assert.equal(updated.candidates[0].sourceUpdatedAt?.toISOString(), "2026-10-15T00:00:00.000Z");
  assert.equal(toPublicCandidates(updated.candidates, source)[0].publishedAt, null);
  source.config.feedUrl = source.config.feedUrl.replace("/updated", "/published");
  const published = await fetchRss(source, { allowUpdatedAsPublished: false });
  assert.equal(published.candidates[0].publishedAt?.toISOString(), "2026-10-01T00:00:00.000Z");
});
