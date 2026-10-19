import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchRss } from "@aihot/backend/sources/rss";
const description="AI search methods and measured 42% citation results. ".repeat(200);
const requests:Array<string|undefined>=[];
const server=http.createServer((req,res)=>{
  requests.push(req.headers["if-none-match"] as string|undefined);
  if(req.headers["if-none-match"]==='"same"'){res.writeHead(304);res.end();return;}
  res.setHeader("etag",'"same"');res.setHeader("content-type","application/rss+xml");
  res.end(req.url==="/atom"?`<feed xmlns="http://www.w3.org/2005/Atom"><title>Research</title><entry><id>1</id><title>AI search</title><link href="https://research.example/post"/><summary type="text">Comparison x &lt; y &gt; z. ${description}</summary></entry></feed>`:`<rss version="2.0"><channel><title>Research</title><item><title>AI search</title><link>https://research.example/post</link><description><![CDATA[<p>${description}</p>]]></description></item></channel></rss>`);
});
await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
const previous=config.allowPrivateNetworkFetch;config.allowPrivateNetworkFetch=true;
after(async()=>{config.allowPrivateNetworkFetch=previous;await new Promise<void>(resolve=>server.close(()=>resolve()));});
test("public summary metadata is opt-in, bounded and invalidates an old feed validator",async()=>{
 const source={config:{feedUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/rss`},participation_mode:"editorial"};
 const old=await fetchRss(source as never);assert.equal((old.candidates[0].raw as Record<string,unknown>).summaryOriginalText,undefined);assert.equal(old.candidates[0].excerpt?.length,2000);
 const fresh=await fetchRss({...source,cursor:{rss:old.validator}} as never,{includeSummaryMetadata:true});
 assert.equal(requests[1],undefined);assert.equal((fresh.candidates[0].raw as Record<string,unknown>).summaryOriginalText,description.trim().slice(0,8000));assert.equal(fresh.candidates[0].excerpt?.length,2000);
 const cached=await fetchRss({...source,cursor:{rss:fresh.validator}} as never,{includeSummaryMetadata:true});assert.equal(cached.notModified,true);
 const atom=await fetchRss({...source,config:{feedUrl:source.config.feedUrl.replace('/rss','/atom')}} as never,{includeSummaryMetadata:true});assert.match(String((atom.candidates[0].raw as Record<string,unknown>).summaryOriginalText),/^Comparison x < y > z\./);
});
