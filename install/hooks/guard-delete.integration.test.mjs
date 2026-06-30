import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { activateSession, deactivateSession } from "./lib/session-store.mjs";

const hookScript = fileURLToPath(new URL("./guard-delete.mjs", import.meta.url));

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

  const manifest = JSON.parse(
    readFileSync(join(tempProject, ".kodaelus/deletion-manifest.json"), "utf8"),
  );
  assert.equal(manifest[0].entryPointCheck, "BLOCKED");

  deactivateSession("conv-active");
});

test("denies Delete on missing entry-point path when Kodaelus session is active", async () => {
  writeFileSync(
    join(tempProject, "package.json"),
    JSON.stringify({ main: "index.js", scripts: { start: "node index.js" } }),
    "utf8",
  );
  activateSession("conv-missing-entry", "main");

  const { stdout } = await runHook({
    conversation_id: "conv-missing-entry",
    tool_input: { path: join(tempProject, "index.js") },
    workspace_roots: [tempProject],
  });

  assert.equal(JSON.parse(stdout).permission, "deny");
  assert.match(JSON.parse(stdout).user_message, /entry-point/i);

  deactivateSession("conv-missing-entry");
});

test("backs up and allows Delete on non-entry-point file when Kodaelus session is active", async () => {
  seedEntryPointProject(tempProject);
  activateSession("conv-active-util", "main");

  const { code, stdout } = await runHook({
    conversation_id: "conv-active-util",
    tool_input: { path: join(tempProject, "util.js") },
    workspace_roots: [tempProject],
  });

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout), { permission: "allow" });

  const manifest = JSON.parse(
    readFileSync(join(tempProject, ".kodaelus/deletion-manifest.json"), "utf8"),
  );
  assert.equal(manifest.length, 1);
  assert.equal(manifest[0].path, "util.js");
  assert.ok(existsSync(join(tempProject, manifest[0].backup)));

  deactivateSession("conv-active-util");
});

test("skips backup in prompt mode but still blocks entry-point", async () => {
  seedEntryPointProject(tempProject);
  activateSession("conv-prompt", "prompt");

  const entry = await runHook({
    conversation_id: "conv-prompt",
    tool_input: { path: join(tempProject, "index.js") },
    workspace_roots: [tempProject],
  });
  assert.equal(JSON.parse(entry.stdout).permission, "deny");

  const util = await runHook({
    conversation_id: "conv-prompt",
    tool_input: { path: join(tempProject, "util.js") },
    workspace_roots: [tempProject],
  });
  assert.deepEqual(JSON.parse(util.stdout), { permission: "allow" });

  const manifest = JSON.parse(
    readFileSync(join(tempProject, ".kodaelus/deletion-manifest.json"), "utf8"),
  );
  assert.ok(manifest.every((row) => row.path !== "util.js"));
  assert.ok(manifest.every((row) => !row.backup));

  deactivateSession("conv-prompt");
});
