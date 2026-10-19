import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import { after, mock, test } from "node:test";
import timersPromises from "node:timers/promises";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { config } from "@aihot/backend/config";
import { createArxivRequestGate } from "@aihot/backend/lib/arxiv-throttle";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { fetchListing } from "@aihot/backend/sources/listing-fetch";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function virtualClock() {
  let now = 0;
  const waiting = new Set<{ at: number; finish: () => void }>();
  return {
    now: () => now,
    wait: (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
      signal.throwIfAborted();
      const onAbort = () => { waiting.delete(timer); reject(signal.reason); };
      const timer = { at: now + ms, finish: () => { signal.removeEventListener("abort", onAbort); waiting.delete(timer); resolve(); } };
      waiting.add(timer);
      signal.addEventListener("abort", onAbort, { once: true });
    }),
    advance: async (ms: number) => {
      now += ms;
      for (const timer of waiting) if (timer.at <= now) timer.finish();
      await flush();
    },
  };
}

test("arXiv subdomains share one active response and three-second start spacing; other hosts do not wait", async () => {
  const clock = virtualClock();
  const gate = createArxivRequestGate(clock);
  const signal = new AbortController().signal;
  const first = await gate(new URL("https://export.arxiv.org/api/query"), signal);
  let secondStarted: number | null = null;
  const second = gate(new URL("https://rss.arxiv.org/rss/cs.IR"), signal).then((release) => { secondStarted = clock.now(); return release; });
  const other = await gate(new URL("https://arxiv.org.example.invalid/feed"), signal);
  other();
  await clock.advance(4_000);
  assert.equal(secondStarted, null, "the first body remains active beyond three seconds");
  first();
  const releaseSecond = await second;
  assert.equal(secondStarted, 4_000);
  releaseSecond();
  let thirdStarted: number | null = null;
  const third = gate(new URL("https://arxiv.org./abs/1234.56789"), signal).then((release) => { thirdStarted = clock.now(); return release; });
  await flush();
  await clock.advance(2_999);
  assert.equal(thirdStarted, null);
  await clock.advance(1);
  (await third)();
  assert.equal(thirdStarted, 7_000);
});

test("a cancelled queued request never overtakes the active response or poisons later requests", async () => {
  const clock = virtualClock();
  const gate = createArxivRequestGate(clock);
  const url = new URL("https://arxiv.org/abs/1234.56789");
  const signal = new AbortController().signal;
  const first = await gate(url, signal);
  const controller = new AbortController();
  const cancelled = gate(url, controller.signal);
  const rejected = assert.rejects(cancelled, /cancel queued/);
  controller.abort(new Error("cancel queued"));
  await rejected;
  let laterStarted = false;
  const later = gate(url, signal).then((release) => { laterStarted = true; return release; });
  await clock.advance(6_000);
  assert.equal(laterStarted, false);
  first();
  (await later)();
  assert.equal(laterStarted, true);
});

test("a request cancelled during the spacing delay consumes no request slot", async () => {
  const clock = virtualClock();
  const gate = createArxivRequestGate(clock);
  const url = new URL("https://rss.arxiv.org/rss/cs.IR");
  const signal = new AbortController().signal;
  (await gate(url, signal))();
  const controller = new AbortController();
  const cancelled = gate(url, controller.signal);
  const rejected = assert.rejects(cancelled, /cancel spacing/);
  await flush();
  controller.abort(new Error("cancel spacing"));
  await rejected;
  const later = gate(url, signal);
  await flush();
  await clock.advance(3_000);
  (await later)();
  assert.equal(clock.now(), 3_000);
});

const previousDispatcher = getGlobalDispatcher();
const previousPrivate = config.allowPrivateNetworkFetch;
const previousProxy = config.egressProxyUrl;
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);
config.allowPrivateNetworkFetch = true;
config.egressProxyUrl = null;
let networkClock = 0;
let holdWait = false;
const realWait = timersPromises.setTimeout;
mock.method(performance, "now", () => networkClock);
mock.method(timersPromises, "setTimeout", async (ms: number, value: unknown, options?: { signal?: AbortSignal }) => {
  if (holdWait) return realWait(ms, value, options);
  options?.signal?.throwIfAborted();
  networkClock += ms;
  return value;
});
syncBuiltinESMExports();
after(async () => {
  mock.restoreAll();
  syncBuiltinESMExports();
  config.allowPrivateNetworkFetch = previousPrivate;
  config.egressProxyUrl = previousProxy;
  setGlobalDispatcher(previousDispatcher);
  await agent.close();
});

test("actual redirect hops and transient listing retries use the shared gate; 429 is never retried", async () => {
  const starts: number[] = [];
  const record = () => { starts.push(networkClock); return "ok"; };
  agent.get("https://export.arxiv.org").intercept({ path: "/redirect" }).reply(302, record, { headers: { location: "https://rss.arxiv.org/redirected" } });
  agent.get("https://rss.arxiv.org").intercept({ path: "/redirected" }).reply(200, record);
  assert.equal((await guardedFetch("https://export.arxiv.org/redirect")).status, 200);
  agent.get("https://export.arxiv.org").intercept({ path: "/temporary" }).reply(503, record);
  agent.get("https://export.arxiv.org").intercept({ path: "/temporary" }).reply(200, record);
  assert.equal((await fetchListing("https://export.arxiv.org/temporary")).status, 200);
  let rateHits = 0;
  agent.get("https://arxiv.org").intercept({ path: "/rate" }).reply(429, () => { rateHits++; return record(); }).persist();
  assert.equal((await fetchListing("https://arxiv.org/rate")).status, 429);
  assert.equal(rateHits, 1);
  assert.equal(starts.length, 5);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i]! - starts[i - 1]! >= 3_000);
});

test("the original request deadline includes queue waiting, and an expired request never reaches the network", async () => {
  agent.get("https://arxiv.org").intercept({ path: "/timeout" }).reply(200, "must not be fetched");
  holdWait = true;
  try {
    await assert.rejects(guardedFetch("https://arxiv.org/timeout", { timeoutMs: 15 }), (error: Error) => error.name === "AbortError" || error.name === "TimeoutError");
  } finally { holdWait = false; }
  assert.equal(agent.pendingInterceptors().filter((item) => item.path === "/timeout").length, 1);
  agent.get("https://rss.arxiv.org").intercept({ path: "/after-timeout" }).reply(200, "works");
  assert.equal((await guardedFetch("https://rss.arxiv.org/after-timeout")).text(), "works");
});

test("response-body errors release the gate, and unrelated hosts bypass a pending arXiv delay", async () => {
  agent.get("https://arxiv.org").intercept({ path: "/too-large" }).reply(200, "large response");
  await assert.rejects(guardedFetch("https://arxiv.org/too-large", { maxBytes: 1 }), /Response too large/);
  const before = networkClock;
  agent.get("https://arxiv.org.example.invalid").intercept({ path: "/feed" }).reply(200, "other host");
  assert.equal((await guardedFetch("https://arxiv.org.example.invalid/feed")).text(), "other host");
  assert.equal(networkClock, before);
  agent.get("https://rss.arxiv.org").intercept({ path: "/after-body-error" }).reply(200, "recovered");
  assert.equal((await guardedFetch("https://rss.arxiv.org/after-body-error")).text(), "recovered");
  assert.ok(networkClock - before >= 3_000);
});
