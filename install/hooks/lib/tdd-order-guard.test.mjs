import assert from "node:assert/strict";
import test from "node:test";
import {
  firstTestCommandWasGreenWithoutPriorFail,
  hasFailingTestRun,
  isFailingTestOutcome,
  shouldDenyProductWriteForTddRedPhase,
  tddRedPhaseSelfCheckFails,
} from "./tdd-order-guard.mjs";

test("isFailingTestOutcome treats non-zero exit as fail", () => {
  assert.equal(isFailingTestOutcome("exit=1"), true);
  assert.equal(isFailingTestOutcome("exit=0"), false);
  assert.equal(isFailingTestOutcome("fail"), true);
  assert.equal(isFailingTestOutcome(""), false);
});

test("hasFailingTestRun uses firstFailingTest or shell evidence", () => {
  assert.equal(hasFailingTestRun({ command: "cargo test", outcome: "exit=1" }, []), true);
  assert.equal(
    hasFailingTestRun(null, [{ command: "cargo test", outcome: "exit=101" }]),
    true,
  );
  assert.equal(
    hasFailingTestRun(null, [{ command: "cargo test", outcome: "exit=0" }]),
    false,
  );
});

test("firstTestCommandWasGreenWithoutPriorFail matches tapesim skip-red", () => {
  assert.equal(
    firstTestCommandWasGreenWithoutPriorFail([
      { command: "cargo test", outcome: "exit=0" },
    ]),
    true,
  );
  assert.equal(
    firstTestCommandWasGreenWithoutPriorFail([
      { command: "cargo test", outcome: "exit=1" },
      { command: "cargo test", outcome: "exit=0" },
    ]),
    false,
  );
  assert.equal(firstTestCommandWasGreenWithoutPriorFail([]), false);
});

test("shouldDenyProductWriteForTddRedPhase is Main-only and skips Lite", () => {
  const denyMain = shouldDenyProductWriteForTddRedPhase({
    mode: "main",
    relativePaths: ["src/engine.rs"],
    touchedFiles: ["tests/engine.rs"],
    firstFailingTest: null,
    shellEvidence: [],
  });
  assert.equal(denyMain, true);

  const lite = shouldDenyProductWriteForTddRedPhase({
    mode: "lite",
    relativePaths: ["src/engine.rs"],
    touchedFiles: ["tests/engine.rs"],
    firstFailingTest: null,
    shellEvidence: [],
  });
  assert.equal(lite, false);

  const afterRed = shouldDenyProductWriteForTddRedPhase({
    mode: "main",
    relativePaths: ["src/engine.rs"],
    touchedFiles: ["tests/engine.rs"],
    firstFailingTest: { command: "cargo test", outcome: "exit=1" },
    shellEvidence: [],
  });
  assert.equal(afterRed, false);
});

test("tddRedPhaseSelfCheckFails when first test was already green", () => {
  assert.equal(
    tddRedPhaseSelfCheckFails({
      mode: "main",
      touchedFiles: ["tests/engine.rs", "src/lib.rs"],
      shellEvidence: [{ command: "cargo test", outcome: "exit=0" }],
    }),
    true,
  );
  assert.equal(
    tddRedPhaseSelfCheckFails({
      mode: "lite",
      touchedFiles: ["tests/engine.rs", "src/lib.rs"],
      shellEvidence: [{ command: "cargo test", outcome: "exit=0" }],
    }),
    false,
  );
});
