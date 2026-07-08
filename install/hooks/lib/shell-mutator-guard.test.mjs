import assert from "node:assert/strict";
import test from "node:test";
import {
  hasMutatingShellRedirect,
  isBlockedReadOnlyShellCommand,
} from "./shell-mutator-guard.mjs";

test("isBlockedReadOnlyShellCommand flags workspace mutators", () => {
  assert.equal(isBlockedReadOnlyShellCommand("npm install lodash"), true);
  assert.equal(isBlockedReadOnlyShellCommand("pnpm add vitest"), true);
  assert.equal(isBlockedReadOnlyShellCommand("mkdir src/foo"), true);
  assert.equal(isBlockedReadOnlyShellCommand("touch new-file.ts"), true);
  assert.equal(isBlockedReadOnlyShellCommand("cp a.ts b.ts"), true);
  assert.equal(isBlockedReadOnlyShellCommand("npm run build"), true);
  assert.equal(isBlockedReadOnlyShellCommand("pnpm build"), true);
});

test("isBlockedReadOnlyShellCommand flags file redirects", () => {
  assert.equal(isBlockedReadOnlyShellCommand("echo hi > out.txt"), true);
  assert.equal(isBlockedReadOnlyShellCommand("cat a.ts >> b.ts"), true);
  assert.equal(hasMutatingShellRedirect("node script.js > out.log"), true);
});

test("isBlockedReadOnlyShellCommand allows read-only commands", () => {
  assert.equal(isBlockedReadOnlyShellCommand("npm test"), false);
  assert.equal(isBlockedReadOnlyShellCommand("git status"), false);
  assert.equal(isBlockedReadOnlyShellCommand("node --version"), false);
  assert.equal(isBlockedReadOnlyShellCommand("npm test 2>&1"), false);
  assert.equal(isBlockedReadOnlyShellCommand("echo hi > /dev/null"), false);
  assert.equal(isBlockedReadOnlyShellCommand("echo hi > $null"), false);
});
