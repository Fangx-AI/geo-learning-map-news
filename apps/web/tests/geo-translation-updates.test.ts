import assert from "node:assert/strict";
import { test } from "node:test";

let instance = 0;
const item = (n = 1) => ({ id: n.toString(16).padStart(64, "0"), title: `Original ${n}`, summary: "Original excerpt", language: "en" });
const translation = { title: "中文标题", summary: "中文摘要", language: "zh", provider: "hy-mt2-local" };
const progress = { total: 2, translated: 1, pending: 1, retrying: 0, state: "running", updatedAt: "2026-10-16T12:00:00Z", retryAt: null };
async function fixture() {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document"); const oldFetch = globalThis.fetch;
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  const calls: string[] = []; let status: unknown = { ...progress }; let rows: unknown[] = []; let statusCode = 200;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    return Response.json(url.includes("translation-status") ? status : { items: rows }, { status: url.includes("translation-status") ? statusCode : 200 });
  }) as typeof fetch;
  const updates: typeof import("../../../modules/geo-directory/web/translation-updates.ts") = await import(`../../../modules/geo-directory/web/translation-updates.ts?test=${instance++}`);
  const dispose: Array<() => void> = [];
  return {
    updates, calls, document,
    rows: (value: unknown[]) => { rows = value; }, status: (value: unknown) => { status = value; }, fail: () => { statusCode = 503; },
    watch: (value = item(), listener = () => {}, legacyDecoded = false) => { dispose.push(updates.subscribeTranslation(value, listener, legacyDecoded)); },
    statusWatch: () => { dispose.push(updates.subscribeTranslationStatus(() => {})); },
    close: () => { for (const unsubscribe of dispose) unsubscribe(); globalThis.fetch = oldFetch; if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument); else Reflect.deleteProperty(globalThis, "document"); },
  };
}

test("live updates share one status poll, deduplicate cards and do not refetch unchanged translations", async () => {
  const f = await fixture();
  try {
    let notified = 0;
    f.watch(item(), () => notified++); f.watch(); f.statusWatch();
    f.rows([{ ...item(), translation }]);
    await f.updates.refreshTranslations();
    assert.deepEqual(f.updates.translationSnapshot(item()), translation);
    assert.equal(notified, 1);
    assert.equal(f.calls.length, 2);
    assert.equal(new URL(f.calls[1]!, "https://local").searchParams.get("ids"), item().id);
    await f.updates.refreshTranslations();
    assert.equal(f.calls.length, 3, "unchanged version needs only the lightweight status check");
    assert.equal(notified, 1);
    f.status({ ...progress, updatedAt: "2026-10-16T12:01:00Z" });
    f.rows([{ ...item(), translation: { ...translation, title: "更新后的中文标题" } }]);
    await f.updates.refreshTranslations();
    assert.equal(f.updates.translationSnapshot(item())?.title, "更新后的中文标题");
    assert.equal(notified, 2);
  } finally { f.close(); }
});

test("a translation for changed original title, summary or language cannot attach to an older card", async () => {
  const f = await fixture();
  try {
    f.watch();
    f.rows([
      { ...item(), title: "Edited original", translation },
      { ...item(), summary: "Edited excerpt", translation },
      { ...item(), language: "fr", translation },
      { ...item(2), translation },
    ]);
    await f.updates.refreshTranslations();
    assert.equal(f.updates.translationSnapshot(item()), undefined);
  } finally { f.close(); }
});

test("incomplete translations are ignored and an explicit valid null clears a revoked translation", async () => {
  const f = await fixture();
  try {
    f.watch(); f.rows([{ ...item(), translation: { ...translation, summary: null } }]);
    await f.updates.refreshTranslations();
    assert.equal(f.updates.translationSnapshot(item()), undefined);
    f.status({ ...progress, updatedAt: "2026-10-16T12:01:00Z" }); f.rows([{ ...item(), translation }]);
    await f.updates.refreshTranslations();
    assert.deepEqual(f.updates.translationSnapshot(item()), translation);
    f.status({ ...progress, updatedAt: "2026-10-16T12:02:00Z" }); f.rows([{ ...item(), translation: null }]);
    await f.updates.refreshTranslations();
    assert.equal(f.updates.translationSnapshot(item()), null);
  } finally { f.close(); }
});

test("hidden pages make no requests and failed status checks retain already readable text", async () => {
  const f = await fixture();
  try {
    f.document.visibilityState = "hidden"; f.watch(); f.statusWatch(); f.rows([{ ...item(), translation }]);
    await f.updates.refreshTranslations(); assert.equal(f.calls.length, 0);
    f.document.visibilityState = "visible";
    await f.updates.refreshTranslations();
    assert.equal(f.updates.translationStatusSnapshot()?.translated, 1);
    f.fail(); await f.updates.refreshTranslations();
    assert.equal(f.updates.translationStatusSnapshot(), null, "do not claim running while status is unavailable");
    assert.deepEqual(f.updates.translationSnapshot(item()), translation);
  } finally { f.close(); }
});

test("a timed-out status request hides stale progress without losing readable translations", async t => {
  const f = await fixture();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    f.watch(); f.statusWatch(); f.rows([{ ...item(), translation }]);
    await f.updates.refreshTranslations();
    assert.equal(f.updates.translationStatusSnapshot()?.state, "running");
    globalThis.fetch = ((_input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
    })) as typeof fetch;
    const refresh = f.updates.refreshTranslations();
    t.mock.timers.tick(10000);
    await refresh;
    assert.equal(f.updates.translationStatusSnapshot(), null);
    assert.deepEqual(f.updates.translationSnapshot(item()), translation);
  } finally { f.close(); t.mock.timers.reset(); }
});

test("more than 100 loaded records are batched and original records are never modified", async () => {
  const f = await fixture();
  try {
    const originals = Array.from({ length: 101 }, (_, n) => item(n + 1));
    const before = structuredClone(originals);
    for (const original of originals) f.watch(original);
    f.rows(originals.map(original => ({ ...original, translation })));
    await f.updates.refreshTranslations();
    const batches = f.calls.filter(url => url.includes("translations?")).map(url => new URL(url, "https://local").searchParams.get("ids")!.split(","));
    assert.deepEqual(batches.map(batch => batch.length), [100, 1]);
    assert.equal(new Set(batches.flat()).size, 101);
    assert.deepEqual(originals, before);
    assert.deepEqual(f.updates.translationSnapshot(item(101)), translation);
  } finally { f.close(); }
});

test("legacy bookmark subscriptions accept only exact HTML-decoded equivalence and expose the original version", async () => {
  const f = await fixture();
  try {
    const saved = { ...item(), title: "AI & Search", summary: "Read <this>" };
    const original = { ...saved, title: "AI &amp; Search", summary: "Read &lt;this&gt;" };
    f.watch(saved, () => {}, true); f.rows([{ ...original, translation }]);
    await f.updates.refreshTranslations();
    assert.deepEqual(f.updates.translationSnapshot(saved), translation);
    assert.equal(f.updates.translationOriginalSnapshot(saved)?.title, original.title);
    f.status({ ...progress, updatedAt: "2026-10-16T12:01:00Z" });
    f.rows([{ ...original, title: " AI &amp; Search", translation: { ...translation, title: "错误更新" } }]);
    await f.updates.refreshTranslations();
    assert.deepEqual(f.updates.translationSnapshot(saved), translation, "whitespace is not a fuzzy compatibility match");
  } finally { f.close(); }
});

test("missing legacy language may be learned only after exact ID and decoded source text match", async () => {
  const f = await fixture();
  try {
    const legacy = { ...item(), language: "" };
    f.watch(legacy, () => {}, true); f.rows([{ ...item(2), translation }, { ...item(), title: "Changed original", translation }]);
    await f.updates.refreshTranslations();
    assert.equal(f.updates.translationSnapshot(legacy), undefined);
    f.status({ ...progress, updatedAt: "2026-10-16T12:01:00Z" }); f.rows([{ ...item(), translation }]);
    await f.updates.refreshTranslations();
    assert.deepEqual(f.updates.translationSnapshot(legacy), translation);
    assert.equal(f.updates.translationOriginalSnapshot(legacy)?.language, "en");
  } finally { f.close(); }
});
