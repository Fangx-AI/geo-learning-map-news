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

test("a fragment URL reads only that entry of a longer page", () => {
  const url = "https://docs.example/updates";
  const entry = (month: string) => `<h2 id="${month.toLowerCase()}-2026">${month} 2026</h2><dl><dt>${month} 3</dt><dd><h3 id="${month}-a">Updated the ${month} guide</h3><p>${`What: the ${month} documentation now explains crawler controls and snippet options in more detail. `.repeat(3)}</p></dd></dl>`;
  const html = `<html><head><title>Search updates</title><link rel="canonical" href="${url}"></head><body><article><h1>Search updates</h1>${entry("October")}${entry("September")}</article></body></html>`;
  const reply = { status: 200, url, body: Buffer.from(html), headers: new Headers({ "content-type": "text/html" }), text: () => html };
  const article = extractReaderArticle(`${url}#october-2026`, reply);
  assert.match(article.text, /October documentation/);
  assert.match(article.text, /Updated the October guide/);
  assert.doesNotMatch(article.text, /September/);
  assert.throws(() => extractReaderArticle(`${url}#march-2026`, reply), /no-article-section/);
});
