import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate } from "@aihot/backend/sources/types";
import { candidateImage, pageCover, publicImageUrl } from "../backend/public-image.ts";
import { xPublicCandidate } from "../backend/public-social.ts";

const page = "https://research.example/articles/ai-search";

test("public covers accept normal relative metadata and reject unsafe or empty addresses", () => {
  assert.equal(publicImageUrl("../images/study.jpg#crop", page, 1200, 630), "https://research.example/images/study.jpg");
  assert.equal(publicImageUrl("https://cdn.example/chart.png?w=1200&h=630"), "https://cdn.example/chart.png?w=1200&h=630");
  for (const value of [undefined, null, "", "   ", "data:image/png;base64,AAAA", "javascript:alert(1)", "file:///cover.jpg", "http://127.0.0.1/cover.jpg", "http://[::1]/cover.jpg", "http://localhost/cover.jpg", "https://inside.internal/cover.jpg", "https://user:password@cdn.example/chart.jpg", "https://cdn.example/chart.jpg?api_key=private"]) {
    assert.equal(publicImageUrl(value, page), null, `invalid cover: ${String(value)}`);
  }
});

test("public cover filtering excludes avatars, trackers, video pages and known tiny dimensions", () => {
  for (const url of ["https://cdn.example/avatar.jpg", "https://cdn.example/site-logo.png", "https://cdn.example/favicon.ico", "https://cdn.example/tracking.gif", "https://secure.adnxs.com/asset.jpg", "https://www.youtube.com/watch?v=abcdefghijk"]) {
    assert.equal(publicImageUrl(url), null, url);
  }
  assert.equal(publicImageUrl("https://cdn.example/opaque.gif", undefined, 1, 1), null);
  assert.equal(publicImageUrl("https://cdn.example/small.jpg", undefined, 119, 300), null);
  assert.equal(publicImageUrl("https://cdn.example/banner.jpg", undefined, 900, 59), null);
  assert.equal(publicImageUrl("https://cdn.example/chart.jpg", undefined, 120, 60), "https://cdn.example/chart.jpg");
});

test("candidate cover selection skips non-images and rejected thumbnails before a valid study image", () => {
  const candidate: Candidate = { url: page, title: "AI search study", media: [
    { kind: "video", url: "https://cdn.example/study.mp4" },
    { kind: "image", url: "https://cdn.example/avatar.jpg" },
    { kind: "image", url: "https://cdn.example/opaque.gif", width: 1, height: 1 },
    { kind: "image", url: "/figures/result.png", width: 1200, height: 800 },
  ] };
  assert.equal(candidateImage(candidate), "https://research.example/figures/result.png");
  assert.equal(candidateImage({ url: page, title: "No cover" }), null);
});

test("page metadata prefers a valid OG cover and falls back to Twitter without scraping body images", () => {
  assert.equal(pageCover('<meta property="og:image" content="/cover.jpg"><meta name="twitter:image" content="/twitter.jpg">', page), "https://research.example/cover.jpg");
  assert.equal(pageCover('<meta property="og:image" content="/logo.png"><meta property="twitter:image" content="/twitter.jpg">', page), "https://research.example/twitter.jpg");
  assert.equal(pageCover('<img src="/unrelated-recommendation.jpg"><meta property="og:image" content="">', page), null);
  assert.equal(pageCover('<img src="/unrelated-recommendation.jpg">', page), null);
});

test("Search Central's shared site lockup is not presented as a changelog article image", () => {
  const lockup = "https://developers.google.com/static/search/images/home-social-share-lockup.jpg?hl=zh-cn";
  assert.equal(publicImageUrl(lockup), null);
  assert.equal(pageCover(`<meta property="og:image" content="${lockup}">`, "https://developers.google.com/search/updates#october-2026"), null);
  assert.equal(pageCover(`<meta property="og:image" content="${lockup}"><meta name="twitter:image" content="/search/images/experiment-chart.jpg">`, "https://developers.google.com/search/updates"), "https://developers.google.com/search/images/experiment-chart.jpg");
});

test("the observed broken Brave RSS image yields to the article's working metadata cover", () => {
  const article = "https://brave.com/blog/alphasignal-hackathon/";
  const broken = article + "alphasignal-hackathon.jpeg";
  assert.equal(candidateImage({ title: "AI search hackathon", url: article, media: [{ kind: "image", url: broken }] }), null);
  assert.equal(pageCover('<meta property="og:image" content="images/featured.jpg">', article), article + "images/featured.jpg");
});

test("JSON-LD article images work across graph, array and object forms without adopting organization logos", () => {
  const json = { "@graph": [
    { "@type": "Organization", image: "https://cdn.example/brand-mark.png" },
    { "@type": ["BlogPosting", "Article"], image: [{ "@type": "ImageObject", contentUrl: "/figures/experiment.jpg", width: 900, height: 600 }] },
  ] };
  assert.equal(pageCover(`<script type="application/ld+json">not json</script><script type="application/ld+json">${JSON.stringify(json)}</script>`, page), "https://research.example/figures/experiment.jpg");
  assert.equal(pageCover('<script type="application/ld+json">{"@type":"Organization","image":"/brand-mark.png"}</script>', page), null);
});

test("page metadata respects explicit tracking-image dimensions before falling back to a real cover", () => {
  const og = '<meta property="og:image" content="/opaque.gif"><meta property="og:image:width" content="1"><meta property="og:image:height" content="1"><meta name="twitter:image" content="/study.jpg">';
  assert.equal(pageCover(og, page), "https://research.example/study.jpg");
  const data = [{ "@type": "NewsArticle", image: [{ url: "/opaque.gif", width: 1, height: 1 }, { url: "/study.jpg", width: 1200, height: 630 }] }];
  assert.equal(pageCover(`<script type="application/ld+json">${JSON.stringify(data)}</script>`, page), "https://research.example/study.jpg");
});

test("login and access-check pages are unavailable even if they advertise a generic preview", () => {
  for (const html of [
    '<title>Verify you are human</title><meta property="og:image" content="/cover.jpg">',
    '<title>Access denied</title><meta property="og:image" content="/cover.jpg">',
    '<form><input type="password"></form><meta property="og:image" content="/cover.jpg">',
  ]) assert.throws(() => pageCover(html, page), /unavailable/);
});

test("X cover candidates use only validated own-post photos, never user or quoted-post images", () => {
  const url = "https://x.com/researcher/status/1943065200829088177";
  const own = { url: "https://pbs.twimg.com/media/own-study.jpg", width: 1200, height: 630 };
  const post = { __typename: "Tweet", id_str: "1943065200829088177", text: "AI search citations study", created_at: "2025-07-09T21:50:18.000Z", user: { screen_name: "researcher", profile_image_url_https: "https://pbs.twimg.com/profile_images/portrait.jpg" }, quoted_tweet: { photos: [{ url: "https://pbs.twimg.com/media/quoted-study.jpg", width: 1200, height: 630 }] } };
  assert.deepEqual(xPublicCandidate(post, url).media, []);
  const candidate = xPublicCandidate({ ...post, photos: [own] }, url);
  assert.deepEqual(candidate.media, [{ kind: "image", ...own }]);
  assert.equal(candidateImage(candidate), own.url);
  assert.equal(candidate.publishedAt?.toISOString(), post.created_at);
  assert.equal(candidate.excerpt, post.text);
});

test("invalid X photo metadata does not become a cover or prevent the original post from being read", () => {
  const url = "https://x.com/researcher/status/1943065200829088177";
  const post = { __typename: "Tweet", id_str: "1943065200829088177", text: "AI search observations", created_at: "2025-07-09T21:50:18.000Z", user: { screen_name: "researcher" } };
  for (const photos of [[{ url: "https://pbs.twimg.com/media/chart.jpg", width: "1200", height: 630 }], [{ url: "https://pbs.twimg.com/media/chart.jpg", width: 0, height: 630 }], [{ url: "https://pbs.twimg.com/media/chart.jpg?api_key=private", width: 1200, height: 630 }]]) {
    const candidate = xPublicCandidate({ ...post, photos }, url);
    assert.deepEqual(candidate.media, []);
    assert.equal(candidate.excerpt, post.text);
  }
});
