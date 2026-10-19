import test from "node:test";
import assert from "node:assert/strict";
import { readingFacts, readingPriority, groupLinkPreference } from "@aihot/backend/publication/geo-quality";

test("round2 evidence ignores links but leaves the original input untouched", () => {
  const item = { title: "AI search guide", summary: "Read https://benchmark.example/experiment?q=dataset and https://example.org/we-tested-300-prompts for details.", url: "https://guide.example/article" };
  const original = structuredClone(item);
  assert.equal(readingFacts(item).rank, 1);
  assert.equal(readingFacts(item).method, false);
  assert.deepEqual(item, original);
});

test("round2 explicit observational study is evidence while planned research is not", () => {
  const item = { title: "Understanding ChatGPT Citations: Evidence from Production Web Search Across Model Generations", summary: "We conduct an observational study of four ChatGPT Web settings, examining how queries are rewritten and references selected.", url: "https://arxiv.org/abs/2610.15382v1" };
  assert.equal(readingFacts(item).rank, 0);
  assert.equal(readingFacts(item).firstHand, true);
  assert.equal(readingFacts({ ...item, summary: "We plan to conduct a study of these systems." }).rank, 1);
  assert.equal(readingFacts({ ...item, summary: "The new examiner registered 300,000 domains for resale." }).method, false);
});

test("round2 tool support is not explained as a platform change", () => {
  const item = { title: "Introducing support for Google AI Mode", summary: null, url: "https://www.tryprofound.com/blog/google-ai-mode-support" };
  const facts = readingFacts(item);
  assert.equal(facts.toolIntegration, true);
  assert.equal(facts.platformChange, false);
  assert.equal(readingPriority(item).reasons.includes("涉及 AI 搜索平台、抓取或展示变化"), false);
});

test("round2 group link preference excludes discussions, indices and explicit reprints", () => {
  const item = { title: "AI search research", summary: "We tested 100 queries.", url: "https://lab.example/research", contentKind: "direct" };
  assert.equal(groupLinkPreference(item), 0);
  for (const changes of [
    { url: "https://news.ycombinator.com/item?id=50029465" },
    { url: "https://news.google.com/rss/articles/research" },
    { contentKind: "social" },
    { contentKind: "aggregated" },
    { summary: "Originally published at the lab's website." },
  ]) assert.equal(groupLinkPreference({ ...item, ...changes }), 1);
});
