import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { detectKodaelusMode } from "./kodaelus-mode.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const core = readFileSync(join(root, "kodaelus", "core.md"), "utf8");
const promptMode = readFileSync(join(root, "kodaelus", "modes", "prompt.md"), "utf8");
const skill = readFileSync(join(root, "install", "templates", "kodaelus.skill.md"), "utf8");
const sessionRule = readFileSync(
  join(root, "install", "templates", "kodaelus-session.rule.mdc"),
  "utf8",
);

test("handoff: Main mode (0) body alone is not an upgrade token", () => {
  const body = [
    "# FocusNexus - Music override (Main mode (0), Delivery Tier: Full)",
    "## Target mode",
    "Main mode (0). Bug fix. TDD.",
  ].join("\n");
  assert.equal(detectKodaelusMode(body), null);
});

test("handoff: prose Bug fix in spec does not upgrade; qualified bug fix does", () => {
  assert.equal(detectKodaelusMode("## Goal\nBug fix for music sync."), null);
  assert.equal(detectKodaelusMode("bug fix"), "main");
  assert.equal(detectKodaelusMode("use kodaelus bug fix"), "main");
  assert.equal(detectKodaelusMode("bugfix"), "main");
});

test("handoff: fence preamble use kodaelus main + Main mode (0) body → main", () => {
  const fence = [
    "use kodaelus main",
    "",
    "# FocusNexus - Music override (Main mode (0), Delivery Tier: Full)",
    "## Target mode",
    "Main mode (0). Bug fix. TDD.",
  ].join("\n");
  assert.equal(detectKodaelusMode(fence), "main");
});

test("handoff: policy requires fence preamble and soft stickiness keywords", () => {
  assert.match(promptMode, /fence preamble/i);
  assert.match(core, /soft stickiness/i);
  assert.doesNotMatch(
    promptMode,
    /Keep any upgrade phrase \*\*outside\*\* the fenced block/i,
  );
});

test("handoff: skill + session rule require preamble and soft stickiness", () => {
  assert.match(skill, /fence preamble/i);
  assert.match(skill, /soft stickiness/i);
  assert.match(sessionRule, /fence preamble/i);
  assert.match(sessionRule, /soft stickiness/i);
});

test("handoff: prompt-fence-guard validates upgrade + blank line", async () => {
  const { validatePromptHandoffFence } = await import(
    "../hooks/lib/prompt-fence-guard.mjs"
  );
  const ok = [
    "pad ".repeat(80),
    "```",
    "use kodaelus main",
    "",
    "Main mode (0) body",
    "```",
  ].join("\n");
  assert.equal(validatePromptHandoffFence(ok).ok, true);
  const bad = [
    "pad ".repeat(80),
    "```",
    "use kodaelus 1",
    "",
    "body",
    "```",
  ].join("\n");
  assert.equal(validatePromptHandoffFence(bad).ok, false);
});
