import test from 'node:test';
import assert from 'node:assert/strict';
import {collectorWaitMs} from '../backend/collector-runtime.ts';

test('a restarted watcher preserves waiting, retry and stopped schedules, but never delays a fresh or expired cycle',()=>{
  const now=Date.parse('2026-10-17T00:00:00Z');
  for(const state of ['waiting','retrying','stopped']) {
    assert.equal(collectorWaitMs(state,new Date(now+30*60_000),now),30*60_000);
    assert.equal(collectorWaitMs(state,new Date(now),now),0);
    assert.equal(collectorWaitMs(state,new Date(now-60_000),now),0);
    assert.equal(collectorWaitMs(state,new Date(NaN),now),0);
    assert.equal(collectorWaitMs(state,null,now),0);
  }
  for(const state of ['running','idle']) assert.equal(collectorWaitMs(state,new Date(now+60_000),now),0);
});

test('graceful restarts resume the original deadline instead of resetting the interval',()=>{
  const start=Date.parse('2026-10-17T00:00:00Z');
  const deadline=new Date(start+30*60_000);
  assert.equal(collectorWaitMs('waiting',deadline,start),30*60_000);
  assert.equal(collectorWaitMs('stopped',deadline,start+10*60_000),20*60_000);
  assert.equal(collectorWaitMs('stopped',deadline,start+25*60_000),5*60_000);
  assert.equal(collectorWaitMs('stopped',deadline,start+30*60_000),0);
  assert.equal(collectorWaitMs('stopped',null,start),0);
});
