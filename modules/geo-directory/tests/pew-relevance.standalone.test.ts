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

test("a retrieval paper needs the AI and search pairing in its title, not only in its abstract", () => {
  const source: PublicSource = { id: "rss-arxiv-ir", name: "arXiv · Information Retrieval", kind: "rss", config: {}, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 360, enabled: true, cursor: null, fail_count: 0, languageHint: "en", sourceUrl: "https://arxiv.org/list/cs.IR/recent" };
  const abstract = "We use large language models to improve ranking and search quality.";
  // Titles from the cs.IR feed: two off-topic papers and three that discuss LLM search, retrieval or citations.
  const papers = [
    ["TAGR: Task-Adaptive Geo-Semantic Retrieval across Heterogeneous Urban Delivery Tasks", false],
    ["PRISM: Prompt-Refined In-Context System Modelling for Financial Retrieval", false],
    ["Can AI Chat Replace Traditional Search? Evidence from a RAG-based Live Events Experiment", true],
    ["SIREN (Luring LLMs onto the Rocks): PAIR-Driven Preference Manipulation in Web-RAG Recommenders", true],
    ["CiteFix: Enhancing RAG Accuracy Through Post-Processing Citation Correction", true],
  ] as const;
  for (const [title, kept] of papers) {
    const items = toPublicCandidates([{ title, excerpt: abstract, url: `https://arxiv.org/abs/2610.0${title.length}` }], source);
    assert.equal(items.length, kept ? 1 : 0, title);
  }
  // An explicit GEO term in the abstract still admits a paper, and articles keep the abstract rule.
  assert.equal(toPublicCandidates([{ title: "Designing Agent-Ready Websites", excerpt: "A framework for generative engine optimization.", url: "https://arxiv.org/abs/2610.00001" }], source).length, 1);
  assert.equal(toPublicCandidates([{ title: "Our ranking study", excerpt: abstract, url: "https://research.example/ranking" }], { ...source, id: "rss-research" }).length, 1);
});

test("a GEO-focused paper feed keeps on-topic papers whose titles do not name AI search", () => {
  const source: PublicSource = { id: "rss-arxiv-geo", name: "arXiv · GEO 原始论文", kind: "rss", config: {}, tier: "T1", participation_mode: "editorial", first_party: true, interval_minutes: 1440, enabled: true, cursor: null, fail_count: 0, languageHint: "en", sourceUrl: "https://export.arxiv.org/api/query", geoFocused: true };
  const candidate = { title: "Scoring Without the Engine: A Content Score for Generative Engines", excerpt: "We use large language models to estimate how often content is cited by generative engines.", url: "https://arxiv.org/abs/2610.00002" };
  assert.equal(toPublicCandidates([candidate], source).length, 1);
  assert.equal(toPublicCandidates([candidate], { ...source, id: "rss-arxiv-ir", name: "arXiv · Information Retrieval", geoFocused: false }).length, 0);
});
