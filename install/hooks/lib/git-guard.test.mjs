import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWED_GIT_SUBCOMMANDS,
  isBlockedGitShellCommand,
} from "./git-guard.mjs";

const allow = (command) =>
  assert.equal(isBlockedGitShellCommand(command), false, `expected allow: ${command}`);

const deny = (command) =>
  assert.equal(isBlockedGitShellCommand(command), true, `expected deny: ${command}`);

test("ALLOWED_GIT_SUBCOMMANDS contains status, diff, log", () => {
  assert.deepEqual([...ALLOWED_GIT_SUBCOMMANDS].sort(), ["diff", "log", "status"]);
});

test("allows read-only git subcommands", () => {
  allow("git status");
  allow("git diff");
  allow("git log");
  allow("git diff --staged");
  allow("git log --oneline -5");
  allow("git -C /repo status");
  allow("git --no-pager diff HEAD");
  allow("git status && git diff");
  allow("/usr/bin/git status");
  allow("C:\\Program Files\\Git\\bin\\git.exe status");
});

test("denies mutating or other git subcommands", () => {
  deny("git");
  deny("git commit");
  deny("git push");
  deny("git checkout main");
  deny("git status && git commit");
  deny("git add .");
  deny("git reset --hard");
  deny("git stash");
  deny("git clone https://example.com/repo.git");
});

test("denies gh subcommands", () => {
  deny("gh pr list");
  deny("gh auth login");
  deny("gh repo view");
});

test("allows non-git shell commands", () => {
  allow("npm test");
  allow("node install/install.mjs");
  allow("echo git commit");
});
