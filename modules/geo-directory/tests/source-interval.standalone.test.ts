import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceCollectionWaitMs} from '../backend/collect-public.ts';

test('source intervals use persistent attempt time, including failures, and become due at the boundary', () => {
  const now = Date.parse('2026-10-17T00:00:00Z');
  assert.equal(sourceCollectionWaitMs(360, null, now), 0);
  assert.equal(sourceCollectionWaitMs(360, new Date(NaN), now), 0);
  assert.equal(sourceCollectionWaitMs(360, new Date(now - 30 * 60_000), now), 330 * 60_000);
  assert.equal(sourceCollectionWaitMs(120, new Date(now - 120 * 60_000), now), 0);
  assert.equal(sourceCollectionWaitMs(180, new Date(now - 181 * 60_000), now), 0);
  assert.equal(sourceCollectionWaitMs(NaN, new Date(now), now), 120 * 60_000);
});
