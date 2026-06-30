import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  activateSession,
  deactivateSession,
  getUnverifiedPendingDeletes,
} from "./lib/session-store.mjs";

const guardScript = fileURLToPath(new URL("./guard-delete.mjs", import.meta.url));
const verifyScript = fileURLToPath(new URL("./manifest-verify.mjs", import.meta.url));

let tempHome;
let tempProject;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-manifest-home-"));
  tempProject = mkdtempSync(join(tmpdir(), "kodaelus-manifest-project-"));
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

function seedProject(root) {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ main: "index.js" }),
    "utf8",
  );
  writeFileSync(join(root, "index.js"), "console.log('ok');\n", "utf8");
  writeFileSync(join(root, "util.js"), "export {};\n", "utf8");
}

test("marks pending delete verified after postToolUse Delete", async () => {
  seedProject(tempProject);
  activateSession("conv-verify", "main");

  await runHook(guardScript, {
    conversation_id: "conv-verify",
    tool_input: { path: join(tempProject, "util.js") },
    workspace_roots: [tempProject],
  });

  assert.equal(getUnverifiedPendingDeletes("conv-verify").length, 1);

  await runHook(verifyScript, {
    hook_event_name: "postToolUse",
    conversation_id: "conv-verify",
    tool_input: { path: join(tempProject, "util.js") },
    workspace_roots: [tempProject],
  });

  assert.equal(getUnverifiedPendingDeletes("conv-verify").length, 0);

  deactivateSession("conv-verify");
});

test("sessionEnd logs when manifest verification never ran", async () => {
  seedProject(tempProject);
  activateSession("conv-pending", "main");

  await runHook(guardScript, {
    conversation_id: "conv-pending",
    tool_input: { path: join(tempProject, "util.js") },
    workspace_roots: [tempProject],
  });

  unlinkSync(join(tempProject, ".kodaelus/deletion-manifest.json"));

  const sessionScript = fileURLToPath(new URL("./kodaelus-session.mjs", import.meta.url));
  const { stderr } = await runHook(sessionScript, {
    hook_event_name: "sessionEnd",
    conversation_id: "conv-pending",
    workspace_roots: [tempProject],
  });

  assert.match(stderr, /missing manifest entry or backup/i);
});
