/**
 * Product-outcome fixtures: suggestion shape, delivery text, and a one-file suite.
 * Not an external leaderboard.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";
import { findMissingDeliverySections } from "./lib/delivery-structure-guard.mjs";
import { activateSession, deactivateSession, recordShipCiPoll } from "./lib/session-store.mjs";

const hooksDir = fileURLToPath(new URL(".", import.meta.url));
const fixtures = join(hooksDir, "fixtures");
const scopeHook = join(hooksDir, "scope-creep-guard.mjs");
const tempHome = mkdtempSync(join(tmpdir(), "kodaelus-outcome-home-"));
const previousHome = process.env.CURSOR_HOME;

test.before(() => {
  process.env.CURSOR_HOME = tempHome;
});

test.after(() => {
  if (previousHome === undefined) delete process.env.CURSOR_HOME;
  else process.env.CURSOR_HOME = previousHome;
  rmSync(tempHome, { recursive: true, force: true });
});

/**
 * @param {string} script
 * @param {Record<string, unknown>} input
 */
function runHook(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, KODAELUS_CLOUD_DELIVERY: "0" },
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

function runNodeTest(cwd) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("NODE_TEST") || key === "NODE_CHANNEL_FD" || key === "NODE_OPTIONS") {
      delete env[key];
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", "add.check.mjs"], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
  });
}

describe("golden product outcomes", { concurrency: 1 }, () => {
  test("delivery fixtures match ship green and main Follow-Up Queue rules", () => {
    const ship = readFileSync(join(fixtures, "golden-delivery", "ship-green.md"), "utf8");
    const main = readFileSync(join(fixtures, "golden-delivery", "main-no-fuq.md"), "utf8");
    assert.deepEqual(findMissingDeliverySections("ship", ship), []);
    assert.ok(findMissingDeliverySections("main", main).includes("Follow-Up Queue"));
  });

  test("suggest write lands the fixture suggestion shape", async () => {
    const project = mkdtempSync(join(tmpdir(), "kodaelus-outcome-suggest-"));
    const body = readFileSync(join(fixtures, "golden-suggest", "scan.md"), "utf8");
    const dest = join(project, ".kodaelus", "suggestions", "scan.md");
    activateSession("outcome-suggest", "suggest");
    const allow = await runHook(scopeHook, {
      hook_event_name: "preToolUse",
      conversation_id: "outcome-suggest",
      tool_name: "Write",
      tool_input: { file_path: dest, contents: body },
      workspace_roots: [project],
    });
    assert.equal(JSON.parse(allow.stdout).permission, "allow");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(project, ".kodaelus", "suggestions"), { recursive: true });
    writeFileSync(dest, body, "utf8");
    assert.match(readFileSync(dest, "utf8"), /\| Finding \|/);
    deactivateSession("outcome-suggest");
    rmSync(project, { recursive: true, force: true });
  });

  test("broken add fixture fails, then the one-line fix passes", async () => {
    const project = mkdtempSync(join(tmpdir(), "kodaelus-outcome-suite-"));
    cpSync(join(fixtures, "golden-suite"), project, { recursive: true });
    const broken = await runNodeTest(project);
    assert.notEqual(broken.code, 0);

    const sourcePath = join(project, "add.mjs");
    const source = readFileSync(sourcePath, "utf8").replace("return a - b;", "return a + b;");
    writeFileSync(sourcePath, source, "utf8");
    const fixed = await runNodeTest(project);
    assert.equal(fixed.code, 0);
    rmSync(project, { recursive: true, force: true });
  });

  test("ship CI repair hook allows 3 product writes then denies", async () => {
    const project = mkdtempSync(join(tmpdir(), "kodaelus-outcome-ship-"));
    writeFileSync(join(project, "index.js"), "export {};\n", "utf8");
    activateSession("outcome-ship", "ship");
    recordShipCiPoll("outcome-ship", "fail");
    const target = join(project, "index.js");
    for (let i = 1; i <= 3; i += 1) {
      const allowed = await runHook(scopeHook, {
        hook_event_name: "preToolUse",
        conversation_id: "outcome-ship",
        tool_name: "Write",
        tool_input: { file_path: target, contents: `export const n = ${i};\n` },
        workspace_roots: [project],
      });
      assert.equal(JSON.parse(allowed.stdout).permission, "allow", `write ${i}`);
    }
    const denied = await runHook(scopeHook, {
      hook_event_name: "preToolUse",
      conversation_id: "outcome-ship",
      tool_name: "Write",
      tool_input: { file_path: target, contents: "export const n = 4;\n" },
      workspace_roots: [project],
    });
    const body = JSON.parse(denied.stdout);
    assert.equal(body.permission, "deny");
    assert.match(body.user_message, /ship ci continue/i);
    deactivateSession("outcome-ship");
    rmSync(project, { recursive: true, force: true });
  });
});
