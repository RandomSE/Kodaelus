import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CANONICAL_PURPOSE,
  INSTALL_JOB_ONELINER,
  validatePolicyTree,
} from "./instructions-policy-keywords.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const policyRoot = join(repoRoot, "kodaelus");
const instructions = readFileSync(join(policyRoot, "instructions.md"), "utf8");
const core = readFileSync(join(policyRoot, "core.md"), "utf8");
const mainMode = readFileSync(join(policyRoot, "modes", "main.md"), "utf8");
const liteMode = readFileSync(join(policyRoot, "modes", "lite.md"), "utf8");
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

test("policy tree passes shared validation", () => {
  const errors = validatePolicyTree(policyRoot);
  assert.deepEqual(errors, [], errors.join("\n"));
});

test("core.md documents detectKodaelusMode for smoke keyword", () => {
  assert.ok(
    core.includes("detectKodaelusMode"),
    "missing detectKodaelusMode - required by HARDENED_POLICY_KEYWORDS",
  );
});

test("canonical purpose is identical in README, package.json, and core.md", () => {
  assert.equal(pkg.description, CANONICAL_PURPOSE);
  assert.ok(readme.includes(CANONICAL_PURPOSE), "README missing canonical purpose");
  assert.ok(core.includes(CANONICAL_PURPOSE), "core.md missing canonical purpose");
  const purposeIdx = core.indexOf("## Purpose & operating model");
  const boundsIdx = core.indexOf("## Hard Boundaries");
  assert.ok(purposeIdx >= 0 && purposeIdx < boundsIdx, "Purpose must precede Hard Boundaries");
});

test("hook-absent contract heading sits after Purpose and before Hard Boundaries", () => {
  const heading = "## Hook-absent contract (cloud / SDK)";
  const purposeIdx = core.indexOf("## Purpose & operating model");
  const hookIdx = core.indexOf(heading);
  const boundsIdx = core.indexOf("## Hard Boundaries");
  assert.ok(hookIdx >= 0, "missing ## Hook-absent contract (cloud / SDK)");
  assert.ok(
    purposeIdx < hookIdx && hookIdx < boundsIdx,
    "Hook-absent contract must sit after Purpose & operating model and before Hard Boundaries",
  );
  assert.ok(core.includes("Hook-absent contract"), "missing phrase Hook-absent contract");
  assert.ok(core.includes("project-guidelines.md"), "missing phrase project-guidelines.md");
  assert.ok(core.includes("TDD write order"), "missing TDD write-order rule");
  assert.ok(core.includes("emit Plan first"), "hook-absent / Plan-first deny phrase missing");
  assert.ok(
    /final report of the turn/i.test(core),
    "hook-absent must require Full order on the final report of the turn",
  );
  assert.ok(
    /Plan-first message is exempt/i.test(core),
    "hook-absent must exempt Plan-first from the length >= 500 Full-order rule",
  );
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
  assert.ok(core.includes(warning), "core.md missing bug vs bugfix warning");
  assert.ok(instructions.includes(warning), "instructions.md stub missing bug vs bugfix warning");
  assert.ok(skill.includes(warning), "skill missing bug vs bugfix warning");
  assert.ok(sessionRule.includes(warning), "session rule missing bug vs bugfix warning");
});

test("user-facing names distinguish Planner/Prompt and Mode Lite vs Delivery Tier Lite", () => {
  assert.ok(readme.includes("Planner / Prompt (1)"));
  assert.ok(readme.includes("Mode Lite (4)"));
  assert.ok(readme.includes("Delivery Tier Lite"));
  assert.ok(core.includes("Planner / Prompt"));
  assert.ok(liteMode.includes("### Lite mode (4)"));
  assert.ok(core.includes("Mode Lite (4) vs Delivery Tier Lite"));
  assert.ok(mainMode.includes("### Main mode response structure (default Delivery Tier Full)"));
  assert.doesNotMatch(mainMode, /### Full mode \(default\)/);
});

test("mode subagent templates name investigation or a read-only spec", () => {
  const bugAgent = readFileSync(
    join(repoRoot, "install", "templates", "kodaelus-bug.agent.md"),
    "utf8",
  );
  const promptAgent = readFileSync(
    join(repoRoot, "install", "templates", "kodaelus-prompt.agent.md"),
    "utf8",
  );
  assert.match(bugAgent, /investigation/i);
  assert.match(bugAgent, /dossier/i);
  assert.doesNotMatch(bugAgent.split("---")[2] ?? bugAgent, /\bimplement/i);
  const bugDescription = bugAgent.split("---")[1] ?? "";
  assert.match(bugDescription, /investigation/i);
  assert.match(bugDescription, /dossier/i);
  assert.doesNotMatch(bugDescription, /implement/i);
  assert.match(promptAgent, /read-only paste-ready spec/i);
});

test("AGENTS.md documents root and SDK tests plus README SDK heading", () => {
  const agents = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
  assert.ok(agents.includes("## SDK (CLI and programmatic API)"));
  assert.ok(agents.includes("README.md#sdk-cli-and-programmatic-api"));
  assert.ok(agents.includes("npm test"));
  assert.ok(agents.includes("cd sdk && npm test"));
});
