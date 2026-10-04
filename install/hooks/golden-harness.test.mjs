/**
 * Small in-repo golden tasks: mode hooks and delivery shape, not SWE-bench.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";
import { findMissingDeliverySections } from "./lib/delivery-structure-guard.mjs";
import { activateSession, deactivateSession } from "./lib/session-store.mjs";

const hooksDir = fileURLToPath(new URL(".", import.meta.url));
const scopeHook = join(hooksDir, "scope-creep-guard.mjs");
const deliveryHook = join(hooksDir, "delivery-structure-guard.mjs");
const promptFenceHook = join(hooksDir, "prompt-fence-guard.mjs");
const gitHook = join(hooksDir, "block-git-when-kodaelus.mjs");

const tempHome = mkdtempSync(join(tmpdir(), "kodaelus-golden-home-"));
const tempProject = mkdtempSync(join(tmpdir(), "kodaelus-golden-proj-"));
const previousHome = process.env.CURSOR_HOME;
mkdirSync(join(tempProject, ".kodaelus", "suggestions"), { recursive: true });
writeFileSync(join(tempProject, "index.js"), "export {};\n", "utf8");

test.before(() => {
  process.env.CURSOR_HOME = tempHome;
});

test.after(() => {
  if (previousHome === undefined) delete process.env.CURSOR_HOME;
  else process.env.CURSOR_HOME = previousHome;
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
    child.on("close", (code) => resolve({ code, stdout: stdout.trim() }));
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

describe("golden harness", { concurrency: 1 }, () => {
test("golden: Suggest write allow, Bug product write deny", async () => {
  activateSession("golden-suggest", "suggest");
  const allow = await runHook(scopeHook, {
    hook_event_name: "preToolUse",
    conversation_id: "golden-suggest",
    tool_name: "Write",
    tool_input: {
      file_path: join(tempProject, ".kodaelus", "suggestions", "scan.md"),
      contents: "| Finding |",
    },
    workspace_roots: [tempProject],
  });
  assert.equal(JSON.parse(allow.stdout).permission, "allow");
  deactivateSession("golden-suggest");

  activateSession("golden-bug", "bug");
  const deny = await runHook(scopeHook, {
    hook_event_name: "preToolUse",
    conversation_id: "golden-bug",
    tool_name: "Write",
    tool_input: {
      file_path: join(tempProject, "index.js"),
      contents: "fix",
    },
    workspace_roots: [tempProject],
  });
  assert.equal(JSON.parse(deny.stdout).permission, "deny");
  deactivateSession("golden-bug");
});

test("golden: Main missing Follow-Up Queue fails; Prepare Ready and Lite soft-gate match", async () => {
  const mainMissing = findMissingDeliverySections(
    "main",
    "## Delivery Self-Check\n| Tests | npm test | Pass |\n",
  );
  assert.ok(mainMissing.includes("Follow-Up Queue"));

  activateSession("golden-main", "main");
  const stopped = await runHook(deliveryHook, {
    hook_event_name: "stop",
    conversation_id: "golden-main",
    response: "## Delivery Self-Check\n| Tests | npm test | Pass |\n",
  });
  assert.equal(stopped.code, 2);
  assert.match(JSON.parse(stopped.stdout).followup_message, /Follow-Up Queue/);
  deactivateSession("golden-main");

  const prepareReady = [
    "## Delivery Self-Check",
    "| suite | npm test | Pass |",
    "## Verdict",
    "Ready",
    "## Proposed commit message",
    "chore: note",
  ].join("\n");
  assert.deepEqual(findMissingDeliverySections("prepare", prepareReady), []);

  const liteMissing = findMissingDeliverySections("lite", "## Implementation\nonly");
  assert.ok(liteMissing.includes("Tests"));
  assert.ok(liteMissing.includes("Delivery Self-Check"));

  activateSession("golden-prompt", "prompt");
  const badFence = await runHook(promptFenceHook, {
    hook_event_name: "stop",
    conversation_id: "golden-prompt",
    response: `${"x".repeat(200)}\n\`\`\`\nuse kodaelus 1\n\nbody\n\`\`\``,
  });
  assert.equal(badFence.code, 2);
  assert.match(JSON.parse(badFence.stdout).followup_message, /prompt-fence/i);
  deactivateSession("golden-prompt");

  process.env.KODAELUS_CLOUD_DELIVERY = "0";
  activateSession("golden-main-git", "main");
  const mainCommit = await runHook(gitHook, {
    conversation_id: "golden-main-git",
    command: "git commit -m msg",
  });
  assert.equal(JSON.parse(mainCommit.stdout).permission, "deny");
  deactivateSession("golden-main-git");

  activateSession("golden-ship", "ship");
  const shipCommit = await runHook(gitHook, {
    conversation_id: "golden-ship",
    command: "git commit -m msg",
  });
  assert.equal(JSON.parse(shipCommit.stdout).permission, "allow");
  const shipForce = await runHook(gitHook, {
    conversation_id: "golden-ship",
    command: "git push --force",
  });
  assert.equal(JSON.parse(shipForce.stdout).permission, "deny");
  deactivateSession("golden-ship");
});
});
