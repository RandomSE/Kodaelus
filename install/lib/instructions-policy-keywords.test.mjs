import assert from "node:assert/strict";
import test from "node:test";
import {
  HOOK_ABSENT_HEADING,
  checkHookAbsentContract,
} from "./instructions-policy-keywords.mjs";

const PURPOSE = "## Purpose & operating model";
const BOUNDS = "## Hard Boundaries";

function fixture(body) {
  return `${PURPOSE}\n\nPurpose body.\n\n${body}\n\n${BOUNDS}\n\nBounds body.\n`;
}

test("HOOK_ABSENT_HEADING is the locked cloud/SDK heading", () => {
  assert.equal(HOOK_ABSENT_HEADING, "## Hook-absent contract (cloud / SDK)");
});

test("checkHookAbsentContract passes when heading, phrases, and order are present", () => {
  const content = fixture(
    `${HOOK_ABSENT_HEADING}\n\nHonor-system Plan first.\nTDD write order forbids parallel test+impl batches.\nDo not create project-guidelines.md.\nThe Plan-first message is exempt from Full-order length.\n`,
  );
  assert.deepEqual(checkHookAbsentContract(content), []);
});

test("checkHookAbsentContract fails when heading is missing", () => {
  const content = fixture(
    "TDD write order\nproject-guidelines.md\nHook-absent contract\nPlan-first message is exempt\n",
  );
  const errors = checkHookAbsentContract(content);
  assert.ok(
    errors.some((e) => e.includes(HOOK_ABSENT_HEADING)),
    errors.join("\n"),
  );
});

test("checkHookAbsentContract fails when heading is after Hard Boundaries", () => {
  const content = `${PURPOSE}\n\n${BOUNDS}\n\n${HOOK_ABSENT_HEADING}\nTDD write order\nproject-guidelines.md\nPlan-first message is exempt\n`;
  const errors = checkHookAbsentContract(content);
  assert.ok(
    errors.some((e) => /after Purpose.*before Hard Boundaries/i.test(e)),
    errors.join("\n"),
  );
});

test("checkHookAbsentContract fails when TDD write order phrase is missing", () => {
  const content = fixture(
    `${HOOK_ABSENT_HEADING}\n\nHook-absent contract\nproject-guidelines.md\nPlan-first message is exempt\n`,
  );
  const errors = checkHookAbsentContract(content);
  assert.ok(
    errors.some((e) => e.includes("TDD write order")),
    errors.join("\n"),
  );
});

test("checkHookAbsentContract fails when project-guidelines.md phrase is missing", () => {
  const content = fixture(
    `${HOOK_ABSENT_HEADING}\n\nHook-absent contract\nTDD write order\nPlan-first message is exempt\n`,
  );
  const errors = checkHookAbsentContract(content);
  assert.ok(
    errors.some((e) => e.includes("project-guidelines.md")),
    errors.join("\n"),
  );
});

test("checkHookAbsentContract fails when Plan-first exemption phrase is missing", () => {
  const content = fixture(
    `${HOOK_ABSENT_HEADING}\n\nHook-absent contract\nTDD write order\nproject-guidelines.md\n`,
  );
  const errors = checkHookAbsentContract(content);
  assert.ok(
    errors.some((e) => e.includes("Plan-first message is exempt")),
    errors.join("\n"),
  );
});
