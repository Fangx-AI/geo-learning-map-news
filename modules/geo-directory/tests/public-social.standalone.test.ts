import test from "node:test";
import assert from "node:assert/strict";
import { discoverPublicSocial, loadPublicSocialSources, publicSocialArticleUrl, publicSocialUrl, readPublicSocialArticle, readPublicSocialPost, redditPublicCandidate, socialLinksInHtml, xPublicCandidate, xSyndicationUrl, type PublicSocialFetch } from "../backend/public-social.ts";
import { safePublicUrl, toPublicCandidates } from "../backend/public-source.ts";
import { socialPublicationSource } from "../backend/public-social.ts";
import { matchGeoTerms } from "../backend/relevance.ts";

const xUrl = "https://x.com/researcher/status/1943065200829088177";
const redditUrl = "https://www.reddit.com/r/seo/comments/1ss0drr/";
const response = (body: string, url: string, status = 200) => ({ status, url, body: Buffer.from(body), headers: new Headers(), text: () => body });
const xData = { __typename: "Tweet", id_str: "1943065200829088177", text: "AI search citations " + "research ".repeat(90), created_at: "2025-07-09T21:50:18.000Z", lang: "en", user: { screen_name: "researcher" } };

test("public social URLs require original posts and remove tracking without allowing credentials or redirectors", () => {
  assert.equal(publicSocialUrl(xUrl + "?utm_source=blog#fragment"), xUrl);
  assert.equal(publicSocialUrl("https://twitter.com/Researcher/status/1943065200829088177/photo/1"), xUrl);
  assert.equal(publicSocialUrl("https://old.reddit.com/r/SEO/comments/1ss0drr/title/?utm_source=blog"), redditUrl);
  for (const url of ["https://x.com/search?q=GEO", "https://x.com/login", "https://x.com/researcher", "https://x.com.evil.example/researcher/status/1943065200829088177", xUrl + "?access_token=private", "https://user:password@x.com/researcher/status/1943065200829088177", "https://redd.it/1ss0drr", "http://www.reddit.com/r/seo/comments/1ss0drr/"]) assert.equal(publicSocialUrl(url), null, url);
  assert.equal(publicSocialUrl(xUrl, "reddit"), null);
  assert.equal(safePublicUrl(xSyndicationUrl(xData.id_str)), null, "the generic public-URL policy is not weakened for a private transport checksum");
});

test("X embedded posts retain real dates and short excerpt labels; unavailable or mismatched posts are rejected", async () => {
  const candidate = xPublicCandidate(xData, xUrl);
  assert.equal(candidate.publishedAt?.toISOString(), xData.created_at);
  assert.equal(candidate.url, xUrl); assert.match(candidate.title!, /^帖文节选｜@researcher：/);
  assert.equal(candidate.bodyText, undefined);
  for (const value of [{ __typename: "TweetTombstone" }, { ...xData, id_str: "12345" }, { ...xData, created_at: "not a date" }]) assert.throws(() => xPublicCandidate(value, xUrl));
  const calls: string[] = [];
  await readPublicSocialPost(xUrl, "x", async url => { calls.push(url); return response(JSON.stringify(xData), url); });
  assert.equal(calls.length, 1); assert.equal(new URL(calls[0]).hostname, "cdn.syndication.twimg.com");
  assert.equal(new URL(calls[0]).searchParams.get("id"), xData.id_str);
  const source = (await loadPublicSocialSources()).find(source => source.platform === "x")!;
  assert.equal(toPublicCandidates([candidate], socialPublicationSource(source))[0].language, "en");
  const lateTopic = xPublicCandidate({ ...xData, text: "Context. ".repeat(65) + "AI search citations study" }, xUrl);
  const stored = toPublicCandidates([lateTopic], socialPublicationSource(source));
  assert.equal(stored.length, 1, "a GEO signal after character 500 remains available to relevance matching");
  assert.ok([...stored[0].summary!].length <= 900, "only the bounded excerpt crosses the public display boundary");
  assert.equal(stored[0].summaryRaw, lateTopic.excerpt);
});

test("Reddit reads visible embed title and post timestamp, never its unrelated page/session timestamp", async () => {
  const html = `<faceplate-server-session timestamp="9999999999999"></faceplate-server-session><faceplate-timeago ts="2026-10-16T00:00:00Z"></faceplate-timeago><shreddit-screenview-data data='{"post":{"id":"t3_1ss0drr","created_timestamp":1776804695436}}'></shreddit-screenview-data><div id="t3_1ss0drr-embed-wrapper"><embed-event-handler id="t3_1ss0drr" link="${redditUrl}title/"></embed-event-handler><div data-testid="embed-header"><a href="https://www.reddit.com/user/Researcher/">Researcher</a><faceplate-timeago ts="2026-04-21T20:51:35.436000+0000"></faceplate-timeago></div><h1>AI search &amp; citation research</h1><div class="md">A short public excerpt.</div></div>`;
  const candidate = redditPublicCandidate(html, redditUrl);
  assert.equal(candidate.title, "AI search & citation research");
  assert.equal(candidate.publishedAt?.toISOString(), "2026-04-21T20:51:35.436Z");
  assert.equal(candidate.excerpt, "A short public excerpt.");
  assert.equal(candidate.author, "u/Researcher");
  assert.equal(redditPublicCandidate(html.replaceAll("h1", "shreddit-embed-title"), redditUrl).title, candidate.title, "text-post embeds use a custom heading");
  assert.throws(() => redditPublicCandidate(html.replaceAll("faceplate-timeago", "irrelevant-time"), redditUrl));
  assert.throws(() => redditPublicCandidate(html.replaceAll("1ss0drr", "different"), redditUrl));
  assert.throws(() => redditPublicCandidate(html.replace("1776804695436", "9999999999999"), redditUrl), "the target header must agree with target post creation metadata");
  assert.ok(matchGeoTerms("Why ChatGPT Cites One Page Over Another").length > 0);
  assert.equal(matchGeoTerms("A student cites a book about geography").length, 0);
  const lateTopic = redditPublicCandidate(html.replace("AI search &amp; citation research", "A discussion").replace("A short public excerpt.", "Context. ".repeat(65) + "AI search citations study"), redditUrl);
  const source = (await loadPublicSocialSources()).find(source => source.platform === "reddit")!;
  const stored = toPublicCandidates([lateTopic], socialPublicationSource(source));
  assert.equal(stored.length, 1);
  assert.ok([...stored[0].summary!].length <= 900);
  assert.equal(stored[0].summaryRaw, lateTopic.excerpt);
});

test("public indexes queue every scoped article without reading details or losing overflow", async () => {
  const calls: string[] = [];
  const fetcher: PublicSocialFetch = async url => {
    calls.push(url);
    if (url.endsWith("/reports/")) return response(`<main><a href="/reports/one">One</a><a href="/reports/two">Two</a><a href="/reports/three">Three</a><a href="https://other.example/reports/evil">Outside</a><a href="/login">Login</a></main>`, url);
    return response(`<a href="${xUrl}">Post</a><a href="${xUrl}?utm_source=index">Duplicate</a>`, url);
  };
  const entry = { kind: "html" as const, url: "https://author.example/reports/", articleSelector: "main a", articlePathPrefix: "/reports/", maxArticlePages: 2 };
  const result = await discoverPublicSocial(entry, "x", fetcher);
  assert.deepEqual(calls, [entry.url]);
  assert.deepEqual(result, { links: [], articles: ["one", "two", "three"].map(name => entry.url + name) });
  assert.deepEqual(await readPublicSocialArticle(result.articles[0], entry, "x", fetcher), [{ url: xUrl, discoveredFrom: result.articles[0] }]);
  assert.equal(publicSocialArticleUrl(entry.url + "one?utm_source=index#fragment", entry), result.articles[0]);
  assert.equal(publicSocialArticleUrl(entry.url + "one?access_token=private", entry), null);
  await assert.rejects(readPublicSocialArticle("https://other.example/reports/evil", entry, "x", fetcher), /outside discovery scope/);
  await assert.rejects(readPublicSocialArticle(result.articles[0], entry, "x", async () => response("login", "https://author.example/login")), /outside discovery scope/);
  await assert.rejects(readPublicSocialArticle(result.articles[0], entry, "x", async url => response('<input type="password">', url)), /requires login/);
  assert.deepEqual(socialLinksInHtml(`<p>${redditUrl}</p>`, "reddit"), [redditUrl]);
  await assert.rejects(readPublicSocialPost(redditUrl, "reddit", async url => response("login required", url, 403)), /public social read failed/);
});

test("summary-only RSS queues same-site article details and retains direct post references", async () => {
  const entry = { kind: "rss" as const, url: "https://author.example/feed/", articlePathPrefix: "/blog/", maxArticlePages: 1 };
  const result = await discoverPublicSocial(entry, "x", undefined, async () => ({ candidates: [
    { url: "https://author.example/blog/one", title: "AI search", excerpt: "Only a summary" },
    { url: "https://author.example/blog/two?utm_source=rss", title: "AI citations", bodyHtml: `<a href="${xUrl}">Post</a>` },
    { url: "https://other.example/blog/three", title: "Outside" },
  ], notModified: false, validator: { configHash: "test", responseUrl: entry.url, etag: null, lastModified: null } }));
  assert.deepEqual(result.articles, ["https://author.example/blog/one", "https://author.example/blog/two"]);
  assert.deepEqual(result.links, [{ url: xUrl, discoveredFrom: "https://author.example/blog/two?utm_source=rss" }]);
});
