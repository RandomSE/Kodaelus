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
import { activateSession, deactivateSession, getSessionMode } from "./lib/session-store.mjs";

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

test("same-turn: prompt session upgrades to main on contaminated main paste", async () => {
  activateSession("conv-sticky-upgrade", "prompt");
  assert.equal(getSessionMode("conv-sticky-upgrade"), "prompt");

  const contaminated = [
    "use kodaelus main",
    "Prior Recommended prompt said use kodaelus 1 and kodaelus prompt mode.",
    "# Bugfix",
    "Ship the sticky upgrade fix.",
  ].join("\n");

  await runSessionHook({
    hook_event_name: "beforeSubmitPrompt",
    conversation_id: "conv-sticky-upgrade",
    prompt: contaminated,
    workspace_roots: [tempProject],
  });

  assert.equal(getSessionMode("conv-sticky-upgrade"), "main");
  deactivateSession("conv-sticky-upgrade");
});

test("subagentStart maps kodaelus, kodaelus-bug, and kodaelus-prompt when inactive", async () => {
  const cases = [
    ["kodaelus", "main"],
    ["kodaelus-bug", "bug"],
    ["kodaelus-prompt", "prompt"],
  ];
  for (const [subagentType, mode] of cases) {
    const conversationId = `conv-sub-${subagentType}`;
    await runSessionHook({
      hook_event_name: "subagentStart",
      conversation_id: conversationId,
      subagent_type: subagentType,
      workspace_roots: [tempProject],
    });
    assert.equal(getSessionMode(conversationId), mode, subagentType);
    deactivateSession(conversationId);
  }
});

test("subagentStart does not overwrite an active session with a different mode", async () => {
  activateSession("conv-sub-keep", "main");
  const { stderr } = await runSessionHook({
    hook_event_name: "subagentStart",
    conversation_id: "conv-sub-keep",
    subagent_type: "kodaelus-bug",
    workspace_roots: [tempProject],
  });
  assert.equal(getSessionMode("conv-sub-keep"), "main");
  assert.match(stderr, /not overwriting/i);
  deactivateSession("conv-sub-keep");
});

test("subagentStart ignores types that only contain the kodaelus letters", async () => {
  await runSessionHook({
    hook_event_name: "subagentStart",
    conversation_id: "conv-sub-unknown",
    subagent_type: "kodaelus-lite",
    workspace_roots: [tempProject],
  });
  assert.equal(getSessionMode("conv-sub-unknown"), null);
});
