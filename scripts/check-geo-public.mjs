// Read-only checks against a running local API; no third-party fetch or model call.
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://127.0.0.1:3001";
const get = async (path) => {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, `${path} responds successfully`);
  return response.json();
};
const all = [], ids = new Set();
let cursor = null, total, pages = 0;
do {
  const query = new URLSearchParams({ limit: "50" });
  if (cursor) query.set("cursor", cursor);
  const page = await get(`/api/geo/public-items?${query}`);
  total ??= page.total;
  assert.equal(page.total, total, "run between collection cycles so the total remains stable");
  for (const item of page.items) {
    assert.ok(!ids.has(item.id), "pagination must not repeat items");
    assert.ok(item.title && item.sourceName && item.url, "retain original title and attribution");
    assert.ok(["https:", "http:"].includes(new URL(item.url).protocol));
    assert.ok(item.publishedAt === null || Number.isFinite(Date.parse(item.publishedAt)));
    ids.add(item.id);
    all.push(item);
  }
  cursor = page.nextCursor;
  pages++;
  assert.ok(pages < 2000, "pagination terminates");
} while (cursor);
assert.equal(all.length, total, "all matching items can be reached exactly once");
const groupedIds = new Set(), groupKeys = new Set();
let groupCursor = null, totalGroups, groupPages = 0, expandedGroups = 0;
do {
  const query = new URLSearchParams({ limit: "50", group: "title" });
  if (groupCursor) query.set("cursor", groupCursor);
  const page = await get(`/api/geo/public-items?${query}`);
  totalGroups ??= page.totalGroups;
  assert.equal(page.total, total);
  assert.equal(page.totalGroups, totalGroups);
  for (const item of page.items) {
    const group = item.nearDuplicates;
    const key = group?.key ?? item.id;
    assert.ok(!groupKeys.has(key), "group pagination must not repeat a group");
    groupKeys.add(key);
    let members = [item, ...(group?.items ?? [])];
    if (group) {
      assert.equal(group.count, members.length + group.remainingCount);
      if (group.remainingCount) {
        members = [];
        let memberCursor = null;
        do {
          const params = new URLSearchParams({ group: "none", groupKey: group.key, limit: "50" });
          if (memberCursor) params.set("cursor", memberCursor);
          const result = await get(`/api/geo/public-items?${params}`);
          assert.equal(result.total, group.count);
          members.push(...result.items);
          memberCursor = result.nextCursor;
          assert.ok(members.length <= group.count, "member pagination terminates");
        } while (memberCursor);
      }
      assert.equal(members.length, group.count);
      expandedGroups++;
    }
    for (const member of members) {
      assert.ok(ids.has(member.id), "a grouped member remains a published original record");
      assert.ok(!groupedIds.has(member.id), "no member is repeated across groups");
      groupedIds.add(member.id);
    }
  }
  groupCursor = page.nextCursor;
  assert.ok(++groupPages < 2000, "group pagination terminates");
} while (groupCursor);
assert.equal(groupKeys.size, totalGroups);
assert.equal(groupedIds.size, total, "grouping hides no matching record");
for (const q of ['AI search', '"AI search"', 'GEO research']) {
  const page = await get(`/api/geo/public-items?${new URLSearchParams({ q, group: "title" })}`);
  for (const item of page.items.flatMap(item => [item, ...(item.nearDuplicates?.items ?? [])])) {
    const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
    assert.ok(page.searchTerms.every(term => text.includes(term.toLowerCase())), "every search term or quoted phrase matches literally");
  }
}
if (all.length) {
  const first = all[0];
  for (const [key, value, field] of [["source", first.sourceId, "sourceId"], ["language", first.language, "language"], ["platform", first.platform, "platform"], ["kind", first.contentKind, "contentKind"]]) {
    const page = await get(`/api/geo/public-items?${new URLSearchParams({ [key]: value })}`);
    assert.ok(page.items.length);
    assert.ok(page.items.every(item => item[field] === value), `${key} filter applies`);
  }
}
for (const query of ["cursor=invalid", "limit=999", "platform=unknown", "kind=original", "period=alltime", "group=automatic", "groupKey=invalid", `q=${"a".repeat(201)}`]) {
  const response = await fetch(new URL(`/api/geo/public-items?${query}`, base));
  assert.equal(response.status, 400, "invalid query is rejected");
}
const collection = await get("/api/geo/collection-status");
assert.ok(["running", "waiting", "retrying", "stopped", "stale", "unknown"].includes(collection.collector.state));
for (const period of ["24h", "7d", "30d"]) {
  const page = await get(`/api/geo/public-items?period=${period}`);
  assert.ok(page.items.every(item => item.publishedAt !== null), "recent filters never use collection time in place of publication time");
}
const overview = await get("/api/geo/overview");
assert.equal(overview.stats.total, total);
for (const item of overview.highlights) assert.ok(ids.has(item.id), "reading picks come from published content");
for (const cluster of overview.hotClusters) {
  assert.equal(cluster.sourceCount, cluster.sourceDomains.length);
  for (const item of cluster.items) assert.ok(ids.has(item.id));
}
if (overview.selectedDay) {
  const digest = await get(`/api/geo/overview?day=${overview.selectedDay}`);
  assert.equal(digest.dailyTotal, overview.dailyTotal);
  for (const item of digest.dailyItems) {
    const day = new Date(Date.parse(item.publishedAt ?? item.collectedAt) + 8 * 3600_000).toISOString().slice(0, 10);
    assert.equal(day, overview.selectedDay, "daily archive follows Beijing dates");
  }
}
if (overview.topics.length) {
  const topic = await get(`/api/geo/overview?topic=${encodeURIComponent(overview.topics[0].slug)}`);
  assert.equal(topic.selectedTopic.slug, overview.topics[0].slug);
  assert.ok(topic.selectedTopic.items.length);
}
for (const day of ["invalid", "2026-02-30"]) {
  const response = await fetch(new URL(`/api/geo/overview?day=${day}`, base));
  assert.equal(response.status, 400, "invalid calendar dates are rejected");
}
const social = Object.fromEntries(["public-x-geo", "public-reddit-geo"].map(source => [source, all.filter(item => item.sourceId === source).length]));
console.log(JSON.stringify({ passed: true, total, pages, totalGroups, groupPages, expandedGroups, publisherAttributed: all.filter(item => item.publisherName && item.publisherUrl).length, languages: [...new Set(all.map(item => item.language))], sources: collection.sources.length, successfulSources: collection.sources.filter(source => source.enabled && source.status === "ok").length, collector: collection.collector, highlights: overview.highlights.length, hotTopics: overview.hotClusters.length, topics: overview.topics.length, day: overview.selectedDay, dailyItems: overview.dailyTotal, social }, null, 2));
