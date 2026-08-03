import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { activateSession, deactivateSession } from "./lib/session-store.mjs";

const hookScript = fileURLToPath(new URL("./dash-guard.mjs", import.meta.url));
const EM = "\u2014";

let tempHome;
/** @type {string | null} */
let tempProject = null;

test.beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "kodaelus-dash-home-"));
  process.env.CURSOR_HOME = tempHome;
});

test.afterEach(() => {
  delete process.env.CURSOR_HOME;
  rmSync(tempHome, { recursive: true, force: true });
  if (tempProject && existsSync(tempProject)) {
    rmSync(tempProject, { recursive: true, force: true });
    tempProject = null;
  }
});

/**
 * @param {unknown} input
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

test("preToolUse Write with em dash returns deny and agent_message", async () => {
  activateSession("conv-dash-write", "main");

  const { code, stdout, stderr } = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-dash-write",
    tool_name: "Write",
    tool_input: {
      path: "notes.md",
      contents: `Hello${EM}world`,
    },
  });

  assert.equal(code, 0);
  const result = JSON.parse(stdout);
  assert.equal(result.permission, "deny");
  assert.match(result.agent_message, /1 unicode dash/);
  assert.match(stderr, /blocked edit/i);

  deactivateSession("conv-dash-write");
});

test("stop exits 2 with bounded followup_message when dashes present", async () => {
  activateSession("conv-dash-stop", "main");
  const text = `${"summary ".repeat(80)}${EM}${" tail ".repeat(40)}`;

  const { code, stdout, stderr } = await runHook({
    hook_event_name: "stop",
    conversation_id: "conv-dash-stop",
    response: text,
    loop_count: 0,
  });

  assert.equal(code, 2);
  const result = JSON.parse(stdout);
  assert.ok(result.followup_message);
  assert.ok(result.followup_message.length <= 1200);
  assert.match(result.followup_message, /unicode dash/i);
  assert.match(stderr, /unicode dash/i);

  deactivateSession("conv-dash-stop");
});

test("stop on loop retry omits artifact reference", async () => {
  activateSession("conv-dash-loop", "main");

  const { code, stdout } = await runHook({
    hook_event_name: "stop",
    conversation_id: "conv-dash-loop",
    response: `Still bad${EM}text`,
    loop_count: 1,
  });

  assert.equal(code, 2);
  const result = JSON.parse(stdout);
  assert.match(result.followup_message, /remain/i);
  assert.doesNotMatch(result.followup_message, /Sanitized reference/i);

  deactivateSession("conv-dash-loop");
});

test("inactive session allows preToolUse and stop no-op", async () => {
  const pre = await runHook({
    hook_event_name: "preToolUse",
    conversation_id: "conv-inactive",
    tool_name: "Write",
    tool_input: { path: "x.md", contents: `bad${EM}` },
  });
  assert.equal(pre.code, 0);
  assert.equal(JSON.parse(pre.stdout).permission, "allow");

  const stop = await runHook({
    hook_event_name: "stop",
    conversation_id: "conv-inactive",
    response: `bad${EM}`,
  });
  assert.equal(stop.code, 0);
  assert.equal(stop.stdout, "{}");
});

test("stop writes sanitized artifact on first loop", async () => {
  tempProject = mkdtempSync(join(tmpdir(), "kodaelus-dash-project-"));
  activateSession("conv-dash-artifact", "main");

  const { code } = await runHook({
    hook_event_name: "stop",
    conversation_id: "conv-dash-artifact",
    response: `Needs fix${EM}here`,
    loop_count: 0,
    workspace_roots: [tempProject],
  });

  assert.equal(code, 2);
  const artifact = join(tempProject, ".kodaelus", "dash-guard", "conv-dash-artifact-fix.md");
  assert.ok(existsSync(artifact));
  const content = readFileSync(artifact, "utf8");
  assert.doesNotMatch(content, /[\u2013\u2014]/);

  deactivateSession("conv-dash-artifact");
});
