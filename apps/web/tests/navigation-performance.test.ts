// Failure modes, fixed before changing public loaders or prefetch:
// - returning to a page that was already open still needs the network;
// - GEO daily queries or public cursors mix content on back navigation;
// - intent no longer loads data, scroll-through touches download it, or a failed prefetch breaks the current page;
// - visits renew deadlines, expired/errors stay cached, or refresh stops working;
// - Agent tabs choose an invalid panel or leave canonical/history behind;
// Timeline-specific unread, search-overlay and folded-day behaviours live in timeline-unread.test.ts.
// Reader work failures fixed before changing enhancement and return-position code:
// - offscreen code downloads/runs immediately, visible code stays plain, or raw copying changes;
// - tiny/linked pictures become zoom buttons, or language changes keep old handlers;
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { before, after, test } from "node:test";
import { chromium, webkit, expect, type Browser } from "@playwright/test";
import type { FeedItemSummary, SiteItemDetail } from "@aihot/contracts/site";
import { startWebServer, type WebServer } from "./web-server.ts";
import { geoOverview, geoFeed, geoStatus, geoItem, geoDaily } from "./geo-fixtures.ts";

const at = '2026-10-04T08:00:00.000Z';
const item: FeedItemSummary = {id:'navigation-fixture',title:'性能检查文章',summary:'固定摘要',reason:'固定推荐理由',source:{name:'Fixture'},publishedAt:at,timelineAt:at,category:'platform-updates',tags:[],score:80,selected:true,channel:'news',x:null};
const detail: SiteItemDetail = {...item,x:null,originalTitle:'Fixture article',links:{original:'https://example.org/article'},discoveredAt:at,story:null,readingMode:'full',author:null,body:{zh:'<p>固定正文</p>',original:null,zhKind:'translation',complete:true},outline:[],relatedStories:[],topics:[],indexable:true,markdownAvailable:true,group:null,hasTranslation:true,bodyLanguage:'zh'};
const codeSource='import json\n\nwith open("data.json") as file:\n    data = json.load(file)\n\nfor record in data:\n    print(record["title"])\n';
const readerBody=Array.from({length:30},(_,i)=>`<p>阅读段落 ${i}：先阅读文章，再查看后面的代码和图片。正文保持可读，图片和代码在需要时增强。</p>`).join('')
  +`<pre><code>${codeSource}</code></pre><pre><code>x = 1</code></pre>`
  +Array.from({length:12},(_,i)=>`<img src="/reader-image/${i}.svg" alt="正文配图 ${i}" width="640" height="360" loading="lazy">`).join('')
  +'<img src="/reader-image/tiny.svg" alt="小图标" width="16" height="16" loading="lazy"><a href="https://example.org"><img src="/reader-image/linked.svg" alt="链接图片" width="640" height="360" loading="lazy"></a>';
const hits: string[] = [];
let failing='';
let ttl=60;
let web:WebServer;
let origin:string;
let chrome:Browser;
let safari:Browser;
const api=createServer((req,res)=>{
  const url=new URL(req.url!,'http://local');
  const p=url.pathname;
  res.setHeader('Content-Type','application/json');
  if(p==='/api/site/meta') return res.end(JSON.stringify({changelogVersion:'fixture'}));
  if(p==='/api/site/track'){res.statusCode=204;return res.end();}
  hits.push(req.url!);
  if(p===failing){res.statusCode=503;return res.end(JSON.stringify({code:'unavailable'}));}
  if(p==='/api/health')return res.end('{}');
  if(p==='/api/geo/daily'){
    res.setHeader('X-Accel-Expires','@'+(Math.floor(Date.now()/1000)+ttl));
    return res.end(JSON.stringify(geoDaily()));
  }
  if(p==='/api/geo/overview'){
    res.setHeader('X-Accel-Expires','@'+(Math.floor(Date.now()/1000)+ttl));
    return res.end(JSON.stringify(geoOverview({selectedDay:url.searchParams.get('day')||'2026-10-04'})));
  }
  if(p==='/api/geo/public-items'){
    const second=url.searchParams.get('cursor')==='p2';
    return res.end(JSON.stringify(geoFeed({items:[geoItem({title:second?'全部第 2 页':'全部第 1 页'})],nextCursor:second?null:'p2',total:2})));
  }
  if(p==='/api/geo/collection-status')return res.end(JSON.stringify(geoStatus));
  if(p==='/api/site/items/navigation-fixture')return res.end(JSON.stringify(detail));
  if(p==='/api/site/items/navigation-fixture/original')return res.end(JSON.stringify({...detail,body:{zh:null,original:'<p>Original fixture</p>',zhKind:null,complete:true},bodyLanguage:'original'}));
  if(p==='/api/site/items/reader-fixture')return res.end(JSON.stringify({...detail,id:'reader-fixture',title:'阅读增强检查',body:{...detail.body,zh:readerBody}}));
  if(p==='/api/site/items/reader-fixture/original')return res.end(JSON.stringify({...detail,id:'reader-fixture',title:'阅读增强检查',body:{...detail.body,zh:null,original:'<p>Original reader text</p>'},bodyLanguage:'original'}));
  res.statusCode=404;res.end(JSON.stringify({code:'not_found'}));
});

before(async()=>{
  // Started together; whatever started is stopped in after() even when another one failed.
  const started=await Promise.allSettled([
    startWebServer(api).then(w=>{web=w;origin=w.origin;}),
    chromium.launch({channel:'chromium'}).then(b=>{chrome=b;}),
    webkit.launch().then(b=>{safari=b;}),
  ]);
  for(const result of started)if(result.status==='rejected')throw result.reason;
});
after(async()=>{
  await chrome?.close();await safari?.close();
  await web?.stop();
});

// One engine per behaviour: WebKit for what phone readers do (iPhone Safari), Chromium for desktop-only
// intent such as hover. The router and caches are the same code in both.
test('GEO overview and daily query variants return offline without another read',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  try{
    await page.goto(origin+'/');
    await page.getByRole('link',{name:'按日期看',exact:true}).click();
    await expect(page.getByRole('heading',{name:'按日期看资讯',level:1,exact:true})).toBeVisible();
    await context.setOffline(true);await page.goBack();
    await expect(page.getByRole('heading',{name:'今日 GEO 资讯',exact:true})).toBeVisible({timeout:1500});
    await context.setOffline(false);await page.goto(origin+'/daily?day=2026-10-03');
    await page.getByLabel('选择日期').fill('2026-10-04');
    await page.getByRole('button',{name:'查看日报',exact:true}).click();
    await expect(page.getByRole('heading',{name:'2026-10-04 · 1 条资料',exact:true})).toBeVisible();
    await context.setOffline(true);await page.goBack();
    await expect(page.getByRole('heading',{name:'2026-10-03 · 1 条资料',exact:true})).toBeVisible({timeout:1500});
    await expect(page.getByLabel('选择日期')).toHaveValue('2026-10-03');
  }finally{await context.close();}
});

test('intent prefetch reuses GEO data; scrolling touches and failures leave the current page intact',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.goto(origin+'/about');
    const link=page.getByRole('link',{name:'读今日资讯',exact:true});
    const start=hits.length;
    await link.dispatchEvent('touchstart');await link.dispatchEvent('touchmove');
    await page.locator('h1').click();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/geo/daily')).length,0);
    const response=page.waitForResponse(r=>r.url().includes('.data'));
    await link.hover();await response;
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/geo/daily')).length,1);
    await link.click();await expect(page.getByRole('heading',{name:'今日 GEO 资讯',exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/geo/daily')).length,1,'navigation reuses intent-prefetched data');
    const fresh=await chrome.newContext();const freshPage=await fresh.newPage();
    try{
      await freshPage.goto(origin+'/about');failing='/api/geo/daily';
      const failed=freshPage.waitForResponse(r=>r.url().includes('.data')&&r.status()===503);
      await freshPage.getByRole('link',{name:'读今日资讯',exact:true}).hover();await failed;
      await expect(freshPage).toHaveURL(origin+'/about');
      await expect(freshPage.locator('h1')).toBeVisible();
    }finally{await fresh.close();}
  }finally{failing='';await context.close();}
});

test('public cursor pages and daily/topics return offline with their own content',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.goto(origin+'/all');
    await page.getByRole('link',{name:'下一页 →',exact:true}).click();
    await expect(page.getByRole('link',{name:'全部第 2 页',exact:false})).toBeVisible();
    await context.setOffline(true);await page.goBack();
    await expect(page.getByRole('link',{name:'全部第 1 页',exact:false})).toBeVisible({timeout:1500});
    await context.setOffline(false);await page.goto(origin+'/daily');
    await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'深度解读',exact:true}).click();
    await expect(page.getByRole('heading',{name:'深度解读',level:1,exact:true})).toBeVisible();
    await context.setOffline(true);
    await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'首页',exact:true}).click();
    await expect(page.getByRole('heading',{name:'今日 GEO 资讯',exact:true})).toBeVisible({timeout:1500});
  }finally{await context.close();}
});

test('focusing visited navigation does not evict a still-valid page result',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  const requests:string[]=[];
  await context.route('**/*.data*',route=>route.continue());
  page.on('request',request=>{if(request.url().includes('.data'))requests.push(request.url());});
  const nav=()=>page.getByRole('navigation',{name:'主导航'});
  try{
    await page.goto(origin+'/');
    await nav().getByRole('link',{name:'深度解读',exact:true}).click();
    await expect(page.getByRole('heading',{name:'深度解读',level:1,exact:true})).toBeVisible();
    await nav().getByRole('link',{name:'深度解读',exact:true}).focus();
    await page.waitForTimeout(150);
    await nav().getByRole('link',{name:'首页',exact:true}).click();
    await expect(page.getByRole('heading',{name:'今日 GEO 资讯',exact:true})).toBeVisible();
    await nav().getByRole('link',{name:'首页',exact:true}).focus();
    await page.waitForTimeout(150);
    const before=requests.length;
    await nav().getByRole('link',{name:'深度解读',exact:true}).click();
    await expect(page.getByRole('heading',{name:'深度解读',level:1,exact:true})).toBeVisible();
    assert.deepEqual(requests.slice(before),[],'navigation keeps a still-valid visited page');
  }finally{await context.close();}
});

test('a revisit never renews its original deadline; expiry shows failure and reload retries',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.clock.install();ttl=2;
    await page.goto(origin+'/');
    await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'深度解读',exact:true}).click();
    await expect(page.getByRole('heading',{name:'深度解读',level:1,exact:true})).toBeVisible();
    failing='/api/geo/daily';
    await page.clock.runFor(2500);
    await page.goBack();await expect(page.getByRole('heading',{name:'暂时无法加载',exact:true})).toBeVisible();
    failing='';ttl=60;
    await page.reload();await expect(page.getByRole('heading',{name:'今日 GEO 资讯',exact:true})).toBeVisible();
  }finally{ttl=60;failing='';await context.close();}
});

test('SSR freshness spent upstream is not renewed by GEO HTML hydration',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    ttl=0;await page.goto(origin+'/');
    await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'最新资讯',exact:true}).click();
    await expect(page.getByRole('heading',{name:'最新资讯',level:1,exact:true})).toBeVisible();
    const start=hits.length;ttl=60;
    await page.goBack();await expect(page.getByRole('heading',{name:'今日 GEO 资讯',exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/geo/daily')).length,1);
  }finally{ttl=60;await context.close();}
});

test('Agent tabs finish offline with matching canonical; invalid direct tabs and anchored links keep a panel',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.goto(origin+'/agent');
    await context.setOffline(true);
    await page.getByRole('tablist',{name:'接入方式'}).getByRole('tab',{selected:true}).click();
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    for(const [tab,name] of [['mcp',/^MCP/],['rss',/^RSS/],['api',/^REST API/]] as const){
      const choice=page.getByRole('tab',{name});
      // The active track was exercised above; compare navigation through every remaining track.
      if(await choice.getAttribute('aria-selected')==='true')continue;
      const target=await choice.getAttribute('href');
      await choice.click();
      await expect(page).toHaveURL(origin+target,{timeout:1500});
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',origin+target);
      await expect(page.locator('#agent-panel')).toHaveAttribute('aria-labelledby','agent-tab-'+tab);
      await expect(page.locator('#agent-panel')).not.toBeEmpty();
    }
    await context.setOffline(false);
    await page.goto(origin+'/agent?tab=unknown');
    await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    await page.goto(origin+'/agent#agent-api-recovery');
    await expect(page.locator('#agent-api-recovery')).toBeVisible();
  }finally{await context.close();}
});

test('reader enhancements wait for visible code and update only the picture that loaded',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const scripts:string[]=[];page.on('request',r=>{if(r.url().includes('/assets/')&&r.url().includes('highlight-'))scripts.push(r.url());});
  await page.route('**/reader-image/*.svg',route=>route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${route.request().url().endsWith('/tiny.svg')?16:640}" height="360"><rect width="640" height="360" fill="red"/></svg>`}));
  try{
    await page.goto(origin+'/items/reader-fixture');
    await expect(page.getByRole('heading',{name:'阅读增强检查',exact:true})).toBeVisible();
    await expect(page.locator('.code-block-copy')).toHaveCount(2);
    assert.deepEqual(scripts,[],'reading the introduction must not download the offscreen highlighter');
    const source=page.locator('.prose pre code').first();
    assert.equal(await source.textContent(),codeSource);
    await source.scrollIntoViewIfNeeded();
    await expect(source).toHaveClass(/hljs/);
    assert.equal(await source.textContent(),codeSource,'colouring preserves the copyable text');
    assert.equal(scripts.length,1);
    await page.locator('.code-block-copy').first().click();
    await expect(page.locator('.code-block-copy').first()).toHaveText('已复制');
    assert.equal(await page.locator('.prose pre code').nth(1).textContent(),'x = 1');
    for(let i=0;i<12;i++){
      const picture=page.locator(`.prose img[alt="正文配图 ${i}"]`);
      await picture.scrollIntoViewIfNeeded();
      await expect(picture).toHaveAttribute('role','button');
    }
    const tiny=page.locator('.prose img[alt="小图标"]');await tiny.scrollIntoViewIfNeeded();
    await expect(tiny).not.toHaveAttribute('role','button');
    await expect(page.locator('.prose a img')).not.toHaveAttribute('role','button');
    await page.getByRole('navigation',{name:'正文语言'}).getByRole('link',{name:'原文',exact:true}).click();
    await expect(page.getByText('Original reader text',{exact:true})).toBeVisible();
    assert.equal(await page.locator('.code-block-copy').count(),0);
  }finally{await context.close();}
});
