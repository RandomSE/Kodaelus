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
});

test("isBugInvestigationMode is true only for bug mode", () => {
  assert.equal(isBugInvestigationMode("bug"), true);
  assert.equal(isBugInvestigationMode("main"), false);
});

test("isMutatingMode is true for main and lite only", () => {
  assert.equal(isMutatingMode("main"), true);
  assert.equal(isMutatingMode("lite"), true);
  assert.equal(isMutatingMode("prompt"), false);
});
