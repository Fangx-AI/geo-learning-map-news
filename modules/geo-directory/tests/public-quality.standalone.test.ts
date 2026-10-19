import test from "node:test";
import assert from "node:assert/strict";
import { readingFacts, readingPriority, READING_POLICY_VERSION } from "@aihot/backend/publication/geo-quality";
import { qualityFixtures } from "./quality-fixtures.ts";

for (const fixture of qualityFixtures) test(`reading policy: ${fixture.name}`, () => {
  assert.equal(readingFacts(fixture).rank, fixture.expected);
  const priority = readingPriority(fixture);
  assert.equal(priority.tier, ["priority", "standard", "deprioritized"][fixture.expected]);
  assert.ok(priority.reasons.length > 0);
  assert.match(priority.limitations[0], /未核实/);
  assert.ok(!("score" in priority));
  assert.equal(priority.policyVersion, READING_POLICY_VERSION);
});

test("missing evidence and unknown dates stay explicit and no publisher domain is invented", () => {
  const sparse = readingPriority({ title: "AI search benchmark", summary: null, url: "https://research.example/x" });
  assert.ok(sparse.limitations.some(value => value.includes("摘要缺失")));
  assert.ok(sparse.limitations.some(value => value.includes("发布日期未知")));
  const spoof = readingPriority(qualityFixtures.find(item => item.name === "false official suffix")!);
  assert.ok(!spoof.reasons.includes("平台官方域名"));
});
