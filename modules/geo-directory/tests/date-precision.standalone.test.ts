import test from 'node:test';
import assert from 'node:assert/strict';
import {preservePublicDatePrecision} from '../backend/public-dates.ts';
import type {PublicSource, PublicCandidate} from '../backend/public-source.ts';

const source: PublicSource = {id:'date-precision',name:'Research',kind:'web_list',config:{url:'https://research.example/'},sourceUrl:'https://research.example/',languageHint:'en',tier:'T1',participation_mode:'editorial',first_party:true,interval_minutes:360,enabled:true,cursor:null,fail_count:0,publicDatePrecision:'day'};
const item=(id:string,date:string|null,sourceId=source.id): PublicCandidate=>({id,canonicalId:id,title:'AI search research',url:`https://research.example/${id}`,summary:null,sourceId,sourceName:source.name,sourceUrl:source.sourceUrl,language:'en',publishedAt:date?new Date(date):null,matchedTerms:['AI search']});

test('day listings retain existing same-day precision, not another day, source, missing or new dates',async()=>{
  const input=[item('known','2025-07-22T00:00:00Z'),item('changed','2025-07-23T00:00:00Z'),item('new','2025-07-22T00:00:00Z'),item('missing',null),item('foreign','2025-07-22T00:00:00Z','other')];
  const prior=new Date('2025-07-22T13:54:17Z');
  const result=await preservePublicDatePrecision(input,source,async(ids,sourceId)=>{assert.equal(sourceId,source.id);assert.equal(ids.includes('foreign'),false);return new Map(['known','changed','missing','foreign'].map(id=>[id,prior]));});
  assert.equal(result[0].publishedAt?.toISOString(),prior.toISOString());
  for(let i=1;i<input.length;i++)assert.deepEqual(result[i],input[i]);
  assert.equal(input[0].publishedAt?.toISOString(),'2025-07-22T00:00:00.000Z');
  assert.equal(await preservePublicDatePrecision(input,{...source,publicDatePrecision:undefined},async()=>{throw new Error('no opt-in must not read cache');}),input);
});

test('configured source-day boundaries work across UTC and refuse to degrade dates when cache fails',async()=>{
  const input=[item('local','2025-07-21T16:00:00Z')];
  const output=await preservePublicDatePrecision(input,source,async()=>new Map([['local',new Date('2025-07-22T05:00:00Z')]]));
  assert.equal(output[0].publishedAt?.toISOString(),'2025-07-22T05:00:00.000Z');
  await assert.rejects(preservePublicDatePrecision(input,source,async()=>{throw new Error('cache unavailable');}),/cache unavailable/);
});
