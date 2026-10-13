import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { KODAELUS_HOOK_COMMANDS, KODAELUS_HOOK_RELATIVE_PATHS } from "../../lib/user-hooks.mjs";
import {
  corePolicyExists,
  decideCoreRead,
  denyUntilCoreRead,
  isCoreMdPath,
} from "./core-read-guard.mjs";

test("isCoreMdPath matches a core.md path and ignores other files", () => {
  assert.equal(isCoreMdPath("kodaelus/core.md"), true);
  assert.equal(isCoreMdPath(".cursor/kodaelus/core.md"), true);
  assert.equal(isCoreMdPath("core.md"), true);
  assert.equal(isCoreMdPath("src/module.txt"), false);
  assert.equal(isCoreMdPath(""), false);
});

test("decideCoreRead allows reads, denies edit and shell until core is read, and fails open when core is missing", () => {
  assert.equal(
    decideCoreRead({ event: "preToolUse", toolName: "Read", filePath: "notes.md", coreExists: true, alreadyRead: false }),
    "allow",
  );
  assert.equal(
    decideCoreRead({ event: "preToolUse", toolName: "Read", filePath: "kodaelus/core.md", coreExists: true, alreadyRead: false }),
    "record",
  );
  assert.equal(
    decideCoreRead({ event: "preToolUse", toolName: "Write", filePath: "src/app.js", coreExists: true, alreadyRead: false }),
    "deny",
  );
  assert.equal(
    decideCoreRead({ event: "preToolUse", toolName: "Delete", filePath: "src/app.js", coreExists: true, alreadyRead: false }),
    "deny",
  );
  assert.equal(
    decideCoreRead({ event: "beforeShellExecution", toolName: "", filePath: "", coreExists: true, alreadyRead: false }),
    "deny",
  );
  assert.equal(
    decideCoreRead({ event: "preToolUse", toolName: "Write", filePath: "src/app.js", coreExists: true, alreadyRead: true }),
    "allow",
  );
  assert.equal(
    decideCoreRead({ event: "beforeShellExecution", toolName: "", filePath: "", coreExists: true, alreadyRead: true }),
    "allow",
  );
  assert.equal(
    decideCoreRead({ event: "preToolUse", toolName: "Write", filePath: "src/app.js", coreExists: false, alreadyRead: false }),
    "allow",
  );
  assert.equal(
    decideCoreRead({ event: "beforeShellExecution", toolName: "", filePath: "", coreExists: false, alreadyRead: false }),
    "allow",
  );
});

test("deny message tells the agent to read core.md and that work without it is invalid", () => {
  const denied = denyUntilCoreRead();
  assert.equal(denied.permission, "deny");
  assert.match(denied.agent_message, /core\.md/);
  assert.match(denied.agent_message, /invalid/);
  assert.match(denied.user_message, /core\.md/);
});

test("corePolicyExists is false when no candidate file is present", () => {
  const root = mkdtempSync(join(tmpdir(), "kodaelus-core-missing-"));
  const home = mkdtempSync(join(tmpdir(), "kodaelus-core-home-"));
  assert.equal(corePolicyExists(root, home), false);
  mkdirSync(join(root, ".cursor", "kodaelus"), { recursive: true });
  writeFileSync(join(root, ".cursor", "kodaelus", "core.md"), "# core\n", "utf8");
  assert.equal(corePolicyExists(root, home), true);
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test("core-read guard is registered with the other hooks and listed for uninstall", () => {
  assert.equal(KODAELUS_HOOK_COMMANDS.has("node ./hooks/core-read-guard.mjs"), true);
  assert.equal(KODAELUS_HOOK_RELATIVE_PATHS.includes("core-read-guard.mjs"), true);
  assert.equal(KODAELUS_HOOK_RELATIVE_PATHS.includes("lib/core-read-guard.mjs"), true);
});
