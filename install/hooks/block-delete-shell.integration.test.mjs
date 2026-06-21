import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { activateSession, deactivateSession } from "./lib/session-store.mjs";

const hookScript = fileURLToPath(new URL("./block-delete-shell.mjs", import.meta.url));

let tempHome;
let tempProject;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-shell-hook-home-"));
  tempProject = mkdtempSync(join(tmpdir(), "kodaelus-shell-hook-project-"));
  process.env.CURSOR_HOME = tempHome;
});

test.afterEach(() => {
  delete process.env.CURSOR_HOME;
  rmSync(tempHome, { recursive: true, force: true });
  rmSync(tempProject, { recursive: true, force: true });
});

/**
 * @param {Record<string, unknown>} input
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

function seedEntryPointProject(root) {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ main: "index.js", scripts: { start: "node index.js" } }),
    "utf8",
  );
  writeFileSync(join(root, "index.js"), "console.log('entry');\n", "utf8");
  writeFileSync(join(root, "util.js"), "export {};\n", "utf8");
}

test("allows shell rm when Kodaelus session is inactive", async () => {
  seedEntryPointProject(tempProject);
  const { code, stdout } = await runHook({
    conversation_id: "conv-shell-inactive",
    command: "rm -f index.js",
    workspace_roots: [tempProject],
  });

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout), { permission: "allow" });
});

test("denies shell rm on entry-point when Kodaelus session is active", async () => {
  seedEntryPointProject(tempProject);
  activateSession("conv-shell-active");

  const { code, stdout } = await runHook({
    conversation_id: "conv-shell-active",
    command: "rm -f index.js",
    workspace_roots: [tempProject],
  });

  assert.equal(code, 0);
  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");
  assert.match(result.user_message, /entry-point/i);
  assert.match(result.agent_message, /Shell delete/i);

  deactivateSession("conv-shell-active");
});

test("allows shell rm on non-entry-point when Kodaelus session is active", async () => {
  seedEntryPointProject(tempProject);
  activateSession("conv-shell-util");

  const { code, stdout } = await runHook({
    conversation_id: "conv-shell-util",
    command: "rm -f util.js",
    workspace_roots: [tempProject],
  });

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout), { permission: "allow" });

  deactivateSession("conv-shell-util");
});

test("denies Remove-Item on entry-point when Kodaelus session is active", async () => {
  seedEntryPointProject(tempProject);
  activateSession("conv-shell-ps");

  const { code, stdout } = await runHook({
    conversation_id: "conv-shell-ps",
    command: "Remove-Item -Force index.js",
    workspace_roots: [tempProject],
  });

  assert.equal(code, 0);
  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");

  deactivateSession("conv-shell-ps");
});
