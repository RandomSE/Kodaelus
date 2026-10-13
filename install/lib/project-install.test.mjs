import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { installProject } from "./project-install.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("installProject drops an alwaysApply rule, AGENTS.md snippet, and core.md", () => {
  const target = mkdtempSync(join(tmpdir(), "kodaelus-project-"));
  writeFileSync(join(target, "AGENTS.md"), "# Existing\n\nKeep me.\n", "utf8");

  installProject({ repoRoot, targetRoot: target });

  const rule = readFileSync(join(target, ".cursor", "rules", "kodaelus-load.mdc"), "utf8");
  assert.match(rule, /alwaysApply:\s*true/);
  const body = rule.split("---").slice(2).join("---").trim();
  assert.match(body, /^First tool call:/);
  assert.match(body, /\.cursor\/kodaelus\/core\.md/);
  assert.match(body, /modes\/<active>\.md/);
  assert.match(body, /Work done without that read is invalid/);

  const agents = readFileSync(join(target, "AGENTS.md"), "utf8");
  assert.match(agents, /^# Kodaelus\n\nFirst tool call:/);
  assert.match(agents, /Work done without that read is invalid/);
  assert.match(agents, /# Existing\n\nKeep me\./);

  const core = readFileSync(join(target, ".cursor", "kodaelus", "core.md"), "utf8");
  assert.match(core, /# Kodaelus core policy/);
  const mode = readFileSync(join(target, ".cursor", "kodaelus", "modes", "main.md"), "utf8");
  assert.match(mode, /# Main mode/);

  installProject({ repoRoot, targetRoot: target });
  const again = readFileSync(join(target, "AGENTS.md"), "utf8");
  assert.equal(again.split("First tool call:").length - 1, 1);

  rmSync(target, { recursive: true, force: true });
});

test("installProject creates AGENTS.md when the target has none", () => {
  const target = mkdtempSync(join(tmpdir(), "kodaelus-project-empty-"));
  installProject({ repoRoot, targetRoot: target });
  const agents = readFileSync(join(target, "AGENTS.md"), "utf8");
  assert.match(agents, /^# Kodaelus\n\nFirst tool call:/);
  rmSync(target, { recursive: true, force: true });
});
