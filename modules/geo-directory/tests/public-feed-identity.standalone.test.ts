import test from "node:test";
import assert from "node:assert/strict";
import { publicSourceIssue, toPublicCandidates, type PublicSource } from "../backend/public-source.ts";

const source: PublicSource = { id: "official-docs", name: "Official docs", kind: "rss", publicEntryIdentity: "feed-id", config: { feedUrl: "https://platform.example/updates.rss", preserveUrlFragment: true }, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 120, enabled: true, cursor: null, fail_count: 0, sourceUrl: "https://platform.example/updates", languageHint: "en" };
const sharedUrl = "https://platform.example/updates#october-2026";
const make = (guid: unknown, title = "AI search crawler documentation changes") => ({ title, url: sharedUrl, publishedAt: new Date("2026-10-16T00:00:00Z"), excerpt: "Updated AI search crawler documentation.", raw: { guid } });

test("explicit feed identities retain different updates sharing one page, while duplicate GUIDs stay one entry", () => {
  const candidates = [make("doc-change-one"), make("doc-change-two", "AI search citation documentation changes"), make("doc-change-one")];
  const items = toPublicCandidates(candidates, source);
  assert.equal(items.length, 2);
  assert.notEqual(items[0].canonicalId, items[1].canonicalId);
  assert.ok(items.every(i => i.url === sharedUrl && i.publishedAt?.toISOString() === "2026-10-16T00:00:00.000Z"));
  const revised = toPublicCandidates([{ ...make("doc-change-one"), title: "Updated AI search crawler notes", excerpt: "Clarified ChatGPT crawler usage." }], source)[0];
  assert.equal(revised.id, items[0].id, "title/summary edits update the same entry");
  const defaultSource = { ...source, publicEntryIdentity: undefined };
  assert.equal(toPublicCandidates(candidates, defaultSource).length, 1, "ordinary feeds continue to deduplicate URLs");
});

test("feed IDs are scoped to the feed, support Atom IDs, and reject absent or malformed identifiers", () => {
  const [rss] = toPublicCandidates([make("urn:change:1")], source);
  const [atom] = toPublicCandidates([{ ...make(null), raw: { id: "urn:change:1" } }], source);
  assert.equal(rss.id, atom.id);
  const [other] = toPublicCandidates([make("urn:change:1")], { ...source, config: { ...source.config, feedUrl: "https://other.example/updates.rss" } });
  assert.notEqual(rss.canonicalId, other.canonicalId);
  for (const id of [undefined, null, "", " ", "x\ny", "x".repeat(1501), 123]) assert.equal(toPublicCandidates([make(id)], source).length, 0);
  assert.equal(publicSourceIssue(source), null);
  assert.ok(publicSourceIssue({ ...source, kind: "json_list", config: { url: "https://platform.example/updates" } }));
  assert.ok(publicSourceIssue({ ...source, publicEntryIdentity: "title" as "feed-id" }));
});
