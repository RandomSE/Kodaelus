import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CANONICAL_PURPOSE,
  INSTALL_JOB_ONELINER,
  validateInstructionsPolicy,
} from "./instructions-policy-keywords.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const instructionsPath = join(repoRoot, "kodaelus", "instructions.md");
const instructions = readFileSync(instructionsPath, "utf8");
const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const agent = readFileSync(
  join(repoRoot, "install", "templates", "kodaelus.agent.md"),
  "utf8",
);
const skill = readFileSync(
  join(repoRoot, "install", "templates", "kodaelus.skill.md"),
  "utf8",
);
const sessionRule = readFileSync(
  join(repoRoot, "install", "templates", "kodaelus-session.rule.mdc"),
  "utf8",
);

test("instructions.md passes shared policy validation", () => {
  const errors = validateInstructionsPolicy(instructions);
  assert.deepEqual(errors, [], errors.join("\n"));
});

test("instructions.md documents detectKodaelusMode for smoke keyword", () => {
  assert.ok(
    instructions.includes("detectKodaelusMode"),
    "missing detectKodaelusMode - required by HARDENED_POLICY_KEYWORDS",
  );
});

test("canonical purpose is identical in README, package.json, and instructions.md", () => {
  assert.equal(pkg.description, CANONICAL_PURPOSE);
  assert.ok(readme.includes(CANONICAL_PURPOSE), "README missing canonical purpose");
  assert.ok(
    instructions.includes(CANONICAL_PURPOSE),
    "instructions.md missing canonical purpose",
  );
  const purposeIdx = instructions.indexOf("## Purpose & operating model");
  const boundsIdx = instructions.indexOf("## Hard Boundaries");
  assert.ok(purposeIdx >= 0 && purposeIdx < boundsIdx, "Purpose must precede Hard Boundaries");
});

test("hook-absent contract heading sits after Purpose and before Hard Boundaries", () => {
  const heading = "## Hook-absent contract (cloud / SDK)";
  const purposeIdx = instructions.indexOf("## Purpose & operating model");
  const hookIdx = instructions.indexOf(heading);
  const boundsIdx = instructions.indexOf("## Hard Boundaries");
  assert.ok(hookIdx >= 0, "missing ## Hook-absent contract (cloud / SDK)");
  assert.ok(
    purposeIdx < hookIdx && hookIdx < boundsIdx,
    "Hook-absent contract must sit after Purpose & operating model and before Hard Boundaries",
  );
  assert.ok(instructions.includes("Hook-absent contract"), "missing phrase Hook-absent contract");
  assert.ok(
    instructions.includes("project-guidelines.md"),
    "missing phrase project-guidelines.md",
  );
  assert.ok(instructions.includes("TDD write order"), "missing TDD write-order rule");
});

test("README points cloud/SDK readers at the hook-absent contract", () => {
  assert.ok(
    readme.includes("Hook-absent contract"),
    "README should mention Hook-absent contract for cloud/SDK sessions without IDE hooks",
  );
});

test("install one-liners state the same job", () => {
  assert.ok(agent.includes(INSTALL_JOB_ONELINER), "agent description missing job one-liner");
  assert.ok(skill.includes(INSTALL_JOB_ONELINER), "skill description missing job one-liner");
  assert.ok(
    sessionRule.includes(INSTALL_JOB_ONELINER),
    "session rule description missing job one-liner",
  );
});

test("modes tables warn bug investigates and bugfix implements in Main", () => {
  const warning =
    "`use kodaelus bug` investigates, `bugfix` / `use kodaelus bugfix` implements in Main.";
  assert.ok(readme.includes(warning), "README missing bug vs bugfix warning");
  assert.ok(instructions.includes(warning), "instructions.md missing bug vs bugfix warning");
  assert.ok(skill.includes(warning), "skill missing bug vs bugfix warning");
  assert.ok(sessionRule.includes(warning), "session rule missing bug vs bugfix warning");
});

test("user-facing names distinguish Planner/Prompt and Mode Lite vs Delivery Tier Lite", () => {
  assert.ok(readme.includes("Planner / Prompt (1)"));
  assert.ok(readme.includes("Mode Lite (4)"));
  assert.ok(readme.includes("Delivery Tier Lite"));
  assert.ok(instructions.includes("Planner / Prompt"));
  assert.ok(instructions.includes("### Lite mode (4)"));
  assert.ok(instructions.includes("Mode Lite (4) vs Delivery Tier Lite"));
  assert.ok(instructions.includes("### Main mode response structure (default Delivery Tier Full)"));
  assert.doesNotMatch(instructions, /### Full mode \(default\)/);
});

test("AGENTS.md documents root and SDK tests plus README SDK heading", () => {
  const agents = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
  assert.ok(agents.includes("## SDK (CLI and programmatic API)"));
  assert.ok(agents.includes("README.md#sdk-cli-and-programmatic-api"));
  assert.ok(agents.includes("npm test"));
  assert.ok(agents.includes("cd sdk && npm test"));
});
