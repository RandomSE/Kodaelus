import assert from "node:assert/strict";
import test from "node:test";
import { findConfidenceViolations, isPlanFirstOnlyMessage, isSubstantiveResponse } from "./confidence-format.mjs";

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

test("isSubstantiveResponse: progress under 500 chars is not substantive", () => {
  assert.equal(isSubstantiveResponse("Wrote tests."), false);
  assert.equal(isSubstantiveResponse(""), false);
  assert.equal(isSubstantiveResponse("x".repeat(500)), true);
});

test("isSubstantiveResponse: stop/final report is substantive even when short", () => {
  assert.equal(isSubstantiveResponse("Wrote tests.", 500, { event: "stop" }), true);
  assert.equal(isSubstantiveResponse("Done.", 500, { finalReport: true }), true);
  assert.equal(isSubstantiveResponse("   ", 500, { event: "stop" }), false);
});

test("isPlanFirstOnlyMessage: Plan-only is exempt from >= 500 full-structure", () => {
  const planOnly = [
    "## Plan",
    "Delivery Tier: Full. File count: 6. Blast radius: src + tests.",
    "Confidence: 88% | Evidence: `Cargo.toml` -> package name tapesim",
    "x".repeat(1200),
  ].join("\n");
  assert.equal(planOnly.length >= 500, true);
  assert.equal(isPlanFirstOnlyMessage(planOnly), true);
  assert.equal(isSubstantiveResponse(planOnly), false);
  assert.equal(isSubstantiveResponse(planOnly, 500, { event: "stop" }), true);
});

test("isPlanFirstOnlyMessage: full delivery is not Plan-first-only", () => {
  const full = [
    "## Plan",
    "Delivery Tier: Full. Confidence: 90% | Evidence: tests",
    "## Delivery Self-Check",
    "| a | Pass |",
    "## Follow-Up Queue",
    "- FU-1",
    "x".repeat(500),
  ].join("\n");
  assert.equal(isPlanFirstOnlyMessage(full), false);
  assert.equal(isSubstantiveResponse(full), true);
});
