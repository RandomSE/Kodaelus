import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  appendManifestEntry,
  copyToTrash,
  ensureKodaelusGitignore,
  manifestHasEntry,
  readManifestEntries,
} from "./deletion-guard.mjs";

let tempRoot;

test.beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "kodaelus-del-guard-"));
});

test.afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

test("copyToTrash creates backup preserving path structure", () => {
  mkdirSync(join(tempRoot, "src"), { recursive: true });
  writeFileSync(join(tempRoot, "src", "util.js"), "export {};\n", "utf8");
  const { backupPath, relativePath } = copyToTrash(tempRoot, "src/util.js");

  assert.equal(relativePath, "src/util.js");
  assert.ok(existsSync(join(tempRoot, backupPath)));
  assert.match(backupPath, /^\.kodaelus\/trash\//);
});

test("appendManifestEntry appends to manifest array", () => {
  const entries = appendManifestEntry(tempRoot, {
    path: "src/util.js",
    reason: "test",
    confidence: 100,
    backup: ".kodaelus/trash/2020/util.js",
    timestamp: "2020-01-01T00:00:00.000Z",
    entryPointCheck: "Pass",
  });

  assert.equal(entries.length, 1);
  assert.equal(readManifestEntries(tempRoot).length, 1);
  assert.ok(manifestHasEntry(tempRoot, "src/util.js"));
});

test("ensureKodaelusGitignore adds .kodaelus/ when git present", () => {
  writeFileSync(join(tempRoot, ".git"), "gitdir: nowhere\n", "utf8");
  ensureKodaelusGitignore(tempRoot);
  const content = readFileSync(join(tempRoot, ".gitignore"), "utf8");
  assert.match(content, /\.kodaelus\//);
});
