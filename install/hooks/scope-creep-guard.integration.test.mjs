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
  process.env.KODAELUS_CLOUD_DELIVERY = "0";
});

test.afterEach(() => {
  delete process.env.CURSOR_HOME;
  delete process.env.KODAELUS_CLOUD_DELIVERY;
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

test("beforeSubmitPrompt scope approved raises the baseline", async () => {
  activateSession("conv-unlock", "main");
  setPlanFileEstimate("conv-unlock", 4);
  for (let i = 0; i < 6; i += 1) {
    recordTouchedFile("conv-unlock", `src/u-${i}.ts`);
  }

  await runHook({
    hook_event_name: "beforeSubmitPrompt",
    conversation_id: "conv-unlock",
    prompt: "scope approved",
  });

  const meta = getSessionMetadata("conv-unlock");
  assert.equal(meta?.scopeBaseline, 6);
  assert.equal(meta?.planFileEstimate, 4);
  assert.equal(meta?.taskProductFiles.length, 6);
  assert.notEqual(meta?.scopeApproved, true);

  deactivateSession("conv-unlock");
});

test("a new user prompt starts a new product-file window", async () => {
  activateSession("conv-next-task", "main");
  setPlanFileEstimate("conv-next-task", 4);
  recordTouchedFile("conv-next-task", "src/kept.ts");
  recordTouchedFile("conv-next-task", "src/kept.test.ts");

  await runHook({
    hook_event_name: "beforeSubmitPrompt",
    conversation_id: "conv-next-task",
    prompt: "next task, leave the phrase out",
  });

  const meta = getSessionMetadata("conv-next-task");
  assert.equal(meta?.planFileEstimate, null);
  assert.deepEqual(meta?.taskProductFiles, []);
  assert.deepEqual(meta?.touchedFiles, ["src/kept.ts", "src/kept.test.ts"]);

  deactivateSession("conv-next-task");
});

test("blast radius does not set or replace File count", async () => {
  activateSession("conv-blast", "main");

  await runHook({
    hook_event_name: "afterAgentResponse",
    conversation_id: "conv-blast",
    response: "## Plan\nFile count: 4\nBlast radius: 2 packages",
  });
  await runHook({
    hook_event_name: "afterAgentResponse",
    conversation_id: "conv-blast",
    response: "blast radius: 40",
  });

  assert.equal(getSessionMetadata("conv-blast")?.planFileEstimate, 4);
  deactivateSession("conv-blast");
});

test("generic test, fixture, and testdata paths do not trip the scope guard", async () => {
  activateSession("conv-generic-tests", "main");
  const paths = [
    "src/FooTest.java",
    "src/FooTests.cs",
    "tests/test_parser.py",
    "pkg/foo_test.go",
    "test/support/setup.js",
    "__tests__/index.js",
    "spec/models/user.rb",
    "src/test/java/com/Foo.java",
    "tests/fixtures/data.json",
    "testdata/input.txt",
    "src/__snapshots__/a.snap",
    "src/user.fixture.json",
  ];
  for (const path of paths) {
    const { stdout } = await runHook({
      hook_event_name: "preToolUse",
      conversation_id: "conv-generic-tests",
      tool_name: "Write",
      tool_input: { path },
      workspace_roots: [tempHome],
    });
    assert.deepEqual(JSON.parse(stdout), { permission: "allow" }, path);
  }
  assert.equal(getSessionMetadata("conv-generic-tests")?.taskProductFiles.length, 0);

  for (let i = 0; i < 10; i += 1) {
    recordTouchedFile("conv-generic-tests", `src/kept-${i}.ts`);
  }
  const extra = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-generic-tests",
    tool_name: "Write",
    tool_input: { path: "src/latest.ts" },
    workspace_roots: [tempHome],
  });
  assert.equal(JSON.parse(extra.stdout).permission, "deny");
  deactivateSession("conv-generic-tests");
});

test("eleven test files do not trip the scope guard", async () => {
  activateSession("conv-tests", "main");

  for (let i = 0; i < 11; i += 1) {
    const { stdout } = await runHook({
      hook_event_name: "preToolUse",
      conversation_id: "conv-tests",
      tool_name: "Write",
      tool_input: { path: `src/sample-${i}.test.mjs` },
      workspace_roots: [tempHome],
    });
    assert.deepEqual(JSON.parse(stdout), { permission: "allow" });
  }

  deactivateSession("conv-tests");
});

test("denied product file is not stored", async () => {
  activateSession("conv-deny-clean", "main");
  for (let i = 0; i < 10; i += 1) {
    recordTouchedFile("conv-deny-clean", `src/seed-${i}.ts`);
  }

  const { stdout } = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-deny-clean",
    tool_name: "Write",
    tool_input: { path: "src/seed-10.ts" },
    workspace_roots: [tempHome],
  });

  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");
  const meta = getSessionMetadata("conv-deny-clean");
  assert.equal(meta?.touchedFiles.includes("src/seed-10.ts"), false);
  assert.equal(meta?.taskProductFiles.length, 10);

  deactivateSession("conv-deny-clean");
});

test("scope approved grants one more slack and then denies again", async () => {
  activateSession("conv-rearm-hook", "main");
  await runHook({
    hook_event_name: "afterAgentResponse",
    conversation_id: "conv-rearm-hook",
    response: "File count: 4",
  });
  for (let i = 0; i < 6; i += 1) {
    recordTouchedFile("conv-rearm-hook", `src/arm-${i}.ts`);
  }

  const denied = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-rearm-hook",
    tool_name: "Write",
    tool_input: { path: "src/arm-6.ts" },
    workspace_roots: [tempHome],
  });
  assert.equal(JSON.parse(denied.stdout).permission, "deny");

  await runHook({
    hook_event_name: "beforeSubmitPrompt",
    conversation_id: "conv-rearm-hook",
    prompt: "scope approved",
  });

  for (const path of ["src/arm-6.ts", "src/arm-7.ts"]) {
    const { stdout } = await runHook({
      hook_event_name: "preToolUse",
      conversation_id: "conv-rearm-hook",
      tool_name: "Write",
      tool_input: { path },
      workspace_roots: [tempHome],
    });
    assert.deepEqual(JSON.parse(stdout), { permission: "allow" });
  }

  const again = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-rearm-hook",
    tool_name: "Write",
    tool_input: { path: "src/arm-8.ts" },
    workspace_roots: [tempHome],
  });
  assert.equal(JSON.parse(again.stdout).permission, "deny");
  assert.match(JSON.parse(again.stdout).user_message, /slack/i);

  deactivateSession("conv-rearm-hook");
});

test("cloud/headless Main denies Write with emit Plan first when no Plan estimate", async () => {
  process.env.KODAELUS_CLOUD_DELIVERY = "1";
  activateSession("conv-plan-first", "main");

  const { stdout } = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-plan-first",
    tool_name: "Write",
    tool_input: { path: "src/lib.rs" },
    workspace_roots: [tempHome],
  });

  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");
  assert.match(result.agent_message, /emit Plan first/i);
  assert.doesNotMatch(result.user_message, /scope approved/i);

  setPlanFileEstimate("conv-plan-first", 4);
  const allowed = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-plan-first",
    tool_name: "Write",
    tool_input: { path: "src/lib.rs" },
    workspace_roots: [tempHome],
  });
  assert.deepEqual(JSON.parse(allowed.stdout), { permission: "allow" });

  deactivateSession("conv-plan-first");
  process.env.KODAELUS_CLOUD_DELIVERY = "0";
});
