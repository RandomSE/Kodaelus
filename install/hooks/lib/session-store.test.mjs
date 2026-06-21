import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  activateSession,
  deactivateSession,
  detectKodaelusMode,
  getSessionMode,
  isActivatePrompt,
  isDeactivatePrompt,
  isSessionActive,
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
