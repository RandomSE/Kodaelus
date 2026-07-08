import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPreferenceIntent,
  normalizePreferenceKey,
} from "./preference-intent.mjs";
import {
  extractPreferenceIntent as hookExtract,
  normalizePreferenceKey as hookNormalize,
} from "../hooks/lib/preference-learning.mjs";

test("normalizePreferenceKey collapses whitespace and case", () => {
  assert.equal(normalizePreferenceKey("  Use   Vitest "), "use vitest");
});

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

test("hooks preference-learning re-exports match shared preference-intent", () => {
  const samples = [
    "please always run vitest with --coverage for this repo",
    "How do I always run tests?",
    "always fix the login bug today",
  ];
  for (const sample of samples) {
    assert.equal(hookExtract(sample), extractPreferenceIntent(sample));
  }
  assert.equal(hookNormalize("Use Vitest"), normalizePreferenceKey("Use Vitest"));
});
