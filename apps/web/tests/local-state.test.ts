import assert from "node:assert/strict";
import { after, test } from "node:test";
import { beijingDate, beijingTime } from "@aihot/contracts/time";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
after(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

let instance = 0;
async function reader(starred: unknown[] = []) {
  const values = new Map([["aihot-starred-items", JSON.stringify(starred)]]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } },
  });
  // Reopening the page starts with an empty snapshot cache.
  const state: typeof import("../app/lib/local-state.ts") = await import(`../app/lib/local-state.ts?test=${instance++}`);
  return { state, values };
}

const displayDate = (value: string) => `${beijingDate(value)} ${beijingTime(value)}`;

test("public-source bookmarks retain their original URLs through save, export and import", async () => {
  const { state } = await reader();
  const item = { id: "a".repeat(64), title: "AI search research", summary: "Source excerpt", sourceName: "Public source", publishedAt: "2026-10-16T03:00:00Z", score: null, aiSelected: false, url: "https://example.com/original" };
  assert.equal(state.toggleStar(item), true);
  const backup = state.exportBundle();
  assert.equal(backup.starred[0]?.url, item.url);
  state.removeStar(item.id);
  state.importBundle(JSON.stringify(backup));
  assert.equal(state.getStarred()[0]?.url, item.url);
});

test("bilingual bookmarks keep original text, language and complete translations through export and import", async () => {
  const { state } = await reader();
  const item = { id: "bilingual", title: "Original AI search study", summary: "Study of 1,000 queries.", language: "en", translation: { title: "AI 搜索原始研究", summary: "研究了 1,000 个查询。", language: "zh" as const, provider: "argos" }, sourceName: "Research", publishedAt: null, score: null, aiSelected: false, url: "https://example.com/research" };
  state.toggleStar(item);
  const backup = state.exportBundle();
  assert.equal(backup.starred[0]?.title, item.title);
  assert.deepEqual(backup.starred[0]?.translation, item.translation);
  state.removeStar(item.id);
  state.importBundle(JSON.stringify(backup));
  const saved = state.getStarred()[0]!;
  assert.equal(saved.language, "en");
  assert.equal(saved.summary, item.summary);
  assert.equal(saved.url, item.url);
  assert.deepEqual(saved.translation, item.translation);
});

const revised = { title: "修订中文标题", summary: "修订中文摘要", language: "zh" as const, provider: "geo-reviewed" };
test("translation synchronization preserves original fields, notes, links and newer cross-tab bookmarks", async () => {
  const original = { title: "AI search study", summary: "Original excerpt", language: "en" };
  const saved = { id: "a".repeat(64), ...original, sourceName: "Original source", savedAt: "2026-10-01T00:00:00Z", url: "https://example.com/original", note: "My private note", custom: { tags: ["read"] } };
  const { state, values } = await reader([saved]);
  state.getStarred();
  const otherTab = { id: "another", title: "Added in another tab" };
  values.set(state.KEYS.starred, JSON.stringify([otherTab, { ...saved, note: "Newer note" }]));
  assert.equal(state.updateStarredTranslation(saved.id, original, revised), true);
  const raw = JSON.parse(values.get(state.KEYS.starred)!);
  assert.deepEqual(raw[0], otherTab);
  assert.deepEqual(raw[1], { ...saved, note: "Newer note", translation: revised, translationOriginal: original });
  assert.equal(state.updateStarredTranslation(saved.id, original, revised), false, "unchanged snapshots cause no write");
});

test("older decoded bookmarks gain a precise source version and missing language without rewriting original text", async () => {
  const original = { title: "AI &amp; Search", summary: "Read &lt;this&gt;", language: "en" };
  const saved = { id: "b".repeat(64), title: "AI & Search", summary: "Read <this>", url: "https://example.com/old", savedAt: "2026-10-01T00:00:00Z" };
  const { state, values } = await reader([saved]);
  assert.equal(state.updateStarredTranslation(saved.id, original, revised), true);
  const updated = JSON.parse(values.get(state.KEYS.starred)!)[0];
  assert.deepEqual(updated, { ...saved, language: "en", translation: revised, translationOriginal: original });
  assert.deepEqual(state.exportBundle().starred[0]?.translationOriginal, original);
});

test("source version, language and ID mismatches never replace a saved translation", async () => {
  const original = { title: "Original", summary: "Original excerpt", language: "en" };
  const saved = { id: "c".repeat(64), ...original, translation: revised, translationOriginal: original };
  const { state, values } = await reader([saved]);
  const before = values.get(state.KEYS.starred);
  for (const changed of [{ ...original, title: " Original" }, { ...original, summary: "Expanded original" }, { ...original, language: "fr" }]) assert.equal(state.updateStarredTranslation(saved.id, changed, { ...revised, title: "不应写入" }), false);
  assert.equal(state.updateStarredTranslation("different", original, revised), false);
  assert.equal(values.get(state.KEYS.starred), before);
  values.set(state.KEYS.starred, JSON.stringify([{ ...saved, title: "Reader edited the original snapshot" }]));
  const edited = values.get(state.KEYS.starred);
  assert.equal(state.updateStarredTranslation(saved.id, original, { ...revised, title: "不应覆盖" }), false);
  assert.equal(values.get(state.KEYS.starred), edited);
});

test("missing, incomplete or unwritable updates preserve saved originals and translations", async () => {
  const original = { title: "Original", summary: "Original excerpt", language: "en" };
  const saved = { id: "d".repeat(64), ...original, translation: revised };
  const { state, values } = await reader([saved]);
  const before = values.get(state.KEYS.starred);
  assert.equal(state.updateStarredTranslation(saved.id, original, { ...revised, summary: null }), false);
  assert.equal(state.updateStarredTranslation("missing", original, revised), false);
  window.localStorage.setItem = () => { throw new Error("storage unavailable"); };
  assert.equal(state.updateStarredTranslation(saved.id, original, { ...revised, title: "New translation" }), false);
  assert.equal(values.get(state.KEYS.starred), before);
  assert.deepEqual(state.getStarred()[0]?.translation, revised);
});

test("invalid or incomplete imported translations fall back to original bookmarks", async () => {
  const { state } = await reader();
  const valid = { title: "中文标题", summary: "中文摘要", language: "zh", provider: "argos" };
  const values = [null, "invalid", { ...valid, title: " " }, { ...valid, language: "en" }, { ...valid, summary: null }, { ...valid, provider: 12 }, { ...valid, summary: {} }, valid];
  state.importBundle(JSON.stringify({ version: 1, starred: values.map((translation, index) => ({ id: `translation-${index}`, title: "Original", summary: "Original excerpt", language: "en", translation })) }));
  const saved = state.getStarred();
  for (let index = 0; index < values.length - 1; index++) assert.equal(saved.find(item => item.id === `translation-${index}`)?.translation, undefined);
  assert.deepEqual(saved.find(item => item.id === "translation-7")?.translation, valid);
  assert.ok(saved.every(item => item.title === "Original" && item.summary === "Original excerpt"));
});

test("reading language defaults to Chinese, persists original mode and remains usable with blocked storage", async () => {
  const { state, values } = await reader();
  assert.equal(state.getContentLanguage(), "zh");
  state.setContentLanguage("original");
  assert.equal(values.get(state.KEYS.contentLanguage), "original");
  assert.equal(state.getContentLanguage(), "original");
  state.setContentLanguage("zh");
  assert.equal(state.getContentLanguage(), "zh");
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  state.setContentLanguage("original");
  assert.equal(state.getContentLanguage(), "original");
  state.setContentLanguage("zh");
  assert.equal(state.getContentLanguage(), "zh");
});

test("imported bookmark URLs cannot introduce executable schemes or embedded credentials", async () => {
  const { state } = await reader();
  const urls = ["javascript:alert(1)", "data:text/html,test", "https://user:password@example.com/", "not a URL", "https://example.com/safe"];
  state.importBundle(JSON.stringify({ version: 1, starred: urls.map((url, index) => ({ id: `external-${index}`, title: "Imported", url })) }));
  const saved = state.getStarred();
  for (let index = 0; index < 4; index++) assert.equal(saved.find(item => item.id === `external-${index}`)?.url, undefined);
  assert.equal(saved.find(item => item.id === "external-4")?.url, urls[4]);
});

test("import keeps bookmarks with invalid dates and persists displayable replacements", async () => {
  const invalid = ["broken", "", "999999-01-01", "+275760-09-13T00:00:00.000Z", null, 42, {}];
  const { state, values } = await reader();
  const before = Date.now();
  const report = state.importBundle(JSON.stringify({ version: 1, starred: invalid.map((date, i) => ({
    id: `import-${i}`, title: `Bookmark ${i}`, savedAt: date, publishedAt: date,
  })) }));
  assert.equal(report.starredAdded, invalid.length);
  const saved = JSON.parse(values.get(state.KEYS.starred)!);
  assert.equal(saved.length, invalid.length);
  for (const item of saved) {
    assert.equal(item.publishedAt, null);
    assert.ok(Date.parse(item.savedAt) >= before && Date.parse(item.savedAt) <= Date.now());
    assert.doesNotThrow(() => displayDate(item.savedAt));
  }
});

test("stored bookmarks with damaged dates remain readable, exportable and removable", async () => {
  const { state } = await reader([{ id: "stored", title: "Keep me", savedAt: "broken", publishedAt: "broken" }]);
  const starred = state.getStarred();
  assert.equal(starred.length, 1);
  assert.equal(starred[0]!.title, "Keep me");
  assert.equal(starred[0]!.publishedAt, null);
  assert.doesNotThrow(() => displayDate(starred[0]!.savedAt));
  assert.strictEqual(state.getStarred(), starred, "React snapshots must stay stable between changes");
  assert.deepEqual(state.exportBundle().starred, starred);
  state.removeStar("stored");
  assert.deepEqual(state.getStarred(), []);
});

test("valid dates are preserved and an import cannot replace an existing bookmark", async () => {
  const existing = { id: "valid", title: "Original", savedAt: "2026-09-29T08:30:00+08:00", publishedAt: "2026-09-28T23:00:00Z" };
  const { state } = await reader([existing]);
  const report = state.importBundle(JSON.stringify({ version: 1, starred: [{ ...existing, title: "Replacement", savedAt: "broken" }] }));
  assert.equal(report.starredAdded, 0);
  const [saved] = state.getStarred();
  assert.equal(saved!.title, existing.title);
  assert.equal(saved!.savedAt, existing.savedAt);
  assert.equal(saved!.publishedAt, existing.publishedAt);
});

// Failure cases before changing storage: another tab's writes must survive a cached-tab edit;
// unreadable bookmarks must not be overwritten and failed writes must not report success.
test("a cached tab merges newer saved bookmarks and read marks before writing", async () => {
  const { state, values } = await reader([{ id: "old", title: "Old" }]);
  state.getStarred();
  state.getReadIds();
  values.set(state.KEYS.starred, JSON.stringify([{ id: "other-tab", title: "Other tab" }, { id: "old", title: "Old" }]));
  values.set(state.KEYS.read, JSON.stringify(["other-tab"]));
  state.toggleStar({ id: "new", title: "New", summary: null, sourceName: "", publishedAt: null, score: null, aiSelected: false });
  state.markRead("new");
  assert.deepEqual(state.getStarred().map((s) => s.id), ["new", "other-tab", "old"]);
  assert.deepEqual(state.getReadIds(), ["new", "other-tab"]);
});

test("failed bookmark writes and damaged existing data do not report a successful toggle", async () => {
  const { state, values } = await reader();
  const item = { id: "new", title: "New", summary: null, sourceName: "", publishedAt: null, score: null, aiSelected: false };
  values.set(state.KEYS.starred, "damaged original data");
  assert.equal(state.toggleStar(item), false);
  assert.equal(values.get(state.KEYS.starred), "damaged original data");
  window.localStorage.setItem = () => { throw new Error("quota"); };
  assert.equal(state.toggleStar(item), false);
});
