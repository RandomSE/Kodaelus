import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { activateSession, deactivateSession } from "./lib/session-store.mjs";

const hookScript = fileURLToPath(
  new URL("./confidence-evidence-guard.mjs", import.meta.url),
);

let tempHome;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-confidence-home-"));
  process.env.CURSOR_HOME = tempHome;
});

test.afterEach(() => {
  delete process.env.CURSOR_HOME;
  rmSync(tempHome, { recursive: true, force: true });
});

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

test("stop exits 2 with followup_message when bare confidence on main delivery", async () => {
  activateSession("conv-conf", "main");
  const longText = `${"x".repeat(500)} Confidence: 80% without evidence nearby.`;

  const { code, stdout, stderr } = await runHook({
    hook_event_name: "stop",
    conversation_id: "conv-conf",
    response: longText,
  });

  assert.equal(code, 2);
  const result = JSON.parse(stdout);
  assert.ok(result.followup_message);
  assert.match(stderr, /bare Confidence/i);

  deactivateSession("conv-conf");
});
