import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  activateSession,
  deactivateSession,
  getSessionMetadata,
  isPrepareFixCycleCapped,
  recordPrepareSuiteAttempt,
  recordShellEvidence,
  recordTouchedFile,
} from "./lib/session-store.mjs";

const scopeHook = fileURLToPath(new URL("./scope-creep-guard.mjs", import.meta.url));
const readonlyShellHook = fileURLToPath(
  new URL("./block-readonly-shell.mjs", import.meta.url),
);
const secretsHook = fileURLToPath(new URL("./secrets-guard.mjs", import.meta.url));
const deliveryHook = fileURLToPath(
  new URL("./delivery-structure-guard.mjs", import.meta.url),
);
const promptFenceHook = fileURLToPath(
  new URL("./prompt-fence-guard.mjs", import.meta.url),
);
const testEvidenceHook = fileURLToPath(
  new URL("./test-evidence-guard.mjs", import.meta.url),
);
const shellEvidenceHook = fileURLToPath(
  new URL("./shell-evidence-recorder.mjs", import.meta.url),
);

let tempHome;
let tempProject;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-enforce-home-"));
  tempProject = mkdtempSync(join(tmpdir(), "kodaelus-enforce-project-"));
  process.env.CURSOR_HOME = tempHome;
  writeFileSync(
    join(tempProject, "package.json"),
    JSON.stringify({ name: "tmp", main: "index.js" }),
    "utf8",
  );
  writeFileSync(join(tempProject, "index.js"), "export {};\n", "utf8");
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

const longPad = "x".repeat(520);

test("1: bug mode denies product Write; allows dossier and test", async () => {
  activateSession("conv-bug-write", "bug");

  const denied = await runHook(scopeHook, {
    hook_event_name: "preToolUse",
    conversation_id: "conv-bug-write",
    tool_name: "Write",
    tool_input: { path: join(tempProject, "index.js"), contents: "fix" },
    workspace_roots: [tempProject],
  });
  assert.equal(JSON.parse(denied.stdout).permission, "deny");
  assert.match(JSON.parse(denied.stdout).user_message, /Bug Investigation/i);

  mkdirSync(join(tempProject, ".kodaelus", "bugs"), { recursive: true });
  const allowedDossier = await runHook(scopeHook, {
    hook_event_name: "preToolUse",
    conversation_id: "conv-bug-write",
    tool_name: "Write",
    tool_input: {
      path: join(tempProject, ".kodaelus", "bugs", "x-dossier.md"),
      contents: "dossier",
    },
    workspace_roots: [tempProject],
  });
  assert.deepEqual(JSON.parse(allowedDossier.stdout), { permission: "allow" });

  const allowedTest = await runHook(scopeHook, {
    hook_event_name: "preToolUse",
    conversation_id: "conv-bug-write",
    tool_name: "Write",
    tool_input: {
      path: join(tempProject, "repro.test.mjs"),
      contents: "test",
    },
    workspace_roots: [tempProject],
  });
  assert.deepEqual(JSON.parse(allowedTest.stdout), { permission: "allow" });

  deactivateSession("conv-bug-write");
});

test("2: suggest allows Write under suggestions; denies elsewhere; allows mkdir", async () => {
  activateSession("conv-suggest", "suggest");

  mkdirSync(join(tempProject, ".kodaelus", "suggestions"), { recursive: true });
  const allowed = await runHook(scopeHook, {
    hook_event_name: "preToolUse",
    conversation_id: "conv-suggest",
    tool_name: "Write",
    tool_input: {
      path: join(tempProject, ".kodaelus", "suggestions", "2026-08-09-issues.md"),
      contents: "| Finding |",
    },
    workspace_roots: [tempProject],
  });
  assert.deepEqual(JSON.parse(allowed.stdout), { permission: "allow" });

  const denied = await runHook(scopeHook, {
    hook_event_name: "preToolUse",
    conversation_id: "conv-suggest",
    tool_name: "Write",
    tool_input: { path: join(tempProject, "index.js"), contents: "x" },
    workspace_roots: [tempProject],
  });
  assert.equal(JSON.parse(denied.stdout).permission, "deny");

  const mkdirOk = await runHook(readonlyShellHook, {
    conversation_id: "conv-suggest",
    command: "mkdir .kodaelus/suggestions",
    workspace_roots: [tempProject],
  });
  assert.deepEqual(JSON.parse(mkdirOk.stdout), { permission: "allow" });

  const mkdirBad = await runHook(readonlyShellHook, {
    conversation_id: "conv-suggest",
    command: "mkdir src/new",
    workspace_roots: [tempProject],
  });
  assert.equal(JSON.parse(mkdirBad.stdout).permission, "deny");

  deactivateSession("conv-suggest");
});

test("3: delivery-structure stop follow-up for main missing sections", async () => {
  activateSession("conv-delivery", "main");
  const { code, stdout } = await runHook(deliveryHook, {
    hook_event_name: "stop",
    conversation_id: "conv-delivery",
    response: `${longPad}\n## Plan\nonly`,
  });
  assert.equal(code, 2);
  assert.match(JSON.parse(stdout).followup_message, /Delivery Self-Check|Follow-Up Queue/);
  deactivateSession("conv-delivery");
});

test("4: prompt-fence stop follow-up when fence invalid", async () => {
  activateSession("conv-prompt-fence", "prompt");
  const bad = await runHook(promptFenceHook, {
    hook_event_name: "stop",
    conversation_id: "conv-prompt-fence",
    response: `${longPad}\n\`\`\`\nuse kodaelus 1\n\nbody\n\`\`\``,
  });
  assert.equal(bad.code, 2);
  assert.match(JSON.parse(bad.stdout).followup_message, /prompt-fence/i);

  const good = await runHook(promptFenceHook, {
    hook_event_name: "stop",
    conversation_id: "conv-prompt-fence",
    response: [
      longPad,
      "```",
      "use kodaelus main",
      "",
      "Main mode (0) spec",
      "```",
    ].join("\n"),
  });
  assert.equal(good.code, 0);

  deactivateSession("conv-prompt-fence");
});

test("5: prepare fix-cycle cap denies product edits", async () => {
  activateSession("conv-prepare", "prepare");
  recordPrepareSuiteAttempt("conv-prepare");
  recordPrepareSuiteAttempt("conv-prepare");
  recordPrepareSuiteAttempt("conv-prepare");
  recordPrepareSuiteAttempt("conv-prepare");
  assert.equal(isPrepareFixCycleCapped("conv-prepare"), true);

  const denied = await runHook(scopeHook, {
    hook_event_name: "preToolUse",
    conversation_id: "conv-prepare",
    tool_name: "Write",
    tool_input: { path: join(tempProject, "index.js"), contents: "x" },
    workspace_roots: [tempProject],
  });
  assert.equal(JSON.parse(denied.stdout).permission, "deny");
  assert.match(JSON.parse(denied.stdout).user_message, /fix-cycle cap/i);

  const testAllowed = await runHook(scopeHook, {
    hook_event_name: "preToolUse",
    conversation_id: "conv-prepare",
    tool_name: "Write",
    tool_input: {
      path: join(tempProject, "index.test.mjs"),
      contents: "test",
    },
    workspace_roots: [tempProject],
  });
  assert.deepEqual(JSON.parse(testAllowed.stdout), { permission: "allow" });

  deactivateSession("conv-prepare");
});

test("6: secrets-guard denies credential writes outside fixtures", async () => {
  activateSession("conv-secrets", "main");
  const denied = await runHook(secretsHook, {
    hook_event_name: "preToolUse",
    conversation_id: "conv-secrets",
    tool_name: "Write",
    tool_input: {
      path: join(tempProject, "config.ts"),
      contents: 'const api_key = "sk-abcdefghijklmnopqrstuvwxyz12";\n',
    },
    workspace_roots: [tempProject],
  });
  assert.equal(JSON.parse(denied.stdout).permission, "deny");

  mkdirSync(join(tempProject, "fixtures"), { recursive: true });
  const allowed = await runHook(secretsHook, {
    hook_event_name: "preToolUse",
    conversation_id: "conv-secrets",
    tool_name: "Write",
    tool_input: {
      path: join(tempProject, "fixtures", "sample.env"),
      contents: "API_KEY=sk-abcdefghijklmnopqrstuvwxyz12\n",
    },
    workspace_roots: [tempProject],
  });
  assert.deepEqual(JSON.parse(allowed.stdout), { permission: "allow" });

  deactivateSession("conv-secrets");
});

test("7: test-evidence soft-gate and shell evidence recorder", async () => {
  activateSession("conv-evidence", "main");
  recordTouchedFile("conv-evidence", "index.js");

  const gated = await runHook(testEvidenceHook, {
    hook_event_name: "stop",
    conversation_id: "conv-evidence",
    response: `${longPad}\n## Implementation\n${"y".repeat(100)}\n`,
  });
  assert.equal(gated.code, 2);
  assert.match(JSON.parse(gated.stdout).followup_message, /test-evidence/i);

  await runHook(shellEvidenceHook, {
    hook_event_name: "afterShellExecution",
    conversation_id: "conv-evidence",
    command: "npm test",
    exit_code: 0,
  });
  const meta = getSessionMetadata("conv-evidence");
  assert.ok(meta?.shellEvidence.some((e) => e.command.includes("npm test")));

  const ok = await runHook(testEvidenceHook, {
    hook_event_name: "stop",
    conversation_id: "conv-evidence",
    response: `${longPad}\n## Implementation\n${"y".repeat(100)}\n## Tests\nnpm test pass\n`,
  });
  assert.equal(ok.code, 0);

  deactivateSession("conv-evidence");
});
