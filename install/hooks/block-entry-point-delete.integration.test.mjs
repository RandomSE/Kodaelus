import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { activateSession, deactivateSession } from "./lib/session-store.mjs";

const hookScript = fileURLToPath(new URL("./block-entry-point-delete.mjs", import.meta.url));

let tempHome;
let tempProject;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-hook-home-"));
  tempProject = mkdtempSync(join(tmpdir(), "kodaelus-hook-project-"));
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

test("allows Delete when Kodaelus session is inactive", async () => {
  seedEntryPointProject(tempProject);
  const { code, stdout } = await runHook({
    conversation_id: "conv-inactive",
    tool_input: { path: join(tempProject, "index.js") },
    workspace_roots: [tempProject],
  });

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout), { permission: "allow" });
});

test("denies Delete on entry-point file when Kodaelus session is active", async () => {
  seedEntryPointProject(tempProject);
  activateSession("conv-active");

  const { code, stdout } = await runHook({
    conversation_id: "conv-active",
    tool_input: { path: join(tempProject, "index.js") },
    workspace_roots: [tempProject],
  });

  assert.equal(code, 0);
  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");
  assert.match(result.user_message, /entry-point/i);
  assert.match(result.agent_message, /hard-blocked/i);

  deactivateSession("conv-active");
});

test("allows Delete on non-entry-point file when Kodaelus session is active", async () => {
  seedEntryPointProject(tempProject);
  activateSession("conv-active-util");

  const { code, stdout } = await runHook({
    conversation_id: "conv-active-util",
    tool_input: { path: join(tempProject, "util.js") },
    workspace_roots: [tempProject],
  });

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout), { permission: "allow" });

  deactivateSession("conv-active-util");
});
