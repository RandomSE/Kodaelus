import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeliveryStructureFollowup,
  findMissingDeliverySections,
  hasDeliveryTierConfidenceEvidence,
  isFollowUpQueueFinalSection,
} from "./delivery-structure-guard.mjs";

const mainOk = [
  "## Plan",
  "x",
  "## Delivery Self-Check",
  "| Criterion | Status |",
  "| a | Pass |",
  "## Follow-Up Queue",
  "- FU-1: later",
].join("\n");

test("main/bug require Self-Check and final Follow-Up Queue", () => {
  assert.deepEqual(findMissingDeliverySections("main", mainOk), []);
  assert.ok(isFollowUpQueueFinalSection(mainOk));
  assert.ok(
    findMissingDeliverySections("bug", "## Plan\nonly").includes("Delivery Self-Check"),
  );
  const wrongOrder = [
    "## Follow-Up Queue",
    "- FU-1",
    "## Delivery Self-Check",
    "| a | Pass |",
  ].join("\n");
  assert.ok(
    findMissingDeliverySections("main", wrongOrder).some((m) =>
      m.includes("final section"),
    ),
  );
});

const prepareSelfCheck = [
  "## Delivery Self-Check",
  "| Criterion | Evidence | Result |",
  "| suite | npm test | Pass |",
].join("\n");

test("prepare requires verdict and Self-Check; Follow-Up when Not ready or capped", () => {
  const ready = `${prepareSelfCheck}\n## Verdict\nReady\n## Proposed commit message\nchore: x\n`;
  assert.deepEqual(findMissingDeliverySections("prepare", ready), []);
  const notReady = "## Verdict\nNot ready\n";
  assert.ok(findMissingDeliverySections("prepare", notReady).includes("Follow-Up Queue"));
  assert.ok(findMissingDeliverySections("prepare", notReady).includes("Delivery Self-Check"));
  const cappedReady = "## Verdict\nReady\n## Proposed commit message\nfoo\n";
  const missing = findMissingDeliverySections("prepare", cappedReady, {
    prepareCapped: true,
  });
  assert.ok(missing.some((m) => /Not ready/i.test(m)));
});

test("prepare Not ready requires Follow-Up Queue as final section", () => {
  const wrongOrder = [
    prepareSelfCheck,
    "## Verdict",
    "Not ready",
    "## Follow-Up Queue",
    "- FU-1: fix remaining",
    "## Handoff",
    "try Main next",
  ].join("\n");
  assert.ok(
    findMissingDeliverySections("prepare", wrongOrder).some((m) =>
      m.includes("final section"),
    ),
  );

  const finalOk = [
    prepareSelfCheck,
    "## Verdict",
    "Not ready",
    "## Handoff",
    "try Main next",
    "## Follow-Up Queue",
    "- FU-1: fix remaining",
  ].join("\n");
  assert.deepEqual(findMissingDeliverySections("prepare", finalOk), []);
});

test("lite soft-gate requires Tests and Self-Check, not Follow-Up Queue", () => {
  const missing = findMissingDeliverySections("lite", "## Implementation\nonly");
  assert.ok(missing.includes("Tests"));
  assert.ok(missing.includes("Delivery Self-Check"));
  assert.equal(missing.some((item) => /Follow-Up/i.test(item)), false);

  const ok = [
    "## Tests",
    "npm test pass",
    "## Delivery Self-Check",
    "| Tests | npm test | Pass |",
  ].join("\n");
  assert.deepEqual(findMissingDeliverySections("lite", ok), []);
  assert.match(buildDeliveryStructureFollowup(missing, "lite"), /Mode Lite/);
  assert.match(buildDeliveryStructureFollowup(missing, "lite"), /Follow-Up Queue stays omitted/);
});

test("ship requires verdict and Self-Check; FUQ when Not ready or CI failed", () => {
  const green = [
    prepareSelfCheck,
    "## Verdict",
    "Ready",
    "## Commit",
    "abc123",
    "## Push",
    "origin/ship-lane",
    "## PR",
    "https://github.com/org/repo/pull/1",
    "## CI",
    "pass",
  ].join("\n");
  assert.deepEqual(findMissingDeliverySections("ship", green), []);

  const notReady = "## Verdict\nNot ready\n";
  const missingNotReady = findMissingDeliverySections("ship", notReady);
  assert.ok(missingNotReady.includes("Follow-Up Queue"));
  assert.ok(missingNotReady.includes("Delivery Self-Check"));

  const ciFail = [
    prepareSelfCheck,
    "## Verdict",
    "Ready",
    "## Commit",
    "abc",
    "## PR",
    "https://github.com/org/repo/pull/2",
    "## CI",
    "fail",
  ].join("\n");
  assert.ok(findMissingDeliverySections("ship", ciFail).includes("Follow-Up Queue"));

  const cappedGreen = findMissingDeliverySections("ship", green, { shipCiCapped: true });
  assert.ok(cappedGreen.some((item) => /Not ready/i.test(item)));
  assert.ok(cappedGreen.includes("Follow-Up Queue"));
});

test("buildDeliveryStructureFollowup mentions mode", () => {
  assert.match(
    buildDeliveryStructureFollowup(["Delivery Self-Check"], "main"),
    /main/,
  );
});

test("Delivery Tier line must include Confidence: NN% | Evidence:", () => {
  const withEvidence =
    "Delivery Tier: Full. Confidence: 90% | Evidence: `npm test` -> pass\n" + mainOk;
  assert.equal(hasDeliveryTierConfidenceEvidence(withEvidence), true);
  assert.deepEqual(findMissingDeliverySections("main", withEvidence), []);

  const bareTier = "## Plan\nDelivery Tier: Full\n" + mainOk.split("\n").slice(1).join("\n");
  assert.equal(hasDeliveryTierConfidenceEvidence(bareTier), false);
  assert.ok(
    findMissingDeliverySections("main", bareTier).some((m) =>
      m.includes("Confidence: NN% | Evidence:"),
    ),
  );
});
