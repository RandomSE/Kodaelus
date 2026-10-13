import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hookScript = fileURLToPath(new URL("./core-read-guard.mjs", import.meta.url));

let tempHome;
let tempProject;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-core-home-"));
  tempProject = mkdtempSync(join(tmpdir(), "kodaelus-core-project-"));
  process.env.CURSOR_HOME = tempHome;
});

test.afterEach(() => {
  delete process.env.CURSOR_HOME;
  rmSync(tempHome, { recursive: true, force: true });
  rmSync(tempProject, { recursive: true, force: true });
});

/**
 * @param {unknown} input
 */
function runHook(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookScript], {
      cwd: tempProject,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout: stdout.trim(), stderr });
    });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

function placeCore() {
  const dir = join(tempProject, ".cursor", "kodaelus");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "core.md"), "# core\n", "utf8");
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} extra
 */
function payload(event, extra) {
  return {
    hook_event_name: event,
    conversation_id: "conv-core",
    workspace_roots: [tempProject],
    ...extra,
  };
}

test("edit and shell are denied until core.md is read, and reads stay allowed", async () => {
  placeCore();

  const readOther = await runHook(payload("preToolUse", {
    tool_name: "Read",
    tool_input: { path: "notes.md" },
  }));
  assert.equal(readOther.code, 0);
  assert.equal(JSON.parse(readOther.stdout).permission, "allow");

  const write = await runHook(payload("preToolUse", {
    tool_name: "Write",
    tool_input: { path: "src/app.js", contents: "x" },
  }));
  assert.equal(write.code, 0);
  const writeDeny = JSON.parse(write.stdout);
  assert.equal(writeDeny.permission, "deny");
  assert.match(writeDeny.agent_message, /core\.md/);
  assert.match(writeDeny.agent_message, /invalid/);

  const shell = await runHook(payload("beforeShellExecution", { command: "npm test" }));
  assert.equal(shell.code, 0);
  assert.equal(JSON.parse(shell.stdout).permission, "deny");

  const readCore = await runHook(payload("preToolUse", {
    tool_name: "Read",
    tool_input: { path: join(tempProject, ".cursor", "kodaelus", "core.md") },
  }));
  assert.equal(readCore.code, 0);
  assert.equal(JSON.parse(readCore.stdout).permission, "allow");

  const writeAfter = await runHook(payload("preToolUse", {
    tool_name: "StrReplace",
    tool_input: { path: "src/app.js", old_string: "a", new_string: "b" },
  }));
  assert.equal(JSON.parse(writeAfter.stdout).permission, "allow");

  const shellAfter = await runHook(payload("beforeShellExecution", { command: "npm test" }));
  assert.equal(JSON.parse(shellAfter.stdout).permission, "allow");
});

test("a different conversation is still blocked after another conversation reads core.md", async () => {
  placeCore();
  await runHook(payload("preToolUse", {
    tool_name: "Read",
    tool_input: { path: ".cursor/kodaelus/core.md" },
  }));
  const other = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-other",
    workspace_roots: [tempProject],
    tool_name: "Write",
    tool_input: { path: "src/app.js", contents: "x" },
  });
  assert.equal(JSON.parse(other.stdout).permission, "deny");
});

test("missing core.md fails open and a missing conversation id fails open", async () => {
  const write = await runHook(payload("preToolUse", {
    tool_name: "Write",
    tool_input: { path: "src/app.js", contents: "x" },
  }));
  assert.equal(JSON.parse(write.stdout).permission, "allow");

  placeCore();
  const noId = await runHook({
    hook_event_name: "beforeShellExecution",
    workspace_roots: [tempProject],
    command: "npm test",
  });
  assert.equal(JSON.parse(noId.stdout).permission, "allow");
});
