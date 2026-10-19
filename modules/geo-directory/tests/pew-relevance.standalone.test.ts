import assert from "node:assert/strict";
import test from "node:test";
import { matchGeoTerms } from "../backend/relevance.ts";
import { toPublicCandidates, type PublicSource } from "../backend/public-source.ts";

// Exact public title and short excerpt from Pew's July 22, 2025 Google click study.
// The original uses "Google/results/AI summary", not the literal phrase "AI search".
const title = "Google users are less likely to click on links when an AI summary appears in the results";
const excerpt = "In a March 2025 analysis, Google users who encountered an AI summary were less likely to click on links to other websites than users who did not see one.";
const url = "https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/";

test("the real Pew Google summary study survives public relevance matching without rewriting its title", () => {
  assert.ok(matchGeoTerms(title).includes("AI summaries in Google results"));
  const source: PublicSource = { id: "json-pew-ai-summaries", name: "Pew Research", kind: "json_list", config: {}, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 360, enabled: true, cursor: null, fail_count: 0, languageHint: "en", sourceUrl: "https://www.pewresearch.org/?s=AI+summaries" };
  const items = toPublicCandidates([{ title, excerpt, url, publishedAt: new Date("2025-07-22T13:54:17Z") }], source);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, title);
  assert.equal(items[0].url, url);
  assert.equal(items[0].publishedAt?.toISOString(), "2025-07-22T13:54:17.000Z");
});

test("the summary rule does not admit generic AI summaries or ordinary Google results", () => {
  for (const text of [
    "Google Docs adds AI summaries for meeting notes",
    "AI summaries make my private diary easier to review",
    "Google results get more clicks after a new visual design",
    "An AI summary of click events in a video game",
    "Google announces a new AI tool for organizing family photographs",
  ]) assert.deepEqual(matchGeoTerms(text), [], text);
});

test("explicit generative search studies are admitted without broadening to generic generative research", () => {
  for (const text of [
    "Claim-Gated Source-Risk Auditing for Generative Search",
    "When Attention Becomes Exposure: Citation Selection in Generative Search",
  ]) assert.ok(matchGeoTerms(text).includes("AI search"), text);
  for (const text of [
    "Generative research into new molecules",
    "A generic search algorithm with a new benchmark",
    "Research on generative art and painting",
  ]) assert.deepEqual(matchGeoTerms(text), [], text);
});
