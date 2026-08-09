import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { activateSession, deactivateSession, getSessionMode } from "./lib/session-store.mjs";

const scopeHook = fileURLToPath(new URL("./scope-creep-guard.mjs", import.meta.url));
const sessionHook = fileURLToPath(new URL("./kodaelus-session.mjs", import.meta.url));
const deleteHook = fileURLToPath(new URL("./guard-delete.mjs", import.meta.url));
const readonlyShellHook = fileURLToPath(
  new URL("./block-readonly-shell.mjs", import.meta.url),
);

let tempHome;
let tempProject;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-readonly-home-"));
  tempProject = mkdtempSync(join(tmpdir(), "kodaelus-readonly-project-"));
  process.env.CURSOR_HOME = tempHome;
});

test.afterEach(() => {
  delete process.env.CURSOR_HOME;
  rmSync(tempHome, { recursive: true, force: true });
  rmSync(tempProject, { recursive: true, force: true });
});

/**
 * @param {string} script
 * @param {Record<string, unknown>} input
 */
function runHook(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout: stdout.trim() });
    });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

function seedProject(root) {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ main: "index.js" }),
    "utf8",
  );
  writeFileSync(join(root, "index.js"), "console.log('entry');\n", "utf8");
  writeFileSync(join(root, "util.js"), "export {};\n", "utf8");
}

test("denies Write in prompt mode via scope-creep-guard", async () => {
  activateSession("conv-prompt-write", "prompt");

  const { stdout } = await runHook(scopeHook, {
    hook_event_name: "preToolUse",
    conversation_id: "conv-prompt-write",
    tool_name: "Write",
    tool_input: { path: join(tempProject, "new.ts"), contents: "x" },
    workspace_roots: [tempProject],
  });

  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");
  assert.match(result.user_message, /read-only/i);

  deactivateSession("conv-prompt-write");
});

test("denies Delete in prompt mode via guard-delete", async () => {
  seedProject(tempProject);
  activateSession("conv-prompt-delete", "prompt");

  const { stdout } = await runHook(deleteHook, {
    conversation_id: "conv-prompt-delete",
    tool_input: { path: join(tempProject, "util.js") },
    workspace_roots: [tempProject],
  });

  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");
  assert.match(result.user_message, /read-only/i);
  assert.ok(existsSync(join(tempProject, "util.js")));

  deactivateSession("conv-prompt-delete");
});

test("denies Delete outside .kodaelus in bug investigation mode", async () => {
  seedProject(tempProject);
  activateSession("conv-bug-delete", "bug");

  const { stdout } = await runHook(deleteHook, {
    conversation_id: "conv-bug-delete",
    tool_input: { path: join(tempProject, "util.js") },
    workspace_roots: [tempProject],
  });

  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");
  assert.match(result.user_message, /Bug Investigation/i);
  assert.ok(existsSync(join(tempProject, "util.js")));

  deactivateSession("conv-bug-delete");
});

test("allows Delete under .kodaelus in bug investigation mode", async () => {
  seedProject(tempProject);
  const artifact = join(tempProject, ".kodaelus", "bugs", "note.md");
  mkdirSync(join(tempProject, ".kodaelus", "bugs"), { recursive: true });
  writeFileSync(artifact, "diagnostic\n", "utf8");
  activateSession("conv-bug-artifact", "bug");

  const { stdout } = await runHook(deleteHook, {
    conversation_id: "conv-bug-artifact",
    tool_input: { path: artifact },
    workspace_roots: [tempProject],
  });

  assert.deepEqual(JSON.parse(stdout), { permission: "allow" });
  assert.ok(existsSync(artifact));

  deactivateSession("conv-bug-artifact");
});

test("denies mkdir in prompt mode via block-readonly-shell", async () => {
  activateSession("conv-prompt-shell", "prompt");

  const { stdout } = await runHook(readonlyShellHook, {
    conversation_id: "conv-prompt-shell",
    command: "mkdir src/new-dir",
    workspace_roots: [tempProject],
  });

  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");
  assert.match(result.user_message, /read-only/i);

  deactivateSession("conv-prompt-shell");
});

test("allows npm test in prompt mode via block-readonly-shell", async () => {
  activateSession("conv-prompt-npm-test", "prompt");

  const { stdout } = await runHook(readonlyShellHook, {
    conversation_id: "conv-prompt-npm-test",
    command: "npm test",
    workspace_roots: [tempProject],
  });

  assert.deepEqual(JSON.parse(stdout), { permission: "allow" });

  deactivateSession("conv-prompt-npm-test");
});

test("same-turn prompt→main: Write allowed after contaminated upgrade paste", async () => {
  activateSession("conv-prompt-to-main", "prompt");
  assert.equal(getSessionMode("conv-prompt-to-main"), "prompt");

  const contaminated = [
    "use kodaelus main",
    "Body still says use kodaelus 1 and kodaelus prompt mode.",
    "# Task",
    "Implement sticky upgrade.",
  ].join("\n");

  await runHook(sessionHook, {
    hook_event_name: "beforeSubmitPrompt",
    conversation_id: "conv-prompt-to-main",
    prompt: contaminated,
    workspace_roots: [tempProject],
  });

  assert.equal(getSessionMode("conv-prompt-to-main"), "main");

  const { stdout } = await runHook(scopeHook, {
    hook_event_name: "preToolUse",
    conversation_id: "conv-prompt-to-main",
    tool_name: "Write",
    tool_input: { path: join(tempProject, "sticky-ok.ts"), contents: "ok\n" },
    workspace_roots: [tempProject],
  });

  assert.deepEqual(JSON.parse(stdout), { permission: "allow" });

  deactivateSession("conv-prompt-to-main");
});
