import test from "node:test";
import assert from "node:assert/strict";
import { cleanSourceSummary, excerptAtSentence, makePublicSummary, summaryPlainText, PUBLIC_SUMMARY_VERSION } from "../backend/public-summary.ts";
import { extendedMetadataSummary, type SummaryOriginal } from "../backend/backfill-summaries.ts";

test("observed publisher footer removal is source-specific, retains original truncation and does not remove article prose",()=>{
  assert.equal(cleanSourceSummary("AI search changes. The post Test appeared first on Search Engine Journal .","https://searchenginejournal.com/feed","https://searchenginejournal.com/test"),"AI search changes.");
  assert.equal(cleanSourceSummary("Only 14.4% of results &#8230; Read more &#8250;","https://ahrefs.com/blog/feed/","https://ahrefs.com/blog/test/"),"Only 14.4% of results …");
  assert.equal(cleanSourceSummary("The results [&#8230;] L’article Test a été publié sur le site Abondance .","https://abondance.com/feed","https://abondance.com/test"),"The results […]");
  const prose="Our experiments show visitors Read more and compare sources.";
  assert.equal(cleanSourceSummary(prose,"https://ahrefs.com/feed","https://ahrefs.com/test"),prose);
  const unknown="AI search changes. The post Test appeared first on Search Engine Journal .";
  assert.equal(cleanSourceSummary(unknown,"https://elsewhere.example/feed","https://elsewhere.example/post"),unknown);
  for (const [host,publisher] of [["screamingfrog.co.uk","Screaming Frog"],["brodieclark.com","Brodie Clark Consulting"],["richsanger.com","Rich Sanger"],["mariehaynes.com","Marie Haynes"],["ipullrank.com","iPullRank"],["wordlift.io","WordLift Blog"]]) {
    assert.equal(cleanSourceSummary(`Measured 42% changes […] The post AI search experiment appeared first on ${publisher} .`,`https://${host}/feed`,`https://www.${host}/post`),"Measured 42% changes […]");
    assert.equal(cleanSourceSummary(`Measured 42% changes. The post AI search experiment appeared first on Another Site .`,`https://${host}/feed`,`https://${host}/post`),"Measured 42% changes. The post AI search experiment appeared first on Another Site .");
  }
  for(const type of ["new","replace","cross","replace-cross"])assert.equal(cleanSourceSummary(`arXiv:2606.19911v2 Announce Type: ${type} Abstract: Research with 42% improvement.`,"https://rss.arxiv.org/rss/cs.IR","https://arxiv.org/abs/2606.19911"),"Research with 42% improvement.");
});

test("version 2 removes exact Clarity and Oncrawl RSS templates and the Ahrefs arrow footer without deleting prose",()=>{
  assert.equal(PUBLIC_SUMMARY_VERSION,3);
  const clarity="Measure how your content shapes AI answers, with Topic Insights. Compare topic visibility, see competitor citations, and uncover opportunities.";
  const footer="The post Measure How AI Answers Use Your Content with Topic Insights in Microsoft Clarity appeared first on Understand your customers | Microsoft Clarity Blog .";
  assert.equal(cleanSourceSummary(`${clarity} ${footer}`,"https://clarity.microsoft.com/blog/feed/","https://clarity.microsoft.com/blog/topic-insights-announcement/"),clarity);
  // The publisher pipe must be literal, not a regular-expression alternative.
  for(const publisher of ["Understand your customers", "Microsoft Clarity Blog", "Understand your customers X Microsoft Clarity Blog"]){
    const text=`${clarity} The post Test appeared first on ${publisher} .`;
    assert.equal(cleanSourceSummary(text,"https://clarity.microsoft.com/blog/feed/","https://clarity.microsoft.com/blog/test/"),text);
  }
  const oncrawl="Six experts. Six myths about how search engines and AI systems actually work, and…";
  assert.equal(cleanSourceSummary(`${oncrawl} The post Myth vs Data: SEO in the AI era appeared first on Oncrawl .`,"https://www.oncrawl.com/feed/","https://www.oncrawl.com/ai/myth-vs-data/seo-ai-era/"),oncrawl);
  const ahrefs="35 practical ways to use Claude Code for SEO, from content briefs and Search Console analysis to internal linking and technical fixes, with real examples.";
  assert.equal(cleanSourceSummary(`${ahrefs} Read more ›`,"https://ahrefs.com/blog/feed/","https://ahrefs.com/blog/claude-code-for-seo/"),ahrefs);
  for(const text of ["A complete sentence. Read more", "A source excerpt … Read more", "People click Read more › and compare sources."])
    assert.equal(cleanSourceSummary(text,"https://ahrefs.com/blog/feed/","https://ahrefs.com/blog/test/"),text);
  const social="Why Generative Engine Optimization Is Now a Mainstream Marketing Priority read more : https://example.com/ #GEO";
  assert.equal(cleanSourceSummary(social,"https://mastodon.social/tags/GEO.rss","https://mastodon.social/@author/123"),social);
  const result=makePublicSummary({text:`${oncrawl} The post Myth vs Data: SEO in the AI era appeared first on Oncrawl .`,sourceUrl:"https://www.oncrawl.com/feed/",articleUrl:"https://www.oncrawl.com/ai/myth-vs-data/seo-ai-era/",origin:"rss"});
  assert.equal(result.summary,oncrawl);assert.match(result.summaryRaw!,/appeared first on Oncrawl/u);assert.equal(result.summaryVersion,PUBLIC_SUMMARY_VERSION);
});

test("SISTRIX's observed German footer is removed only from its own feed and keeps incomplete excerpts",()=>{
  const stem='Our observation: 47% of cited domains changed within 48 hours. […]';
  const footer='Der Beitrag ChatGPT Core Updates erschien zuerst auf SISTRIX .';
  assert.equal(cleanSourceSummary(`${stem} ${footer}`,'https://www.sistrix.com/feed/','https://www.sistrix.com/blog/chatgpt-core-update/'),stem);
  for(const [source,article] of [['https://other.example/feed','https://www.sistrix.com/post'],['https://www.sistrix.com/feed/','https://other.example/post']])
    assert.equal(cleanSourceSummary(`${stem} ${footer}`,source,article),`${stem} ${footer}`);
  for(const text of [`${stem} ${footer} This quote is discussed below.`,`${stem} Der Beitrag Research erschien zuerst auf Another Publisher .`])
    assert.equal(cleanSourceSummary(text,'https://www.sistrix.com/feed/','https://www.sistrix.com/post'),text);
  const result=makePublicSummary({text:`${stem} ${footer}`,sourceUrl:'https://www.sistrix.com/feed/',articleUrl:'https://www.sistrix.com/post',origin:'rss'});
  assert.equal(result.summary,stem);assert.equal(result.summaryRaw,`${stem} ${footer}`);assert.equal(result.summaryVersion,3);
});
test("HN link/vote metadata is not published as the linked article's content",()=>{
  const meta="Article URL: https://example.com/post Comments URL: https://news.ycombinator.com/item?id=1 Points: 42 # Comments: 8";
  assert.equal(cleanSourceSummary(meta,"https://hnrss.org/newest?q=GEO","https://example.com/post"),"");
  assert.equal(cleanSourceSummary(`We tested AI search. ${meta}`,"https://hnrss.org/newest?q=GEO","https://example.com/post"),"We tested AI search.");
});
test("sentence-aware excerpt uses a meaningful budget, does not turn a fragment into a complete claim, and bounds CJK",()=>{
  const text="Short intro. "+"A substantive finding with numbers 42% and 1,000 queries. ".repeat(30);
  const result=excerptAtSentence(text,900);
  assert.ok(result.length>500&&result.length<=900); assert.match(result,/queries\.\u2026$/u);
  const noSentence="A description "+"long explanatory words ".repeat(90);
  assert.ok(excerptAtSentence(noSentence,900).length>850);
  const cjk=makePublicSummary({text:"这是人工智能搜索引擎的研究资料".repeat(100),sourceUrl:"https://test.example/feed",articleUrl:"https://test.example/post",origin:"rss"});
  assert.equal([...cjk.summary!].length,450);assert.match(cjk.summary!,/…$/u);
  assert.ok((cjk.summaryRaw?.length??0)>450);
});
test("source provenance retains entities and raw text while display cleaning preserves scientific comparisons",()=>{
  const text="<p>AI search x &lt; y &gt; z &amp; 42%.</p>";
  const value=makePublicSummary({text,sourceUrl:"https://test.example/feed",articleUrl:"https://test.example/post",origin:"rss"});
  assert.equal(value.summaryRaw,text); assert.equal(value.summary,"AI search x < y > z & 42%.");
  assert.equal(summaryPlainText(value.summary!),value.summary);
  assert.equal(makePublicSummary({text:"",sourceUrl:"https://test.example/feed",articleUrl:"https://test.example/post",origin:"rss"}).summary,null);
});
test("metadata backfill only accepts a same-article extension, never unrelated text or redirected pages",()=>{
  const stem="AI search research with measured citations and original methods across representative prompts. ".repeat(4);
  const row:SummaryOriginal={id:"a".repeat(64),canonical_id:"b".repeat(64),source_id:"rss-test",title:"AI search",summary:stem+"…",language:"en",url:"https://test.example/post",summary_version:0};
  const html=`<link rel="canonical" href="/post"><meta name="description" content="${stem}We found an increase of 42% and report the full measurement limitations.">`;
  const result=extendedMetadataSummary(html,row,row.url);
  assert.ok(result?.summary?.includes("42%")); assert.equal(result?.summaryOrigin,"metadata");
  assert.equal(extendedMetadataSummary(html,row,"https://test.example/other"),null);
  assert.equal(extendedMetadataSummary(html.replace('href="/post"','href="/other"'),row,row.url),null);
  assert.equal(extendedMetadataSummary('<meta name="description" content="A different description">',row,row.url),null);
});
