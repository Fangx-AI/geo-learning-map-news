import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {sql,closeDb} from '@aihot/backend/db';
import {repairCachedTranslations,type TranslationReference} from '../backend/repair-translations.ts';
import {translationHash} from '../backend/translate-public.ts';
after(closeDb);

test('cache repair previews safely, edits only exact source versions and requeues omitted prose',async()=>{
  await sql`INSERT INTO geo_public_source_status (source_id,source_name,source_url) VALUES ('repair','Research','https://example.com')`;
  const inputs=[
    {id:'repair-terms',title:'Gemini and Google AI search',summary:'Generative Engine Optimization research',language:'en'},
    {id:'repair-prefix',title:'帖文节选｜New on my Substack: Google AI search',summary:null,language:'en'},
    {id:'repair-edited',title:'AI search results increased 25%',summary:'An experiment.',language:'en'},
  ];
  for(const input of inputs){
    await sql`INSERT INTO geo_public_items (id,title,summary,language,url,source_id,source_name,source_url)
      VALUES (${input.id},${input.title},${input.summary},${input.language},${'https://example.com/'+input.id},'repair','Research','https://example.com')`;
    const title=input.id==='repair-terms'?'双子座和谷歌AI搜索':input.id==='repair-prefix'?'帖文节选｜New on my Substack: 谷歌AI搜索':'AI 搜索结果增长 25%';
    await sql`INSERT INTO geo_public_translations(item_id,content_hash,title_original,summary_original,language_original,title_zh,summary_zh,status,provider)
      VALUES (${input.id},${translationHash(input)},${input.title},${input.summary},${input.language},${title},${input.summary?'生成引擎优化研究':null},'done','bing')`;
  }
  const source=inputs[2];
  const reference:TranslationReference={itemId:source.id,contentHash:translationHash(source),originalTitle:source.title,originalSummary:source.summary,originalLanguage:source.language,
    referenceTitle:'AI 搜索结果增加了 25%',referenceSummary:'一项实验。',publishable:true};
  const preview=await repairCachedTranslations({references:[reference]});
  assert.equal(preview.normalized,1);assert.equal(preview.requeued,1);assert.equal(preview.edited,1);
  assert.equal((await sql`SELECT title_zh FROM geo_public_translations WHERE item_id='repair-terms'`)[0].title_zh,'双子座和谷歌AI搜索');
  await repairCachedTranslations({write:true,references:[reference]});
  const fixed=await sql`SELECT item_id,title_zh,summary_zh,status,provider FROM geo_public_translations ORDER BY item_id`;
  assert.equal(fixed.find(row=>row.item_id==='repair-terms')?.summary_zh,'生成式引擎优化研究');
  assert.equal(fixed.find(row=>row.item_id==='repair-prefix')?.status,'error');
  assert.equal(fixed.find(row=>row.item_id==='repair-prefix')?.title_zh,null);
  assert.equal(fixed.find(row=>row.item_id==='repair-edited')?.provider,'geo-edited-v2');
  const again=await repairCachedTranslations({write:true,references:[reference]});
  assert.equal(again.normalized+again.edited+again.requeued,0);
  await sql`UPDATE geo_public_items SET summary='A revised experiment.' WHERE id='repair-edited'`;
  assert.equal((await repairCachedTranslations({write:true,references:[reference]})).edited,0);
  await assert.rejects(repairCachedTranslations({references:[{...reference,referenceTitle:'AI 搜索结果增加了 30%'}]}),/Invalid translation reference/);
});
