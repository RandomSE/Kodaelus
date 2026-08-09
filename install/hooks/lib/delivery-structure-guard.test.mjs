import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeliveryStructureFollowup,
  findMissingDeliverySections,
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

test("prepare requires verdict; Follow-Up when Not ready or capped", () => {
  const ready = "## Verdict\nReady\n## Proposed commit message\nchore: x\n";
  assert.deepEqual(findMissingDeliverySections("prepare", ready), []);
  const notReady = "## Verdict\nNot ready\n";
  assert.ok(findMissingDeliverySections("prepare", notReady).includes("Follow-Up Queue"));
  const cappedReady = "## Verdict\nReady\n## Proposed commit message\nfoo\n";
  const missing = findMissingDeliverySections("prepare", cappedReady, {
    prepareCapped: true,
  });
  assert.ok(missing.some((m) => /Not ready/i.test(m)));
});

test("prepare Not ready requires Follow-Up Queue as final section", () => {
  const wrongOrder = [
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
    "## Verdict",
    "Not ready",
    "## Handoff",
    "try Main next",
    "## Follow-Up Queue",
    "- FU-1: fix remaining",
  ].join("\n");
  assert.deepEqual(findMissingDeliverySections("prepare", finalOk), []);
});

test("buildDeliveryStructureFollowup mentions mode", () => {
  assert.match(
    buildDeliveryStructureFollowup(["Delivery Self-Check"], "main"),
    /main/,
  );
});
