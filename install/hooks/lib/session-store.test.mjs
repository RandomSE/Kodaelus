import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  activateSession,
  deactivateSession,
  detectKodaelusMode,
  detectSuggestSubMode,
  getScopeStatus,
  getSessionMode,
  isActivatePrompt,
  isDeactivatePrompt,
  isMutatingMode,
  isReadOnlyMode,
  isSessionActive,
  recordTouchedFile,
  setSessionMode,
} from "./session-store.mjs";

let tempHome;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-session-store-"));
  process.env.CURSOR_HOME = tempHome;
});

test.afterEach(() => {
  delete process.env.CURSOR_HOME;
  rmSync(tempHome, { recursive: true, force: true });
});

test("detectKodaelusMode: bare use kodaelus → main", () => {
  assert.equal(detectKodaelusMode("use kodaelus"), "main");
  assert.equal(detectKodaelusMode("Use kodaelus for this task"), "main");
});

test("detectKodaelusMode: main aliases → main", () => {
  assert.equal(detectKodaelusMode("use kodaelus 0"), "main");
  assert.equal(detectKodaelusMode("use kodaelus main"), "main");
  assert.equal(detectKodaelusMode("kodaelus mode"), "main");
});

test("detectKodaelusMode: prompt aliases → prompt", () => {
  assert.equal(detectKodaelusMode("use kodaelus 1"), "prompt");
  assert.equal(detectKodaelusMode("use kodaelus p"), "prompt");
  assert.equal(detectKodaelusMode("use kodaelus prompt"), "prompt");
  assert.equal(detectKodaelusMode("kodaelus planner"), "prompt");
  assert.equal(detectKodaelusMode("kodaelus prompt mode"), "prompt");
});

test("detectKodaelusMode: bug investigation aliases → bug", () => {
  assert.equal(detectKodaelusMode("use kodaelus 2"), "bug");
  assert.equal(detectKodaelusMode("use kodaelus b"), "bug");
  assert.equal(detectKodaelusMode("use kodaelus bug"), "bug");
  assert.equal(detectKodaelusMode("kodaelus bug mode"), "bug");
});

test("detectKodaelusMode: bugfix and bug fix → main (NOT bug)", () => {
  assert.equal(detectKodaelusMode("use kodaelus bugfix"), "main");
  assert.equal(detectKodaelusMode("use kodaelus bug fix"), "main");
  assert.equal(detectKodaelusMode("use kodaelus bug-fix"), "main");
  assert.equal(detectKodaelusMode("bugfix"), "main");
  assert.equal(detectKodaelusMode("bug fix"), "main");
});

test("detectKodaelusMode: non-kodaelus prompts → null", () => {
  assert.equal(detectKodaelusMode("please fix the bug"), null);
  assert.equal(detectKodaelusMode("hello world"), null);
});

test("detectKodaelusMode: deactivate phrases → null", () => {
  assert.equal(detectKodaelusMode("stop kodaelus"), null);
  assert.equal(detectKodaelusMode("normal mode"), null);
});

test("detectKodaelusMode: suggest, lite, question, and prepare modes", () => {
  assert.equal(detectKodaelusMode("use kodaelus suggest"), "suggest");
  assert.equal(detectKodaelusMode("use kodaelus 3"), "suggest");
  assert.equal(detectKodaelusMode("use kodaelus lite"), "lite");
  assert.equal(detectKodaelusMode("use kodaelus 4"), "lite");
  assert.equal(detectKodaelusMode("use kodaelus fast"), "lite");
  assert.equal(detectKodaelusMode("use kodaelus q"), "question");
  assert.equal(detectKodaelusMode("use kodaelus 5"), "question");
  assert.equal(detectKodaelusMode("use kodaelus prepare"), "prepare");
  assert.equal(detectKodaelusMode("use kodaelus 6"), "prepare");
  assert.equal(detectKodaelusMode("use kodaelus prep"), "prepare");
  assert.equal(detectKodaelusMode("kodaelus prepare mode"), "prepare");
});

test("detectKodaelusMode: leading prepare beats body prompt mentions", () => {
  const paste = [
    "use kodaelus prepare",
    "",
    "# Review",
    "Prior draft used use kodaelus 1 and kodaelus prompt mode.",
  ].join("\n");
  assert.equal(detectKodaelusMode(paste), "prepare");
});

test("isMutatingMode includes prepare; isReadOnlyMode excludes it", () => {
  assert.equal(isMutatingMode("prepare"), true);
  assert.equal(isReadOnlyMode("prepare"), false);
});

test("detectKodaelusMode: leading activation beats body prompt mentions", () => {
  const paste = [
    "use kodaelus main",
    "",
    "# Feature",
    "Update Prompt mode (1). Prior: use kodaelus 1",
    "Kodaelus 1 (Prompt mode) produces prompts.",
    "Docs mention kodaelus prompt mode and say use kodaelus prompt to draft.",
  ].join("\n");
  assert.equal(detectKodaelusMode(paste), "main");
});

test("detectKodaelusMode: body-only activation still works without leading phrase", () => {
  const delayed = [
    "Please implement the following after review.",
    "",
    "use kodaelus main",
    "",
    "# Task",
    "Ship the fix.",
  ].join("\n");
  assert.equal(detectKodaelusMode(delayed), "main");
});

test("getScopeStatus uses count > limit (allow exactly limit files)", () => {
  activateSession("conv-scope-status", "main");
  for (let i = 0; i < 10; i += 1) {
    recordTouchedFile("conv-scope-status", `src/file-${i}.ts`);
  }

  const atLimit = getScopeStatus("conv-scope-status");
  assert.equal(atLimit.count, 10);
  assert.equal(atLimit.limit, 10);
  assert.equal(atLimit.exceeded, false);

  recordTouchedFile("conv-scope-status", "src/file-10.ts");
  const overLimit = getScopeStatus("conv-scope-status");
  assert.equal(overLimit.count, 11);
  assert.equal(overLimit.exceeded, true);

  deactivateSession("conv-scope-status");
});

test("isActivatePrompt uses detectKodaelusMode and legacy phrases", () => {
  assert.equal(isActivatePrompt("Use kodaelus for this task"), true);
  assert.equal(isActivatePrompt("use kodaelus 1"), true);
  assert.equal(isActivatePrompt("use kodaelus 2"), true);
  assert.equal(isActivatePrompt("use kodaelus bug"), true);
  assert.equal(isActivatePrompt("use kodaelus bugfix"), true);
  assert.equal(isActivatePrompt("kodaelus planner"), true);
  assert.equal(isActivatePrompt("please fix the bug"), false);
  assert.equal(isDeactivatePrompt("stop kodaelus"), true);
  assert.equal(isDeactivatePrompt("normal mode"), true);
});

test("activateSession persists mode", () => {
  activateSession("conv-prompt", "prompt");
  assert.equal(isSessionActive("conv-prompt"), true);
  assert.equal(getSessionMode("conv-prompt"), "prompt");
});

test("activateSession defaults to main", () => {
  activateSession("conv-main");
  assert.equal(getSessionMode("conv-main"), "main");
});

test("activateSession updates mode when already active", () => {
  activateSession("conv-switch", "prompt");
  activateSession("conv-switch", "bug");
  assert.equal(getSessionMode("conv-switch"), "bug");
});

test("setSessionMode upgrades prompt to main", () => {
  activateSession("conv-upgrade", "prompt");
  setSessionMode("conv-upgrade", "main");
  assert.equal(getSessionMode("conv-upgrade"), "main");
  assert.equal(isSessionActive("conv-upgrade"), true);
});

test("deactivateSession removes mode", () => {
  activateSession("conv-off", "bug");
  deactivateSession("conv-off");
  assert.equal(isSessionActive("conv-off"), false);
  assert.equal(getSessionMode("conv-off"), null);
});

test("legacy store without modes defaults to main", () => {
  activateSession("conv-legacy");
  assert.equal(getSessionMode("conv-legacy"), "main");
});

test("detectSuggestSubMode and isMutatingMode", () => {
  assert.equal(detectSuggestSubMode("use kodaelus suggest issues"), "issues");
  assert.equal(detectSuggestSubMode("use kodaelus suggest features"), "features");
  assert.equal(detectSuggestSubMode("use kodaelus suggest"), null);
  assert.equal(isMutatingMode("main"), true);
  assert.equal(isMutatingMode("lite"), true);
  assert.equal(isMutatingMode("prepare"), true);
  assert.equal(isMutatingMode("prompt"), false);
});

test("prepare fix-cycle metadata and shell evidence", async () => {
  const {
    approvePrepareContinue,
    isPrepareContinuePrompt,
    isPrepareFixCycleCapped,
    recordPrepareSuiteAttempt,
    recordShellEvidence,
    getSessionMetadata,
    PREPARE_MAX_FIX_CYCLES,
  } = await import("./session-store.mjs");

  assert.equal(isPrepareContinuePrompt("prepare continue"), true);
  assert.equal(PREPARE_MAX_FIX_CYCLES, 3);

  activateSession("conv-prep-meta", "prepare");
  recordPrepareSuiteAttempt("conv-prep-meta");
  recordPrepareSuiteAttempt("conv-prep-meta");
  recordPrepareSuiteAttempt("conv-prep-meta");
  assert.equal(isPrepareFixCycleCapped("conv-prep-meta"), false);
  recordPrepareSuiteAttempt("conv-prep-meta");
  assert.equal(isPrepareFixCycleCapped("conv-prep-meta"), true);
  approvePrepareContinue("conv-prep-meta");
  assert.equal(isPrepareFixCycleCapped("conv-prep-meta"), false);

  recordShellEvidence("conv-prep-meta", "npm test", "exit=0");
  const meta = getSessionMetadata("conv-prep-meta");
  assert.equal(meta?.shellEvidence.at(-1)?.command, "npm test");
  deactivateSession("conv-prep-meta");
});

test("recordFirstFailingTest persists cargo/npm stdout", async () => {
  const { recordFirstFailingTest, getSessionMetadata } = await import("./session-store.mjs");
  activateSession("conv-fail-stdout", "main");
  recordFirstFailingTest("conv-fail-stdout", {
    command: "cargo test",
    outcome: "exit=101",
    stdout: "test matching::it_works ... FAILED",
  });
  const meta = getSessionMetadata("conv-fail-stdout");
  assert.equal(meta?.firstFailingTest?.command, "cargo test");
  assert.match(meta?.firstFailingTest?.stdout ?? "", /FAILED/);
  deactivateSession("conv-fail-stdout");
});
