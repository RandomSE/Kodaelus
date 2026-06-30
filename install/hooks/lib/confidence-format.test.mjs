import assert from "node:assert/strict";
import test from "node:test";
import { findConfidenceViolations } from "./confidence-format.mjs";

test("findConfidenceViolations passes valid inline evidence", () => {
  const text = "Confidence: 90% | Evidence: `src/a.ts:1`";
  assert.deepEqual(findConfidenceViolations(text), []);
});

test("findConfidenceViolations flags bare confidence", () => {
  const text = "Confidence: 80% without proof nearby.";
  assert.equal(findConfidenceViolations(text).length, 1);
});

test("findConfidenceViolations counts multiple violations", () => {
  const text = "Confidence: 70% then Confidence: 60% both lack evidence.";
  assert.equal(findConfidenceViolations(text).length, 2);
});
