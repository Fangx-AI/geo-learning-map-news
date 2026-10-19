import test from "node:test";
import assert from "node:assert/strict";
import { geoSourceStale } from "@aihot/backend/publication/geo-public";

const attempted = new Date("2026-10-17T00:00:00Z");
const afterMinutes = (minutes: number) => attempted.getTime() + minutes * 60_000;

test("scheduled sources stay healthy through their interval and one watcher cycle, then become stale", () => {
  for (const interval of [120, 180, 360, 1440]) {
    assert.equal(geoSourceStale(true, attempted, interval, afterMinutes(interval - 1)), false);
    assert.equal(geoSourceStale(true, attempted, interval, afterMinutes(interval)), false);
    assert.equal(geoSourceStale(true, attempted, interval, afterMinutes(interval + 30)), false);
    assert.equal(geoSourceStale(true, attempted, interval, afterMinutes(interval + 30) + 1), true);
  }
});

test("unknown and social intervals retain the existing two-hour rule; disabled sources are never stale", () => {
  for (const interval of [undefined, NaN, Infinity, 0, -10]) {
    assert.equal(geoSourceStale(true, attempted, interval, afterMinutes(120)), false);
    assert.equal(geoSourceStale(true, attempted, interval, afterMinutes(120) + 1), true);
  }
  assert.equal(geoSourceStale(true, null, 1440, afterMinutes(1)), true);
  assert.equal(geoSourceStale(true, new Date(NaN), 360, afterMinutes(1)), true);
  assert.equal(geoSourceStale(false, null, 360, afterMinutes(1)), false);
  assert.equal(geoSourceStale(false, attempted, 360, afterMinutes(10000)), false);
});
