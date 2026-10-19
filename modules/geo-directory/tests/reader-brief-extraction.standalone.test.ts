import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeDb } from "@aihot/backend/db";
import { extractReaderArticle } from "../backend/reader-brief-worker.ts";
after(closeDb);

test("article tables retain cell separators, row boundaries and headers with their evidence", () => {
  const url = "https://research.example/data";
  const html = `<html><head><title>AI search citation research</title></head><body><article><h1>AI search citation research</h1><p>${"We tested AI search queries and documented the methods, sample scope and cited URLs in the following table. ".repeat(3)}</p><table><thead><tr><th>Platform</th><th>Query count</th><th>Citations</th></tr></thead><tbody><tr><td>ChatGPT</td><td>100</td><td>200</td></tr><tr><td>Perplexity</td><td>80</td><td>175</td></tr></tbody></table><p>The results apply to these queries and platforms only.</p></article></body></html>`;
  const article = extractReaderArticle(url, { status: 200, url, body: Buffer.from(html), headers: new Headers({ "content-type": "text/html" }), text: () => html });
  const table = article.paragraphs.find(paragraph => paragraph.text.includes("Query count"));
  assert.ok(table);
  assert.equal(table.text, "Platform | Query count | Citations\nChatGPT | 100 | 200\nPerplexity | 80 | 175");
  assert.ok(!article.text.includes("100200"));
  assert.ok(!article.text.includes("80175"));
  assert.match(article.text, /The results apply/);
});
