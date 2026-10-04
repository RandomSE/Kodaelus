import assert from "node:assert/strict";
import test from "node:test";
import {
  responseMissingInsightsEvidence,
  responseMissingRecommendation,
} from "./recommendation-insights-guard.mjs";

test("natural-language responses need Active mode and a recommendation line", () => {
  assert.equal(responseMissingRecommendation("## Implementation\ndone"), true);
  assert.equal(
    responseMissingRecommendation("Active mode: Main (full). Recommend Main."),
    true,
  );
  assert.equal(
    responseMissingRecommendation(
      "Active mode: Main. Recommend Main (`use kodaelus main`). Does not switch mode.",
    ),
    false,
  );
});

test("insights evidence is a path mention or Insights line", () => {
  assert.equal(responseMissingInsightsEvidence("no memory"), true);
  assert.equal(responseMissingInsightsEvidence("Read .kodaelus/insights.md"), false);
  assert.equal(responseMissingInsightsEvidence("Insights: none new"), false);
});
