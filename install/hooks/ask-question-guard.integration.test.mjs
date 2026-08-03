import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { activateSession, deactivateSession } from "./lib/session-store.mjs";

const hookScript = fileURLToPath(new URL("./ask-question-guard.mjs", import.meta.url));

let tempHome;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-aq-home-"));
  process.env.CURSOR_HOME = tempHome;
});

test.afterEach(() => {
  delete process.env.CURSOR_HOME;
  rmSync(tempHome, { recursive: true, force: true });
});

/**
 * @param {unknown} input
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
function runHook(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookScript], {
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

test("preToolUse AskQuestion denied in main mode", async () => {
  activateSession("conv-aq-main", "main");

  const { code, stdout, stderr } = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-aq-main",
    tool_name: "AskQuestion",
  });

  assert.equal(code, 0);
  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");
  assert.match(result.agent_message, /resolution priority/i);
  assert.match(stderr, /denied/i);

  deactivateSession("conv-aq-main");
});

test("preToolUse AskUserQuestion denied in lite and bug modes", async () => {
  activateSession("conv-aq-lite", "lite");
  const lite = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-aq-lite",
    tool_name: "AskUserQuestion",
  });
  assert.equal(JSON.parse(lite.stdout).permission, "deny");
  deactivateSession("conv-aq-lite");

  activateSession("conv-aq-bug", "bug");
  const bug = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-aq-bug",
    tool_name: "ask_user_question",
  });
  assert.equal(JSON.parse(bug.stdout).permission, "deny");
  deactivateSession("conv-aq-bug");
});

test("preToolUse AskQuestion allowed in prompt mode", async () => {
  activateSession("conv-aq-prompt", "prompt");

  const { code, stdout } = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-aq-prompt",
    tool_name: "AskQuestion",
  });

  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout).permission, "allow");

  deactivateSession("conv-aq-prompt");
});

test("inactive session allows AskQuestion", async () => {
  const { code, stdout } = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-aq-inactive",
    tool_name: "AskQuestion",
  });
  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout).permission, "allow");
});

test("stop with clarifying prose returns followup_message", async () => {
  activateSession("conv-aq-stop", "main");

  const { code, stdout, stderr } = await runHook({
    hook_event_name: "stop",
    conversation_id: "conv-aq-stop",
    response: "Which option should I take for zoom scope?",
    loop_count: 0,
  });

  assert.equal(code, 2);
  const result = JSON.parse(stdout);
  assert.ok(result.followup_message);
  assert.match(result.followup_message, /resolution priority/i);
  assert.match(stderr, /open clarification/i);

  deactivateSession("conv-aq-stop");
});

test("stop without clarification match is no-op", async () => {
  activateSession("conv-aq-clean", "main");

  const { code, stdout } = await runHook({
    hook_event_name: "stop",
    conversation_id: "conv-aq-clean",
    response: "Tests passed. Outcome Validation: Pass.",
  });

  assert.equal(code, 0);
  assert.equal(stdout, "{}");

  deactivateSession("conv-aq-clean");
});

test("stop clarification ignored in prompt mode", async () => {
  activateSession("conv-aq-prompt-stop", "prompt");

  const { code, stdout } = await runHook({
    hook_event_name: "stop",
    conversation_id: "conv-aq-prompt-stop",
    response: "Please choose one of the following.",
  });

  assert.equal(code, 0);
  assert.equal(stdout, "{}");

  deactivateSession("conv-aq-prompt-stop");
});
