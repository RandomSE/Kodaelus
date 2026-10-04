import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";
import {
  activateSession,
  deactivateSession,
  recordPromptContext,
} from "./lib/session-store.mjs";

const hooksDir = fileURLToPath(new URL(".", import.meta.url));
const guard = join(hooksDir, "recommendation-insights-guard.mjs");
const tempHome = mkdtempSync(join(tmpdir(), "kodaelus-rec-home-"));
const tempProject = mkdtempSync(join(tmpdir(), "kodaelus-rec-proj-"));
const previousHome = process.env.CURSOR_HOME;

test.before(() => {
  process.env.CURSOR_HOME = tempHome;
  mkdirSync(join(tempProject, ".kodaelus"), { recursive: true });
  writeFileSync(join(tempProject, ".kodaelus", "insights.md"), "prior quirk\n", "utf8");
});

test.after(() => {
  if (previousHome === undefined) delete process.env.CURSOR_HOME;
  else process.env.CURSOR_HOME = previousHome;
  rmSync(tempHome, { recursive: true, force: true });
  rmSync(tempProject, { recursive: true, force: true });
});

/**
 * @param {Record<string, unknown>} input
 */
function runHook(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [guard], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: stdout.trim() }));
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

describe("recommendation insights stop", { concurrency: 1 }, () => {
  test("natural language missing lines follows up; present lines and explicit activation pass", async () => {
    activateSession("conv-rec", "main");
    recordPromptContext("conv-rec", "please fix the parser");

    const missing = await runHook({
      hook_event_name: "stop",
      conversation_id: "conv-rec",
      response: "## Implementation\ndone",
      workspace_roots: [tempProject],
    });
    assert.equal(missing.code, 2);
    const followup = JSON.parse(missing.stdout).followup_message;
    assert.match(followup, /Active mode/);
    assert.match(followup, /Does not switch mode/);
    assert.match(followup, /insights\.md/);

    const ok = await runHook({
      hook_event_name: "stop",
      conversation_id: "conv-rec",
      response:
        "Active mode: Main. Recommend Main (`use kodaelus main`). Does not switch mode.\nRead .kodaelus/insights.md\n",
      workspace_roots: [tempProject],
    });
    assert.equal(ok.code, 0);

    recordPromptContext("conv-rec", "use kodaelus main");
    const explicit = await runHook({
      hook_event_name: "stop",
      conversation_id: "conv-rec",
      response: "Read .kodaelus/insights.md\nshipped without a recommendation line",
      workspace_roots: [tempProject],
    });
    assert.equal(explicit.code, 0);
    deactivateSession("conv-rec");
  });

  test("a second stop without the lines still follows up", async () => {
    activateSession("conv-rec-loop", "ship");
    recordPromptContext("conv-rec-loop", "fix the thing");
    const once = await runHook({
      hook_event_name: "stop",
      conversation_id: "conv-rec-loop",
      loop_count: 1,
      response: "no lines",
      workspace_roots: [tempProject],
    });
    assert.equal(once.code, 2);
    assert.match(JSON.parse(once.stdout).followup_message, /still missing/i);
    deactivateSession("conv-rec-loop");
  });

  test("insights nudge is skipped when the file is absent", async () => {
    const bare = mkdtempSync(join(tmpdir(), "kodaelus-rec-bare-"));
    activateSession("conv-rec-bare", "prepare");
    recordPromptContext("conv-rec-bare", "use kodaelus prepare");
    const quiet = await runHook({
      hook_event_name: "stop",
      conversation_id: "conv-rec-bare",
      response: "Ready without an insights line",
      workspace_roots: [bare],
    });
    assert.equal(quiet.code, 0);
    deactivateSession("conv-rec-bare");
    rmSync(bare, { recursive: true, force: true });
  });
});
