import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateInstructionsPolicy } from "./instructions-policy-keywords.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const instructionsPath = join(repoRoot, "kodaelus", "instructions.md");
const instructions = readFileSync(instructionsPath, "utf8");

test("instructions.md passes shared policy validation", () => {
  const errors = validateInstructionsPolicy(instructions);
  assert.deepEqual(errors, [], errors.join("\n"));
});

test("instructions.md documents detectKodaelusMode for smoke keyword", () => {
  assert.ok(
    instructions.includes("detectKodaelusMode"),
    "missing detectKodaelusMode — required by HARDENED_POLICY_KEYWORDS",
  );
});
