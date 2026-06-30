import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPatchDeletePaths,
  extractPatchTouchedPaths,
} from "./patch-guard.mjs";

test("extractPatchDeletePaths finds file removals", () => {
  const patch = [
    "--- a/src/old.ts",
    "+++ /dev/null",
    "@@",
    "-removed",
  ].join("\n");
  assert.deepEqual(extractPatchDeletePaths(patch), ["src/old.ts"]);
});

test("extractPatchTouchedPaths collects both sides", () => {
  const patch = [
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "--- a/src/b.ts",
    "+++ /dev/null",
  ].join("\n");
  assert.deepEqual(extractPatchTouchedPaths(patch).sort(), ["src/a.ts", "src/b.ts"]);
});
