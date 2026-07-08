import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { copyToTrash } from "./lib/deletion-guard.mjs";
import { appendManifestEntry } from "./lib/deletion-manifest-io.mjs";
import { recordPreferenceCandidate } from "./lib/preference-learning.mjs";
import { ensureProjectGuidelines } from "./lib/project-guidelines.mjs";
import { activateSession, deactivateSession } from "./lib/session-store.mjs";

const sessionHook = fileURLToPath(new URL("./kodaelus-session.mjs", import.meta.url));

let tempHome;
let tempProject;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-session-home-"));
  tempProject = mkdtempSync(join(tmpdir(), "kodaelus-session-project-"));
  process.env.CURSOR_HOME = tempHome;
});

test.afterEach(() => {
  delete process.env.CURSOR_HOME;
  delete process.env.KODAELUS_RECORD_PREFERENCE;
  rmSync(tempHome, { recursive: true, force: true });
  rmSync(tempProject, { recursive: true, force: true });
});

/**
 * @param {Record<string, unknown>} input
 */
function runSessionHook(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [sessionHook], {
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

test("bootstraps project guidelines on Kodaelus activation", async () => {
  await runSessionHook({
    hook_event_name: "beforeSubmitPrompt",
    conversation_id: "conv-bootstrap",
    prompt: "use kodaelus main",
    workspace_roots: [tempProject],
  });

  const guidelinesPath = join(tempProject, ".kodaelus", "instructions.md");
  assert.ok(existsSync(guidelinesPath));
  assert.match(readFileSync(guidelinesPath, "utf8"), /Project guidelines/);
});

test("restores file when prompt says restore <path>", async () => {
  writeFileSync(join(tempProject, "removed.ts"), "original\n", "utf8");
  const { backupPath, timestamp } = copyToTrash(tempProject, "removed.ts");
  appendManifestEntry(tempProject, {
    path: "removed.ts",
    reason: "test",
    confidence: 100,
    backup: backupPath,
    timestamp,
    entryPointCheck: "Pass",
  });
  rmSync(join(tempProject, "removed.ts"));

  activateSession("conv-restore");
  const { stderr } = await runSessionHook({
    hook_event_name: "beforeSubmitPrompt",
    conversation_id: "conv-restore",
    prompt: "restore removed.ts",
    workspace_roots: [tempProject],
  });

  assert.match(stderr, /restored removed\.ts/i);
  assert.match(readFileSync(join(tempProject, "removed.ts"), "utf8"), /original/);
  deactivateSession("conv-restore");
});

test("appends preference on third explicit record via env", async () => {
  ensureProjectGuidelines(tempProject);
  activateSession("conv-pref");

  for (let i = 0; i < 2; i++) {
    process.env.KODAELUS_RECORD_PREFERENCE = "use vitest for all tests";
    await runSessionHook({
      hook_event_name: "beforeSubmitPrompt",
      conversation_id: "conv-pref",
      prompt: "continue",
      workspace_roots: [tempProject],
    });
  }

  process.env.KODAELUS_RECORD_PREFERENCE = "use vitest for all tests";
  const { stderr } = await runSessionHook({
    hook_event_name: "beforeSubmitPrompt",
    conversation_id: "conv-pref",
    prompt: "continue",
    workspace_roots: [tempProject],
  });

  const guidelines = readFileSync(join(tempProject, ".kodaelus", "instructions.md"), "utf8");
  assert.match(guidelines, /source: repeated request \| use vitest for all tests/);
  assert.match(stderr, /appended preference/i);

  const direct = recordPreferenceCandidate(tempProject, "use vitest for all tests");
  assert.equal(direct.count, 1);

  deactivateSession("conv-pref");
});
