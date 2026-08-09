import assert from "node:assert/strict";
import test from "node:test";
import {
  hasTestEvidence,
  isFullSuiteShellCommand,
  needsTestEvidenceGate,
  touchedProductImplementation,
} from "./test-evidence-guard.mjs";

test("full suite and test-like detection", () => {
  assert.equal(isFullSuiteShellCommand("npm test"), true);
  assert.equal(isFullSuiteShellCommand("npm run test:hooks"), true);
  assert.equal(isFullSuiteShellCommand("vitest run"), true);
  assert.equal(isFullSuiteShellCommand("ls"), false);
});

test("touchedProductImplementation ignores artifacts and tests", () => {
  assert.equal(touchedProductImplementation([".kodaelus/bugs/a.md"]), false);
  assert.equal(touchedProductImplementation(["src/a.test.ts"]), false);
  assert.equal(touchedProductImplementation(["src/a.ts"]), true);
});

test("needsTestEvidenceGate soft condition", () => {
  const impl = [
    "## Implementation",
    "x".repeat(100),
    "## Plan",
  ].join("\n");
  assert.equal(
    needsTestEvidenceGate({ text: impl, touchedFiles: [], shellEvidence: [] }),
    true,
  );
  assert.equal(
    needsTestEvidenceGate({
      text: impl,
      touchedFiles: ["src/a.ts"],
      shellEvidence: [{ command: "npm test", outcome: "exit=0" }],
    }),
    false,
  );
  assert.equal(
    hasTestEvidence("## Tests\nnpm test → pass\n", []),
    true,
  );
});
