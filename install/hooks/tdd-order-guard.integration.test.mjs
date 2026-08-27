import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  activateSession,
  deactivateSession,
  recordFirstFailingTest,
  recordTouchedFile,
  setPlanFileEstimate,
} from "./lib/session-store.mjs";

const hookScript = fileURLToPath(new URL("./tdd-order-guard.mjs", import.meta.url));

let tempHome;
let tempProject;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-tdd-home-"));
  tempProject = mkdtempSync(join(tmpdir(), "kodaelus-tdd-project-"));
  process.env.CURSOR_HOME = tempHome;
  process.env.KODAELUS_CLOUD_DELIVERY = "0";
  writeFileSync(join(tempProject, "Cargo.toml"), "[package]\nname=\"t\"\nversion=\"0.1.0\"\n");
});

test.afterEach(() => {
  delete process.env.CURSOR_HOME;
  delete process.env.KODAELUS_CLOUD_DELIVERY;
  rmSync(tempHome, { recursive: true, force: true });
  rmSync(tempProject, { recursive: true, force: true });
});

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
    child.on("close", (code) => {
      resolve({ code, stdout: stdout.trim() });
    });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

test("Main denies product impl before a failing test run; Lite is not blocked", async () => {
  activateSession("conv-tdd-main", "main");
  setPlanFileEstimate("conv-tdd-main", 6);
  recordTouchedFile("conv-tdd-main", "tests/engine.rs");

  const denied = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-tdd-main",
    tool_name: "Write",
    tool_input: { path: join(tempProject, "src", "engine.rs"), contents: "fn x() {}" },
    workspace_roots: [tempProject],
  });
  assert.equal(JSON.parse(denied.stdout).permission, "deny");
  assert.match(JSON.parse(denied.stdout).agent_message, /failing test/i);

  recordFirstFailingTest("conv-tdd-main", {
    command: "cargo test",
    outcome: "exit=101",
    stdout: "FAILED",
  });
  const allowed = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-tdd-main",
    tool_name: "Write",
    tool_input: { path: join(tempProject, "src", "engine.rs"), contents: "fn x() {}" },
    workspace_roots: [tempProject],
  });
  assert.deepEqual(JSON.parse(allowed.stdout), { permission: "allow" });
  deactivateSession("conv-tdd-main");

  activateSession("conv-tdd-lite", "lite");
  recordTouchedFile("conv-tdd-lite", "tests/engine.rs");
  const liteOk = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-tdd-lite",
    tool_name: "Write",
    tool_input: { path: join(tempProject, "src", "engine.rs"), contents: "fn x() {}" },
    workspace_roots: [tempProject],
  });
  assert.deepEqual(JSON.parse(liteOk.stdout), { permission: "allow" });
  deactivateSession("conv-tdd-lite");
});

test("stop follow-up when first cargo test was already green", async () => {
  activateSession("conv-tdd-stop", "main");
  recordTouchedFile("conv-tdd-stop", "tests/engine.rs");
  recordTouchedFile("conv-tdd-stop", "src/lib.rs");

  const { recordShellEvidence } = await import("./lib/session-store.mjs");
  recordShellEvidence("conv-tdd-stop", "cargo test", "exit=0");

  const { code, stdout } = await runHook({
    hook_event_name: "stop",
    conversation_id: "conv-tdd-stop",
    response: "## Delivery Self-Check\n| TDD | Fail |\n## Follow-Up Queue\n- none",
  });
  assert.equal(code, 2);
  assert.match(JSON.parse(stdout).followup_message, /TDD|red phase|failing test/i);
  deactivateSession("conv-tdd-stop");
});
