import assert from "node:assert/strict";
import test from "node:test";
import {
  extractFencedBlocks,
  validateHandoffFenceBlock,
  validatePromptHandoffFence,
} from "./prompt-fence-guard.mjs";

test("valid fence: upgrade + blank + body", () => {
  const block = ["use kodaelus main", "", "# Spec", "Main mode (0) work"].join("\n");
  assert.equal(validateHandoffFenceBlock(block).ok, true);
});

test("rejects missing blank line and Prompt activation in body", () => {
  assert.equal(
    validateHandoffFenceBlock(["use kodaelus main", "# Spec"].join("\n")).ok,
    false,
  );
  const bad = [
    "use kodaelus main",
    "",
    "then use kodaelus 1 later",
  ].join("\n");
  const result = validateHandoffFenceBlock(bad);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((r) => /Prompt-mode activation/i.test(r)));
});

test("validatePromptHandoffFence finds a good fence among response", () => {
  const text = [
    "Understanding...",
    "```",
    "use kodaelus main",
    "",
    "Do the work in Main mode (0).",
    "```",
  ].join("\n");
  assert.equal(validatePromptHandoffFence(text).ok, true);
  assert.equal(extractFencedBlocks(text).length, 1);
  assert.equal(validatePromptHandoffFence("no fence here at all").ok, false);
});
