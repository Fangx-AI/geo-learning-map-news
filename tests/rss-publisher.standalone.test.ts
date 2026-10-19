import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchRss } from "@aihot/backend/sources/rss";

const requests: Array<string | undefined> = [];
const server = http.createServer((req, res) => {
  requests.push(req.headers["if-none-match"] as string | undefined);
  if (req.headers["if-none-match"] === '"same-feed"') { res.writeHead(304); res.end(); return; }
  res.setHeader("etag", '"same-feed"');
  res.setHeader("content-type", "application/rss+xml");
  res.end('<rss version="2.0"><channel><title>News index</title><item><title>AI search citation research - Research &amp; Data</title><link>https://news.example/article</link><source url="https://research.example/">Research &amp; Data</source><pubDate>Fri, 16 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>');
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const previous = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => { config.allowPrivateNetworkFetch = previous; await new Promise<void>(resolve => server.close(() => resolve())); });

test("publisher metadata is opt-in and changing parsing options refreshes a previously cached feed", async () => {
  const source = { config: { feedUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/feed` }, participation_mode: "editorial" };
  const baseline = await fetchRss(source as never);
  assert.equal((baseline.candidates[0]!.raw as Record<string, unknown>).publisherName, undefined);
  const refreshed = await fetchRss({ ...source, cursor: { rss: baseline.validator } } as never, { includePublisher: true });
  assert.equal(refreshed.notModified, false);
  assert.equal(requests[1], undefined, "old validators must not suppress newly requested metadata");
  assert.deepEqual(refreshed.candidates[0]!.raw, { guid: null, publisherName: "Research & Data", publisherUrl: "https://research.example/" });
  const cached = await fetchRss({ ...source, cursor: { rss: refreshed.validator } } as never, { includePublisher: true });
  assert.equal(cached.notModified, true);
  assert.equal(requests[2], '"same-feed"');
});
