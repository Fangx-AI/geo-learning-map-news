// Read-only production checks: recommendation traversal, cursor isolation, real image responses.
import assert from "node:assert/strict";
const base = process.argv[2] ?? "http://127.0.0.1:3001";
const get = async path => { const r = await fetch(new URL(path, base)); assert.equal(r.status, 200, path); return r.json(); };
const tier = { priority: 0, standard: 1, deprioritized: 2 };
const totals = {}, covers = new Map();
for (const group of ["none", "title"]) {
  let cursor = null, count = 0, total, previousRank = -1, pages = 0;
  const ids = new Set();
  do {
    const query = new URLSearchParams({ group, sort: "recommended", limit: "50" });
    if (cursor) query.set("cursor", cursor);
    const page = await get(`/api/geo/public-items?${query}`);
    assert.equal(page.sort, "recommended");
    total ??= page.totalGroups;
    assert.equal(page.totalGroups, total);
    for (const item of page.items) {
      assert.ok(!ids.has(item.id)); ids.add(item.id);
      const rank = tier[item.readingPriority?.tier];
      assert.ok(Number.isInteger(rank) && rank >= previousRank, "displayed rule tier agrees with full database order"); previousRank = rank;
      assert.ok(item.readingPriority.reasons.length && item.readingPriority.limitations.length);
      if (item.imageUrl && covers.size < 8) {
        const image = new URL(item.imageUrl, base);
        assert.equal(image.origin, new URL(base).origin); assert.equal(image.pathname, "/api/img-proxy");
        assert.equal(image.searchParams.get("mode"), "card"); assert.ok(image.searchParams.get("sig"));
        covers.set(item.imageUrl, { title: item.title, origin: item.imageOrigin });
      }
      count++;
    }
    if (!cursor && page.nextCursor) {
      for (const changed of [{ sort: "latest", group }, { sort: "recommended", group: group === "none" ? "title" : "none" }, { sort: "recommended", group, language: "zh" }]) {
        const response = await fetch(new URL(`/api/geo/public-items?${new URLSearchParams({ ...changed, cursor: page.nextCursor })}`, base));
        assert.equal(response.status, 400, "cursor cannot be reused under another order or filter");
      }
    }
    cursor = page.nextCursor; assert.ok(++pages < 2000);
  } while (cursor);
  assert.equal(count, total); totals[group] = { count, pages };
}
const images = [];
for (const [url, meta] of covers) {
  const response = await fetch(new URL(url, base), { signal: AbortSignal.timeout(30_000) });
  const bytes = await response.arrayBuffer();
  images.push({ ...meta, status: response.status, type: response.headers.get("content-type"), bytes: bytes.byteLength });
}
assert.ok(images.some(image => image.status === 200 && /^image\//.test(image.type) && image.bytes > 100), "at least one real published cover loads through the image proxy");
console.log(JSON.stringify({ totals, images }, null, 2));
