import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { diffPriorSuggestions } from "./suggestions-diff.mjs";

let tempRoot;

test.beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "kodaelus-suggest-diff-"));
});

test.afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

test("diffPriorSuggestions flags addressed items", () => {
  const dir = join(tempRoot, ".kodaelus", "suggestions");
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    join(dir, "2026-06-01-issues.md"),
    "| Finding | Severity |\n| --- | --- |\n| Missing auth tests | High |\n| Stale cache key | Med |\n",
    "utf8",
  );
  writeFileSync(
    join(dir, "2026-06-30-issues.md"),
    "| Finding | Severity |\n| --- | --- |\n| Stale cache key | Med |\n",
    "utf8",
  );

  const result = diffPriorSuggestions(tempRoot, "issues", "2026-06-30-issues.md");
  assert.ok(result.priorFiles.includes("2026-06-01-issues.md"));
  assert.ok(result.addressed.some((item) => item.includes("missing auth tests")));
  assert.ok(result.stillOpen.some((item) => item.includes("stale cache key")));
});

test("diffPriorSuggestions without excludeFile compares last two scans", () => {
  const dir = join(tempRoot, ".kodaelus", "suggestions");
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    join(dir, "2026-06-01-issues.md"),
    "| Finding | Severity |\n| --- | --- |\n| Missing auth tests | High |\n",
    "utf8",
  );
  writeFileSync(
    join(dir, "2026-06-30-issues.md"),
    "| Finding | Severity |\n| --- | --- |\n| Stale cache key | Med |\n",
    "utf8",
  );

  const result = diffPriorSuggestions(tempRoot, "issues");
  assert.ok(result.addressed.some((item) => item.includes("missing auth tests")));
  assert.ok(result.stillOpen.length === 0);
});

test("diffPriorSuggestions without excludeFile returns empty diff for single file", () => {
  const dir = join(tempRoot, ".kodaelus", "suggestions");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "2026-06-30-issues.md"),
    "| Finding | Severity |\n| --- | --- |\n| Stale cache key | Med |\n",
    "utf8",
  );

  const result = diffPriorSuggestions(tempRoot, "issues");
  assert.deepEqual(result.addressed, []);
  assert.deepEqual(result.stillOpen, []);
});
