import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchRss } from "@aihot/backend/sources/rss";
import type { SourceRow } from "@aihot/backend/sources/types";

const feeds: Record<string, string> = {
  "/rss-media": `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Research</title><item>
    <title>AI search study</title><link>https://research.example/articles/study</link><pubDate>Fri, 16 Oct 2026 09:00:00 GMT</pubDate>
    <description>Source-provided short summary.</description>
    <media:thumbnail url="/figures/cover.jpg" width="1200" height="630"/>
    <media:group><media:content url="https://cdn.example/chart.png" medium="image" width="800" height="600"/><media:content url="https://cdn.example/talk.mp4" type="video/mp4"/></media:group>
    </item></channel></rss>`,
  "/rss-summary": `<rss version="2.0"><channel><title>Research</title><item><title>AI visibility analysis</title><link>https://research.example/articles/study</link>
    <description><![CDATA[<p>A short citation study.</p><img src='../images/summary.png' width='640' height='360'><img src='data:image/png;base64,AAAA'>]]></description>
    </item></channel></rss>`,
  "/atom-summary": `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>Research</title><entry><id>urn:study</id><title>AI visibility analysis</title><link href="https://research.example/articles/study"/>
    <published>2026-10-15T10:00:00Z</published><summary type="html"><![CDATA[<p>A short citation study.</p><img src='../images/summary.png' width='640' height='360'>]]></summary>
    </entry></feed>`,
  "/legacy": `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Research</title><item><title>AI citation research</title><link>https://research.example/articles/study</link>
    <enclosure url="https://cdn.example/enclosure.jpg" type="image/jpeg"/>
    <content:encoded><![CDATA[<p>${"Original study methods and observations. ".repeat(10)}</p><img src="https://cdn.example/body.jpg">]]></content:encoded>
    </item></channel></rss>`,
};
const requests: Array<{ path: string; validator?: string }> = [];
const server = http.createServer((req, res) => {
  const path = req.url ?? "/";
  requests.push({ path, validator: req.headers["if-none-match"] as string | undefined });
  if (!feeds[path]) { res.writeHead(404); res.end(); return; }
  res.setHeader("etag", '"image-fixture"');
  if (req.headers["if-none-match"] === '"image-fixture"') { res.writeHead(304); res.end(); return; }
  res.setHeader("content-type", path.startsWith("/atom") ? "application/atom+xml" : "application/rss+xml");
  res.end(feeds[path]);
});
// Windows may allocate a low ephemeral port rejected by Fetch's bad-port list.
// Reject only the Fetch-standard blocked ports; Windows may use a low dynamic range.
// Do not weaken the production fetch protection.
const blockedPorts = new Set([1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);
for (let attempt = 0; ; attempt++) {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  if (!blockedPorts.has((server.address() as { port: number }).port)) break;
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (attempt >= 19) throw new Error("Unable to allocate a Fetch-compatible fixture port");
}
const previous = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => { config.allowPrivateNetworkFetch = previous; await new Promise<void>(resolve => server.close(() => resolve())); });
function source(path: string): SourceRow {
  return { id: "image-fixture", name: "Research", kind: "rss", config: { feedUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}${path}` }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0 };
}

test("RSS image metadata is opt-in, preserves dimensions and never promotes an excerpt to article text", async () => {
  const original = (await fetchRss(source("/rss-media"))).candidates[0]!;
  assert.deepEqual(original.media, []);
  const opted = (await fetchRss(source("/rss-media"), { includeImageMetadata: true })).candidates[0]!;
  assert.deepEqual(opted.media, [
    { kind: "image", url: "https://research.example/figures/cover.jpg", width: 1200, height: 630 },
    { kind: "image", url: "https://cdn.example/chart.png", width: 800, height: 600 },
  ]);
  assert.equal(opted.bodyText, null);
  assert.equal(opted.bodyHtml, null);
  assert.equal(opted.bodyStatus, "pending");
  assert.equal(opted.excerpt, original.excerpt);
  assert.equal(opted.publishedAt?.toISOString(), "2026-10-16T09:00:00.000Z");
});

test("RSS summary thumbnails resolve relative addresses but do not introduce data URLs or a full body", async () => {
  const item = (await fetchRss(source("/rss-summary"), { includeImageMetadata: true })).candidates[0]!;
  assert.deepEqual(item.media, [{ kind: "image", url: "https://research.example/images/summary.png", width: 640, height: 360 }]);
  assert.equal(item.excerpt, "A short citation study.");
  assert.equal(item.bodyText, null);
});

test("Atom HTML summaries retain their opt-in thumbnail without changing excerpt or publication semantics", async () => {
  const original = (await fetchRss(source("/atom-summary"))).candidates[0]!;
  const opted = (await fetchRss(source("/atom-summary"), { includeImageMetadata: true, allowUpdatedAsPublished: false })).candidates[0]!;
  assert.deepEqual(original.media, []);
  assert.deepEqual(opted.media, [{ kind: "image", url: "https://research.example/images/summary.png", width: 640, height: 360 }]);
  assert.equal(opted.excerpt, "A short citation study.");
  assert.equal(opted.bodyText, null);
  assert.equal(opted.publishedAt?.toISOString(), "2026-10-15T10:00:00.000Z");
});

test("legacy enclosure and real body images remain available without the listing-image option", async () => {
  const item = (await fetchRss(source("/legacy"))).candidates[0]!;
  assert.deepEqual(item.media, [
    { kind: "image", url: "https://cdn.example/enclosure.jpg" },
    { kind: "image", url: "https://cdn.example/body.jpg" },
  ]);
  assert.equal(item.bodyStatus, "ok");
  assert.match(item.bodyText!, /Original study methods/);
});

test("enabling image metadata invalidates old parsing validators and supports later conditional requests", async () => {
  const fixture = source("/rss-media");
  const original = await fetchRss(fixture);
  const before = requests.length;
  const refreshed = await fetchRss({ ...fixture, cursor: { rss: original.validator } }, { includeImageMetadata: true });
  assert.equal(refreshed.notModified, false);
  assert.equal(requests[before]!.validator, undefined, "an old no-image validator must not hide requested images");
  assert.equal(refreshed.candidates[0]!.media?.length, 2);
  const cached = await fetchRss({ ...fixture, cursor: { rss: refreshed.validator } }, { includeImageMetadata: true });
  assert.equal(cached.notModified, true);
  assert.equal(requests.at(-1)!.validator, '"image-fixture"');
});
