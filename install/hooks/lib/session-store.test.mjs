import assert from "node:assert/strict";
import test from "node:test";
import {
  isActivatePrompt,
  isDeactivatePrompt,
} from "./session-store.mjs";

test("isActivatePrompt matches full Kodaelus activation phrases", () => {
  const activate = [
    "use kodaelus",
    "Use Kodaelus for this task",
    "switch to kodaelus",
    "activate kodaelus",
    "enable kodaelus",
    "with kodaelus please",
    "kodaelus mode",
  ];
  for (const prompt of activate) {
    assert.equal(isActivatePrompt(prompt), true, `expected activate: ${prompt}`);
  }
});

test("isActivatePrompt matches Kodaelus 1 planner phrases", () => {
  const activate = [
    "use kodaelus 1",
    "kodaelus 1",
    "kodaelus planner",
    "kodaelus prompt mode",
  ];
  for (const prompt of activate) {
    assert.equal(isActivatePrompt(prompt), true, `expected activate: ${prompt}`);
  }
});

test("isActivatePrompt rejects unrelated prompts", () => {
  const reject = [
    "hello world",
    "please fix the bug",
    "stop kodaelus",
    "normal mode",
    "use axiokrinos",
  ];
  for (const prompt of reject) {
    assert.equal(isActivatePrompt(prompt), false, `expected reject: ${prompt}`);
  }
});

test("isDeactivatePrompt matches opt-out phrases", () => {
  const deactivate = [
    "stop kodaelus",
    "disable kodaelus",
    "exit kodaelus",
    "normal mode",
    "without kodaelus",
  ];
  for (const prompt of deactivate) {
    assert.equal(isDeactivatePrompt(prompt), true, `expected deactivate: ${prompt}`);
  }
});
