import test from "node:test";
import assert from "node:assert/strict";
import { createReaderBriefModel, LocalReaderBriefModel, ReaderBriefModelError, READER_BRIEF_CONTEXT, READER_BRIEF_OUTPUT_TOKENS,
  readerBriefMessages, requestReaderBrief, validateReaderBriefDraft, validateReaderBriefReview, readerBriefReviewPassed, briefClaims, requestReaderBriefReview, type ReaderBriefModelInput } from "../backend/reader-brief-model.ts";

const input: ReaderBriefModelInput = { title: "AI summaries and clicks", url: "https://example.org/study", paragraphs: [
  { id: "p1", text: "In March 2025, 900 US adults were observed. With an AI summary, users clicked a traditional result in 8% of visits; without one, in 15%. This is an association, not causal evidence." },
  { id: "p2", text: "Only 1% of visits with a summary resulted in a click on a link within that summary. This study does not measure other countries or long-term changes." },
  { id: "p3", text: "The dataset contained 100,000 pages. Some observations were incomplete." },
] };
const value = (text: string, evidenceIds = ["p1"]) => ({ text, evidenceIds });
const draft = () => ({
  conclusion: value("这项美国用户观察研究发现，有AI摘要时传统结果的点击比例较低。"),
  findings: [value("有AI摘要时传统结果点击占8%，无摘要时为15%，两者仅为相关关系。")],
  geoValue: [value("启示：评估搜索表现时应区分传统结果与AI摘要链接的点击。", ["p1", "p2"])],
  caveats: [value("研究未测量其他国家用户及长期变化，不能直接外推。", ["p2"])],
});
const invalid = (error: unknown) => error instanceof ReaderBriefModelError && error.kind === "invalid";

test("draft retains paragraph evidence and accepts faithful normalized quantities", () => {
  const result = validateReaderBriefDraft(draft(), input, 1800);
  assert.equal(result.inputTokens, 1800);
  assert.equal(result.findings[0].text, draft().findings[0].text);
  const changed = draft();
  changed.findings = [value("数据集包含10万张网页，部分观察数据并不完整。", ["p3"])];
  assert.doesNotThrow(() => validateReaderBriefDraft(changed, input, 1800));
});

test("missing evidence, invented years and percentages fail within their cited paragraphs", () => {
  const missing = draft(); missing.findings[0].evidenceIds = ["missing"];
  assert.throws(() => validateReaderBriefDraft(missing, input, 1), invalid);
  const year = draft(); year.conclusion.text = "2023年的美国研究发现，有AI摘要时传统结果的点击比例较低。";
  assert.throws(() => validateReaderBriefDraft(year, input, 1), invalid);
  const wrongParagraph = draft(); wrongParagraph.findings[0].evidenceIds = ["p2"];
  assert.throws(() => validateReaderBriefDraft(wrongParagraph, input, 1), invalid);
  const inventedPercent = draft(); inventedPercent.findings = [value("研究中900%的受访者均来自美国境内。")];
  assert.throws(() => validateReaderBriefDraft(inventedPercent, input, 1), invalid);
});

test("percentage points cannot be silently substituted for percentages", () => {
  const changed = draft(); changed.findings[0].text = "有AI摘要时传统结果点击减少8个百分点，差距十分明显。";
  assert.throws(() => validateReaderBriefDraft(changed, input, 1), invalid);
  const explicit = { ...input, paragraphs: [{ id: "p1", text: "The difference is 8 percentage points. This is not a causal estimate." }] };
  changed.conclusion.evidenceIds = ["p1"]; changed.geoValue[0].evidenceIds = ["p1"]; changed.caveats = [];
  assert.doesNotThrow(() => validateReaderBriefDraft(changed, explicit, 1));
});

test("the exact complete article is templated and tokenized before generation", async () => {
  const seen: Array<{ endpoint: string; body: any }> = [];
  const result = await requestReaderBrief(input, async (endpoint, body: any) => {
    seen.push({ endpoint, body });
    if (endpoint === "/apply-template") return { prompt: JSON.stringify(body.messages) };
    if (endpoint === "/tokenize") return { tokens: Array(1800).fill(1) };
    return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(draft()) } }] };
  });
  assert.equal(result.inputTokens, 1800);
  assert.deepEqual(seen.map(value => value.endpoint), ["/apply-template", "/tokenize", "/v1/chat/completions"]);
  assert.deepEqual(JSON.parse(seen[0].body.messages[1].content).articleParagraphs, input.paragraphs);
  assert.equal(seen[1].body.content, JSON.stringify(seen[0].body.messages));
  assert.deepEqual(seen[2].body.messages, seen[0].body.messages);
  assert.equal(seen[2].body.max_tokens, READER_BRIEF_OUTPUT_TOKENS);
  assert.equal(seen[2].body.chat_template_kwargs.enable_thinking, false);
});

test("correction gets extra reasoning only after an actual error, and retains the full source", async () => {
  const seen: any[] = [];
  await requestReaderBrief(input, async (endpoint, body: any) => {
    seen.push(body);
    if (endpoint === "/apply-template") return { prompt: JSON.stringify(body.messages) };
    if (endpoint === "/tokenize") return { tokens: Array(1800).fill(1) };
    return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(draft()) } }] };
  }, undefined, { draft: draft(), issues: ["Correct the citation"] });
  const payload = JSON.parse(seen[0].messages[1].content);
  assert.deepEqual(payload.articleParagraphs, input.paragraphs);
  assert.deepEqual(payload.errors, ["Correct the citation"]);
  assert.deepEqual(seen[0].messages.map((message: any) => message.role), ["system", "user"]);
  assert.equal(seen[2].chat_template_kwargs.enable_thinking, true);
  assert.ok(seen[2].max_tokens > READER_BRIEF_OUTPUT_TOKENS);
});

test("descriptive differences cannot acquire unsupported statistical significance", () => {
  const changed = draft();
  changed.conclusion.text = "这项美国用户观察研究发现，有AI摘要时传统结果的点击比例显著较低。";
  assert.throws(() => validateReaderBriefDraft(changed, input, 1800), invalid);
  const explicit = { ...input, paragraphs: input.paragraphs.map((p, i) => i ? p : { ...p, text: p.text + " The difference was statistically significant." }) };
  assert.doesNotThrow(() => validateReaderBriefDraft(changed, explicit, 1800));
});

test("generation removes only unsupported positive intensifiers before full validation", async () => {
  const response = (value: unknown) => async (endpoint: string) => endpoint === "/apply-template" ? { prompt: "full source" }
    : endpoint === "/tokenize" ? { tokens: [1, 2, 3] } : { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] };
  const changed = draft();
  changed.conclusion.text = "这项美国用户观察研究发现，有AI摘要时传统结果点击比例显著低于无摘要的情况。";
  const result = await requestReaderBrief(input, response(changed));
  assert.equal(result.conclusion.text, changed.conclusion.text.replace("显著", ""));
  assert.deepEqual(result.findings, changed.findings);
  changed.conclusion.text = "这项美国用户观察研究未发现有AI摘要时点击比例显著低于无摘要的情况。";
  await assert.rejects(requestReaderBrief(input, response(changed)), invalid);
  const explicit = { ...input, paragraphs: input.paragraphs.map((p, i) => i ? p : { ...p, text: p.text + " The difference was statistically significant." }) };
  changed.conclusion.text = "这项美国用户观察研究发现，有AI摘要时传统结果点击比例显著低于无摘要的情况。";
  assert.equal((await requestReaderBrief(explicit, response(changed))).conclusion.text, changed.conclusion.text);
});

test("context overflow rejects without requesting inference or truncating the tail", async () => {
  let generationCalls = 0;
  await assert.rejects(requestReaderBrief(input, async endpoint => {
    if (endpoint === "/apply-template") return { prompt: "full article" };
    if (endpoint === "/tokenize") return { tokens: Array(READER_BRIEF_CONTEXT - READER_BRIEF_OUTPUT_TOKENS).fill(1) };
    generationCalls++; return {};
  }), (error: unknown) => error instanceof ReaderBriefModelError && error.kind === "too_long");
  assert.equal(generationCalls, 0);
});

test("runtime truncation cannot turn a partial article into a full-article draft", async () => {
  await assert.rejects(requestReaderBrief(input, async endpoint => endpoint === "/apply-template" ? { prompt: "whole" }
    : endpoint === "/tokenize" ? { tokens: Array(1800).fill(1) }
    : { usage: { prompt_tokens: 100 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(draft()) } }] }), invalid);
});

test("incomplete or wrapped JSON and invalid input cannot become a draft", async () => {
  assert.throws(() => readerBriefMessages({ ...input, paragraphs: [...input.paragraphs, input.paragraphs[0]] }), invalid);
  for (const [finish_reason, content] of [["length", JSON.stringify(draft())], ["stop", "```json\n{}\n```"]]) {
    await assert.rejects(requestReaderBrief(input, async endpoint => endpoint === "/apply-template" ? { prompt: "whole" }
      : endpoint === "/tokenize" ? { tokens: [1] } : { choices: [{ finish_reason, message: { content } }] }), invalid);
  }
});

test("the explicit model flag is required before any local service can start", async () => {
  const previous = process.env.PUBLIC_READER_BRIEFS_ENABLED;
  try {
    process.env.PUBLIC_READER_BRIEFS_ENABLED = "1";
    await assert.rejects(createReaderBriefModel(), (error: unknown) => error instanceof ReaderBriefModelError && error.kind === "disabled");
    process.env.PUBLIC_READER_BRIEFS_ENABLED = "true";
    const model = new LocalReaderBriefModel();
    process.env.PUBLIC_READER_BRIEFS_ENABLED = "false";
    await assert.rejects(model.generate(input), (error: unknown) => error instanceof ReaderBriefModelError && error.kind === "disabled");
    await model.close();
  } finally { if (previous === undefined) delete process.env.PUBLIC_READER_BRIEFS_ENABLED; else process.env.PUBLIC_READER_BRIEFS_ENABLED = previous; }
});

test("a missing runtime is rejected at factory time before a worker fetches an article", async () => {
  const previousFlag = process.env.PUBLIC_READER_BRIEFS_ENABLED;
  const previousRuntime = process.env.PUBLIC_READER_BRIEF_RUNTIME_PATH;
  try {
    process.env.PUBLIC_READER_BRIEFS_ENABLED = "true";
    process.env.PUBLIC_READER_BRIEF_RUNTIME_PATH = "/nonexistent-reader-test/runtime";
    await assert.rejects(createReaderBriefModel(), (error: unknown) => error instanceof ReaderBriefModelError && error.kind === "unavailable");
  } finally {
    if (previousFlag === undefined) delete process.env.PUBLIC_READER_BRIEFS_ENABLED; else process.env.PUBLIC_READER_BRIEFS_ENABLED = previousFlag;
    if (previousRuntime === undefined) delete process.env.PUBLIC_READER_BRIEF_RUNTIME_PATH; else process.env.PUBLIC_READER_BRIEF_RUNTIME_PATH = previousRuntime;
  }
});

test("English calendar months can be faithfully translated to Chinese numeric dates", () => {
  const changed = draft();
  changed.conclusion.text = "2025年3月的美国用户研究观察到，有AI摘要时传统结果的点击比例较低。";
  assert.doesNotThrow(() => validateReaderBriefDraft(changed, input, 1800));
  changed.conclusion.text = changed.conclusion.text.replace("3月", "4月");
  assert.throws(() => validateReaderBriefDraft(changed, input, 1800), invalid);
});

test("written English counts are not mistaken for invented Chinese numeric data", () => {
  const source = { ...input, paragraphs: [{ id: "p1", text: "One of three independent search engines, with up to five snippets per page and over 100 million daily page updates." }] };
  const changed = draft(); changed.caveats = [];
  changed.geoValue[0].evidenceIds = ["p1"];
  changed.findings = [value("该索引属于3家独立搜索引擎之一，每页可提供最多5段摘要，每日更新超过1亿个页面。")];
  assert.doesNotThrow(() => validateReaderBriefDraft(changed, source, 1800));
  changed.findings[0].text = changed.findings[0].text.replace("最多5段", "最多6段");
  assert.throws(() => validateReaderBriefDraft(changed, source, 1800), invalid);
});

test("semantic review requires every claim exactly once and rejects any failed or incomplete check", () => {
  const candidate = validateReaderBriefDraft(draft(), input, 1800);
  const review = { checks: briefClaims(candidate).map(claim => ({ id: claim.id, reason: "事实与对应证据一致", supported: true })), complete: true, issues: [] };
  assert.equal(readerBriefReviewPassed(validateReaderBriefReview(review, candidate)), true);
  assert.equal(validateReaderBriefReview({ ...review, reviewMs: 1234 }, candidate).reviewMs, 1234);
  assert.throws(() => validateReaderBriefReview({ ...review, checks: review.checks.slice(1) }, candidate), invalid);
  assert.throws(() => validateReaderBriefReview({ ...review, checks: [review.checks[0], ...review.checks.slice(0, -1)] }, candidate), invalid);
  assert.equal(readerBriefReviewPassed({ ...review, complete: false }), false);
  assert.equal(readerBriefReviewPassed({ ...review, issues: ["把观察关联写成因果"] }), false);
  assert.equal(readerBriefReviewPassed({ ...review, checks: review.checks.map((check, i) => ({ ...check, supported: i !== 0 })) }), false);
});

test("a fresh critic sees the complete source, with no assistant endorsement, and cannot truncate it", async () => {
  const candidate = validateReaderBriefDraft(draft(), input, 1800);
  const review = { checks: briefClaims(candidate).map(claim => ({ id: claim.id, reason: "事实与对应证据一致", supported: true })), complete: true, issues: [] };
  let calls = 0;
  const result = await requestReaderBriefReview(input, candidate, async (endpoint, body: any) => {
    calls++;
    if (endpoint === "/apply-template") {
      assert.deepEqual(JSON.parse(body.messages[1].content).articleParagraphs, input.paragraphs);
      assert.deepEqual(body.messages.map((message: any) => message.role), ["system", "user"]);
      return { prompt: "complete source and claims" };
    }
    if (endpoint === "/tokenize") return { tokens: Array(2000).fill(1) };
    return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(review) } }], usage: { prompt_tokens: 2000 } };
  });
  assert.equal(calls, 3); assert.equal(readerBriefReviewPassed(result), true);
  await assert.rejects(requestReaderBriefReview(input, candidate, async endpoint => endpoint === "/apply-template" ? { prompt: "whole" }
    : endpoint === "/tokenize" ? { tokens: Array(2000).fill(1) }
    : { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(review) } }], usage: { prompt_tokens: 100 } }), invalid);
});

test("a cached draft can be reviewed after restart without generating it again", async () => {
  const previous = process.env.PUBLIC_READER_BRIEFS_ENABLED;
  process.env.PUBLIC_READER_BRIEFS_ENABLED = "true";
  const model = new LocalReaderBriefModel();
  const candidate = validateReaderBriefDraft(draft(), input, 1800);
  let starts = 0;
  // Only replace the native boundary: this test never loads a model or uses the network.
  (model as any).start = async () => { starts++; };
  (model as any).request = async (endpoint: string) => endpoint === "/apply-template" ? { prompt: "complete source" }
    : endpoint === "/tokenize" ? { tokens: Array(2000).fill(1) }
    : { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks: briefClaims(candidate).map(claim => ({ id: claim.id, reason: "原文支持该项的事实范围", supported: true })), complete: true, issues: [] }) } }] };
  try {
    assert.equal(readerBriefReviewPassed(await model.review(input, candidate)), true);
    assert.equal(starts, 1);
  } finally {
    await model.close();
    if (previous === undefined) delete process.env.PUBLIC_READER_BRIEFS_ENABLED; else process.env.PUBLIC_READER_BRIEFS_ENABLED = previous;
  }
});
