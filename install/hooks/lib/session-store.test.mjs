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
  approveScope,
  getScopeStatus,
  getSessionMetadata,
  getSessionMode,
  isActivatePrompt,
  setPlanFileEstimate,
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
  assert.equal(detectKodaelusMode("use kodaelus ship"), "ship");
  assert.equal(detectKodaelusMode("use kodaelus 7"), "ship");
  assert.equal(detectKodaelusMode("kodaelus ship mode"), "ship");
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

test("isMutatingMode includes prepare and ship; isReadOnlyMode excludes them", () => {
  assert.equal(isMutatingMode("prepare"), true);
  assert.equal(isReadOnlyMode("prepare"), false);
  assert.equal(isMutatingMode("ship"), true);
  assert.equal(isReadOnlyMode("ship"), false);
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

test("ship CI repair allows 3 product fixes then caps until ship ci continue", async () => {
  const store = await import("./session-store.mjs");
  assert.equal(store.isShipCiContinuePrompt("ship ci continue"), true);
  assert.equal(store.isShipCiContinuePrompt("ship continue"), false);
  assert.equal(store.classifyShipCiPoll("gh pr checks", "fail"), "fail");
  assert.equal(store.classifyShipCiPoll("gh run view 9", "pending"), "pending");
  assert.equal(store.classifyShipCiPoll("gh pr merge", "fail"), null);

  activateSession("conv-ship-ci", "ship");
  store.recordShipCiPoll("conv-ship-ci", "fail");
  assert.equal(store.isShipCiRepairCapped("conv-ship-ci"), false);
  store.recordShipCiRepairEdit("conv-ship-ci");
  store.recordShipCiRepairEdit("conv-ship-ci");
  store.recordShipCiRepairEdit("conv-ship-ci");
  assert.equal(store.isShipCiRepairCapped("conv-ship-ci"), true);
  store.approveShipCiContinue("conv-ship-ci");
  assert.equal(store.isShipCiRepairCapped("conv-ship-ci"), false);

  store.recordShipCiPoll("conv-ship-ci", "pending");
  store.recordShipCiPoll("conv-ship-ci", "pending");
  store.recordShipCiPoll("conv-ship-ci", "pending");
  store.recordShipCiPoll("conv-ship-ci", "pending");
  assert.equal(store.isShipCiPollLimited("conv-ship-ci"), true);
  deactivateSession("conv-ship-ci");
});

test("product file budget is N plus slack, not max(10, 2N)", () => {
  activateSession("conv-slack", "main");
  setPlanFileEstimate("conv-slack", 4);
  for (let i = 0; i < 6; i += 1) {
    recordTouchedFile("conv-slack", `src/p-${i}.ts`);
  }

  const atSlack = getScopeStatus("conv-slack");
  assert.equal(atSlack.count, 6);
  assert.equal(atSlack.limit, 6);
  assert.equal(atSlack.exceeded, false);

  recordTouchedFile("conv-slack", "src/p-6.ts");
  assert.equal(getScopeStatus("conv-slack").exceeded, true);
  deactivateSession("conv-slack");
});

test("odd File count uses half rounded up as slack", () => {
  activateSession("conv-slack-odd", "main");
  setPlanFileEstimate("conv-slack-odd", 5);
  assert.equal(getScopeStatus("conv-slack-odd").limit, 8);
  deactivateSession("conv-slack-odd");
});

test("tests and .kodaelus paths do not consume the product budget", () => {
  activateSession("conv-companions", "main");
  const ignored = [
    "install/hooks/lib/plan-estimate.test.mjs",
    "tests/engine.rs",
    ".kodaelus/HANDOFF.md",
    "src/FooTest.java",
    "src/FooTests.cs",
    "tests/test_parser.py",
    "pkg/foo_test.go",
    "test/support/setup.js",
    "__tests__/index.js",
    "spec/models/user.rb",
    "tests/fixtures/data.json",
    "testdata/input.txt",
    "src/__snapshots__/a.snap",
    "src/user.fixture.json",
  ];
  for (const rel of ignored) recordTouchedFile("conv-companions", rel);
  recordTouchedFile("conv-companions", "src/lib.ts");
  recordTouchedFile("conv-companions", "src/latest.ts");
  recordTouchedFile("conv-companions", "src/testing/helper.ts");

  const status = getScopeStatus("conv-companions");
  assert.equal(status.count, 3);
  assert.equal(getSessionMetadata("conv-companions")?.touchedFiles.length, ignored.length + 3);
  deactivateSession("conv-companions");
});

test("the first File count locks and a later count cannot replace it", () => {
  activateSession("conv-lock", "main");
  assert.equal(setPlanFileEstimate("conv-lock", 4), true);
  assert.equal(setPlanFileEstimate("conv-lock", 40), false);
  assert.equal(getSessionMetadata("conv-lock")?.planFileEstimate, 4);
  deactivateSession("conv-lock");
});

test("beginScopeTask clears the task window and unlocks File count", async () => {
  const store = await import("./session-store.mjs");
  assert.equal(typeof store.beginScopeTask, "function");
  store.activateSession("conv-window", "main");
  store.setPlanFileEstimate("conv-window", 4);
  store.recordTouchedFile("conv-window", "src/a.ts");
  store.recordTouchedFile("conv-window", "src/a.test.ts");

  assert.equal(store.beginScopeTask("conv-window"), true);

  const meta = store.getSessionMetadata("conv-window");
  assert.equal(meta?.planFileEstimate, null);
  assert.equal(meta?.scopeBaseline, 0);
  assert.deepEqual(meta?.taskProductFiles, []);
  assert.deepEqual(meta?.touchedFiles, ["src/a.ts", "src/a.test.ts"]);
  assert.equal(store.setPlanFileEstimate("conv-window", 9), true);
  store.deactivateSession("conv-window");
});

test("approveScope grants one slack and does not allow unlimited product files", () => {
  activateSession("conv-rearm", "main");
  setPlanFileEstimate("conv-rearm", 4);
  for (let i = 0; i < 6; i += 1) {
    recordTouchedFile("conv-rearm", `src/r-${i}.ts`);
  }

  approveScope("conv-rearm");
  assert.equal(getSessionMetadata("conv-rearm")?.scopeBaseline, 6);
  assert.equal(getScopeStatus("conv-rearm").limit, 8);
  assert.equal(getScopeStatus("conv-rearm").exceeded, false);

  recordTouchedFile("conv-rearm", "src/r-6.ts");
  recordTouchedFile("conv-rearm", "src/r-7.ts");
  assert.equal(getScopeStatus("conv-rearm").exceeded, false);
  recordTouchedFile("conv-rearm", "src/r-8.ts");
  assert.equal(getScopeStatus("conv-rearm").exceeded, true);
  deactivateSession("conv-rearm");
});

test("assessScopeEdit denies a batch that would pass the limit and does not require recording", async () => {
  const store = await import("./session-store.mjs");
  assert.equal(typeof store.assessScopeEdit, "function");
  store.activateSession("conv-batch", "main");
  store.setPlanFileEstimate("conv-batch", 4);
  for (let i = 0; i < 5; i += 1) {
    store.recordTouchedFile("conv-batch", `src/b-${i}.ts`);
  }

  const preview = store.assessScopeEdit("conv-batch", [
    "src/b-5.ts",
    "src/b-6.ts",
    "src/b-5.test.ts",
  ]);
  assert.equal(preview.exceeded, true);
  assert.equal(preview.limit, 6);
  assert.equal(store.getScopeStatus("conv-batch").count, 5);
  store.deactivateSession("conv-batch");
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
