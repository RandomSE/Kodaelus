import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validatePolicyTree } from "./instructions-policy-keywords.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const policyRoot = join(repoRoot, "kodaelus");

function lineCount(text) {
  if (!text) return 0;
  const parts = text.split("\n");
  return text.endsWith("\n") ? parts.length - 1 : parts.length;
}

test("policy tree meets line budgets, keyword ownership, and isolation", () => {
  const errors = validatePolicyTree(policyRoot);
  assert.deepEqual(errors, [], errors.join("\n"));
});

test("instructions.md stub only redirects and stays under 40 lines", () => {
  const stub = readFileSync(join(policyRoot, "instructions.md"), "utf8");
  const lines = lineCount(stub);
  assert.ok(lines <= 40, `stub has ${lines} lines`);
  assert.match(stub, /core\.md/);
  assert.match(stub, /exactly one mode/);
  assert.doesNotMatch(stub, /## File Deletion Protocol/);
  assert.doesNotMatch(stub, /## Delivery Tiers/);
  assert.doesNotMatch(stub, /## Process Framework/);
});
