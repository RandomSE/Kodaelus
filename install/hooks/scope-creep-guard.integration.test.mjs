import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  activateSession,
  approveScope,
  deactivateSession,
  getSessionMetadata,
  recordTouchedFile,
  setPlanFileEstimate,
} from "./lib/session-store.mjs";

const hookScript = fileURLToPath(new URL("./scope-creep-guard.mjs", import.meta.url));

let tempHome;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-scope-home-"));
  process.env.CURSOR_HOME = tempHome;
});

test.afterEach(() => {
  delete process.env.CURSOR_HOME;
  rmSync(tempHome, { recursive: true, force: true });
});

/**
 * @param {Record<string, unknown>} input
 * @returns {Promise<{ stdout: string }>}
 */
function runHook(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookScript], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", () => resolve({ stdout: stdout.trim() }));
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

test("denies 11th touched file without scope approval", async () => {
  activateSession("conv-scope", "main");
  for (let i = 0; i < 10; i += 1) {
    recordTouchedFile("conv-scope", `src/file-${i}.ts`);
  }

  const { stdout } = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-scope",
    tool_name: "Write",
    tool_input: { path: "src/file-10.ts" },
    workspace_roots: [tempHome],
  });

  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");
  assert.match(result.user_message, /scope approved/i);

  deactivateSession("conv-scope");
});

test("allows edits after scope approved", async () => {
  activateSession("conv-approved", "main");
  for (let i = 0; i < 10; i += 1) {
    recordTouchedFile("conv-approved", `src/file-${i}.ts`);
  }
  approveScope("conv-approved");

  const { stdout } = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-approved",
    tool_name: "Write",
    tool_input: { path: "src/file-10.ts" },
    workspace_roots: [tempHome],
  });

  assert.deepEqual(JSON.parse(stdout), { permission: "allow" });
  deactivateSession("conv-approved");
});

test("parses word-number plan estimate from afterAgentResponse", async () => {
  activateSession("conv-plan", "main");

  await runHook({
    hook_event_name: "afterAgentResponse",
    conversation_id: "conv-plan",
    response: "## Plan\nfile count: twenty files estimated",
  });

  const meta = getSessionMetadata("conv-plan");
  assert.equal(meta?.planFileEstimate, 20);

  deactivateSession("conv-plan");
});

test("beforeSubmitPrompt unlocks scope", async () => {
  activateSession("conv-unlock", "main");
  setPlanFileEstimate("conv-unlock", 3);

  await runHook({
    hook_event_name: "beforeSubmitPrompt",
    conversation_id: "conv-unlock",
    prompt: "scope approved",
  });

  const meta = getSessionMetadata("conv-unlock");
  assert.equal(meta?.scopeApproved, true);

  deactivateSession("conv-unlock");
});
