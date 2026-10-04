import assert from "node:assert/strict";
import test from "node:test";
import {
  detectKodaelusMode,
  isBugInvestigationMode,
  isMutatingMode,
  isReadOnlyMode,
} from "./kodaelus-mode.mjs";
import { detectKodaelusMode as hookDetect } from "../hooks/lib/session-store.mjs";

test("session-store re-exports match shared kodaelus-mode", () => {
  const samples = [
    "use kodaelus",
    "use kodaelus 1",
    "use kodaelus 2",
    "use kodaelus bugfix",
    "use kodaelus prepare",
    "use kodaelus 6",
    "stop kodaelus",
  ];
  for (const sample of samples) {
    assert.equal(hookDetect(sample), detectKodaelusMode(sample));
  }
});

test("isReadOnlyMode covers prompt, suggest, and question", () => {
  assert.equal(isReadOnlyMode("prompt"), true);
  assert.equal(isReadOnlyMode("suggest"), true);
  assert.equal(isReadOnlyMode("question"), true);
  assert.equal(isReadOnlyMode("main"), false);
  assert.equal(isReadOnlyMode("lite"), false);
  assert.equal(isReadOnlyMode("bug"), false);
  assert.equal(isReadOnlyMode("prepare"), false);
});

test("isBugInvestigationMode is true only for bug mode", () => {
  assert.equal(isBugInvestigationMode("bug"), true);
  assert.equal(isBugInvestigationMode("main"), false);
});

test("isMutatingMode is true for main, lite, prepare, and ship", () => {
  assert.equal(isMutatingMode("main"), true);
  assert.equal(isMutatingMode("lite"), true);
  assert.equal(isMutatingMode("prepare"), true);
  assert.equal(isMutatingMode("ship"), true);
  assert.equal(isMutatingMode("prompt"), false);
});

test("sticky: main + same-block use kodaelus 1 → main", () => {
  const paste = ["use kodaelus main", "use kodaelus 1", "# Goal", "Ship it."].join("\n");
  assert.equal(detectKodaelusMode(paste), "main");
});

test("sticky: main + kodaelus prompt mode mention → main", () => {
  const paste = [
    "use kodaelus main",
    "Recommended draft mentioned kodaelus prompt mode earlier.",
    "# Spec",
  ].join("\n");
  assert.equal(detectKodaelusMode(paste), "main");
});

test("sticky: use kodaelus 1 alone → prompt", () => {
  assert.equal(detectKodaelusMode("use kodaelus 1"), "prompt");
});

test("sticky: use kodaelus 1 then soft later-main without upgrade token → prompt", () => {
  const paste = [
    "use kodaelus 1",
    "",
    "Plan the change; we can switch to main later.",
  ].join("\n");
  assert.equal(detectKodaelusMode(paste), "prompt");
});

test("sticky: trailing use kodaelus main after body use kodaelus 1 → main", () => {
  const paste = [
    "Body mentions use kodaelus 1 and kodaelus prompt mode.",
    "",
    "use kodaelus main",
  ].join("\n");
  assert.equal(detectKodaelusMode(paste), "main");
});

test("sticky: explicit upgrade token beats earlier prompt phrase", () => {
  const paste = [
    "use kodaelus 1",
    "",
    "Later we will use kodaelus main for the fix.",
  ].join("\n");
  assert.equal(detectKodaelusMode(paste), "main");
});

test("sticky: leftmost mutating upgrade wins among upgrades", () => {
  assert.equal(
    detectKodaelusMode("use kodaelus lite\n\nthen use kodaelus main"),
    "lite",
  );
});

test("sticky: bare use kodaelus with contaminated prompt body → main", () => {
  const paste = [
    "use kodaelus",
    "Prior planner said use kodaelus 1 and kodaelus prompt mode.",
  ].join("\n");
  assert.equal(detectKodaelusMode(paste), "main");
});

test("sticky: run it / execute beat prompt body mentions", () => {
  assert.equal(
    detectKodaelusMode("Docs say use kodaelus 1.\n\nrun it"),
    "main",
  );
  assert.equal(
    detectKodaelusMode("kodaelus prompt mode was used.\n\nexecute"),
    "main",
  );
});

test("execute: whole-line execute upgrades; prose execute does not", () => {
  assert.equal(detectKodaelusMode("execute"), "main");
  assert.equal(detectKodaelusMode("execute!"), "main");
  assert.equal(detectKodaelusMode("please execute."), "main");
  assert.equal(detectKodaelusMode("execute the tests"), null);
  assert.equal(
    detectKodaelusMode("use kodaelus 1\n\nthen execute the migration"),
    "prompt",
  );
  assert.equal(
    detectKodaelusMode("Body mentions use kodaelus 1.\n\nexecute the plan"),
    "prompt",
  );
});

test("display names do not activate: Planner / Prompt, Main mode (0), Mode Lite (4)", () => {
  assert.equal(detectKodaelusMode("Planner / Prompt mode (1). Read-only spec."), null);
  assert.equal(detectKodaelusMode("Main mode (0). Bug fix. TDD."), null);
  assert.equal(detectKodaelusMode("Mode Lite (4) for a tiny edit."), null);
});
