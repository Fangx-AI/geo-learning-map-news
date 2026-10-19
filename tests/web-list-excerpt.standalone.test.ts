import test from "node:test";
import assert from "node:assert/strict";
import { fromHtml } from "@aihot/backend/sources/web-list";
import { unsupportedConfig } from "@aihot/backend/sources/config-keys";
import type { SourceRow } from "@aihot/backend/sources/types";

const config = { url: "https://publisher.example/blog", parseMode: "html", itemSelector: "article.blog_item-link", linkSelector: "a.blog_post-title-wrapper", titleSelector: ".blog_item-title", publishedAtSelector: ".blog_date", publishedAtUtcOffset: "+00:00" };
const source = (config: SourceRow['config']): SourceRow => ({ id:'listing-fixture',name:'Listing',kind:'web_list',config,tier:'T2',participation_mode:'editorial',first_party:false,interval_minutes:120,enabled:true,cursor:null,fail_count:0 });
// Authoritas uses one article card per item with a separate .blog_summary, title and date.
const html = `<p class="blog_summary">Outside the article: subscribe now</p>
  <article class="blog_item-link"><a class="blog_post-title-wrapper" href="/blog/research"><h2 class="blog_item-title">AI search experiment</h2></a><time class="blog_date">2025-12-15</time><p class="blog_summary">We tested <b>9 models</b> &amp; reported failures.<br>Limits remain.<script>ignore()</script><style>.ad{}</style></p><p class="blog_summary">A second node must not be joined</p></article>
  <article class="blog_item-link"><a class="blog_post-title-wrapper" href="/blog/empty"><h2 class="blog_item-title">Another experiment</h2></a><p class="blog_summary"> </p></article>
  <article class="blog_item-link"><a class="blog_post-title-wrapper" href="/blog/missing"><h2 class="blog_item-title">A third experiment</h2></a></article>`;
test("HTML excerpts stay within each card and never borrow other cards, navigation or script text", () => {
  const baseline = fromHtml(html,config.url,source(config));
  const output = fromHtml(html,config.url,source({...config,excerptSelector:'.blog_summary'}));
  assert.equal(output[0].excerpt,"We tested 9 models & reported failures. Limits remain.");
  assert.deepEqual(output.map(({excerpt,...row})=>row),baseline);
  assert.equal(output[0].publishedAt?.toISOString(),"2025-12-15T00:00:00.000Z");
  assert.equal(output[1].excerpt,undefined); assert.equal(output[2].excerpt,undefined);
  assert.equal(output[0].bodyText,undefined); assert.equal(output[0].bodyHtml,undefined);
});
test("excerpt selection is explicitly enabled only for HTML web listings", () => {
  assert.deepEqual(unsupportedConfig('web_list',{...config,excerptSelector:'.blog_summary'}),[]);
  for(const excerptSelector of [null,12,'','   ']) assert.deepEqual(unsupportedConfig('web_list',{excerptSelector}),['excerptSelector']);
  assert.deepEqual(unsupportedConfig('rss',{excerptSelector:'.summary'}),['excerptSelector']);
  const output=fromHtml('<a href="/post">Inline excerpt</a>',config.url,source({url:config.url,itemSelector:'a',excerptSelector:'a'}));
  assert.equal(output[0].excerpt,'Inline excerpt');
});
