import test from "node:test";
import assert from "node:assert/strict";
import { translationPercentages } from "../backend/translate-public.ts";

test("translation validation preserves percentages across language formatting, and detects missing percent signs", () => {
  assert.deepEqual(translationPercentages("42% more, no 25% increase"), [25,42]);
  assert.deepEqual(translationPercentages("增加42％，未发现百分之25的增长"), [25,42]);
  assert.notDeepEqual(translationPercentages("增加42%，未发现25的增长"), [25,42]);
  assert.deepEqual(translationPercentages("23,5% and 1,000%"), [23.5,1000]);
  assert.deepEqual(translationPercentages("1.234,5% and 1,234.5%"), [1234.5,1234.5]);
  assert.deepEqual(translationPercentages("25%,25%,-10%"), [-10,25,25]);
});
