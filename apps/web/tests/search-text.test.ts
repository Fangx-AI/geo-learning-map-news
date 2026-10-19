import assert from "node:assert/strict";
import { test } from "node:test";
import { highlightedParts, hasSearchMatch, searchExcerpt } from "../../../modules/geo-directory/web/search-text.ts";

test("search highlighting preserves literal Unicode and treats regex/HTML syntax as text", () => {
  const text = "GEO 中文 C++ [GEO] (.*) <img src=x onerror=alert(1)>";
  const parts = highlightedParts(text, ["C++", "[GEO]", "(.*)", "<img"]);
  assert.equal(parts.map(part => part.text).join(""), text);
  assert.deepEqual(parts.filter(part => part.match).map(part => part.text), ["C++", "[GEO]", "(.*)", "<img"]);
  assert.equal(hasSearchMatch("everything", "(.*)"), false);
  assert.equal(hasSearchMatch("生成式 引用研究", "引用研究"), true);
});

test("quoted phrases remain whole, longest overlapping terms win, and empty queries do not highlight", () => {
  assert.deepEqual(highlightedParts("AI search meets AI and search", '"AI search"').filter(part => part.match).map(part => part.text), ["AI search"]);
  assert.deepEqual(highlightedParts("GEO generative engine", ["generative", "generative engine"]).filter(part => part.match).map(part => part.text), ["generative engine"]);
  assert.deepEqual(highlightedParts("No query", "  "), [{ text: "No query", match: false }]);
});

test("collapsed-card excerpts keep a late summary match visible without altering it", () => {
  const text = "前文".repeat(130) + "AI search citation evidence" + "后文".repeat(130);
  const excerpt = searchExcerpt(text, ["AI search"]);
  assert.ok(excerpt.startsWith("…") && excerpt.endsWith("…"));
  assert.ok(excerpt.includes("AI search citation evidence"));
  assert.ok(excerpt.length <= 182);
  assert.equal(searchExcerpt("完整短摘要", ["短摘要"]), "完整短摘要");
});
