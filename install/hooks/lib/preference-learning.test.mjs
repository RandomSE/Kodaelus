import assert from "node:assert/strict";
import test from "node:test";
import { extractPreferenceIntent } from "./preference-learning.mjs";

test("extractPreferenceIntent captures standing preferences", () => {
  assert.equal(
    extractPreferenceIntent("please always run vitest with --coverage for this repo"),
    "run vitest with --coverage for this repo",
  );
  assert.equal(
    extractPreferenceIntent("I prefer to use pnpm instead of npm here"),
    "use pnpm instead of npm here",
  );
});

test("extractPreferenceIntent ignores questions and task prompts", () => {
  assert.equal(extractPreferenceIntent("How do I always run tests?"), null);
  assert.equal(extractPreferenceIntent("always fix the login bug today"), null);
  assert.equal(extractPreferenceIntent("implement the feature and always ship on Friday"), null);
  assert.equal(extractPreferenceIntent("use kodaelus main"), null);
  assert.equal(extractPreferenceIntent("restore removed.ts"), null);
});

test("extractPreferenceIntent ignores vague always clauses", () => {
  assert.equal(extractPreferenceIntent("always remember that"), null);
});
