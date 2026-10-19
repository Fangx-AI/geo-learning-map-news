import test from "node:test";
import assert from "node:assert/strict";
import { geoReaderHref, safeReaderReturnTo } from "../web/reader-links.ts";

test("reader addresses retain the originating list filters and cursor, without mixing their query strings", () => {
  const from = "/all?q=AI+search&source=research&cursor=next%2Fpage%3D&group=none";
  const url = new URL(geoReaderHref("a".repeat(64), from), "https://reader.invalid");
  assert.equal(url.pathname, "/read/" + "a".repeat(64));
  assert.equal(url.searchParams.get("from"), from);
  assert.equal(url.searchParams.size, 1);
  for (const list of ["/", "/hot", "/starred", "/daily/2026-10-17", "/daily/archive", "/topics/tool-releases", "/topics/research/page/2"])
    assert.equal(safeReaderReturnTo(list), list);
  assert.equal(safeReaderReturnTo("/all#old-position"), "/all");
});

test("shared reader links cannot send the return action outside reading lists", () => {
  for (const from of [undefined, null, "", "https://outside.example/", "//outside.example/", "/\\outside.example/", "/all\n", "/admin", "/read/abc", "/api/health", "/all/../admin", "/%2f%2foutside.example/", "javascript:alert(1)"])
    assert.equal(safeReaderReturnTo(from), "/all", String(from));
  assert.equal(new URL(geoReaderHref("../untrusted?x=1", "//outside.example"), "https://reader.invalid").searchParams.get("from"), "/all");
});
