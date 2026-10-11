import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluatePath } from "./kodaelus-eval.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturesDir = join(repoRoot, "evals", "fixtures");

/**
 * @param {string} name
 * @param {string} body
 */
function tempJsonl(name, body) {
  const dir = mkdtempSync(join(tmpdir(), "kodaelus-eval-"));
  const file = join(dir, name);
  writeFileSync(file, body.endsWith("\n") ? body : `${body}\n`, "utf8");
  return { dir, file };
}

test("good synthetic transcript passes behavior checks and skips a missing baseline", () => {
  const result = evaluatePath(join(fixturesDir, "good.jsonl"));
  assert.equal(result.exitCode, 0);
  assert.equal(result.runCount, 1);
  const run = result.runs[0];
  assert.equal(run.checks.testBeforeEdit, "pass");
  assert.equal(run.checks.coreRead, "pass");
  assert.equal(run.checks.planBeforeEdit, "pass");
  assert.equal(run.checks.confidenceEvidence, "pass");
  assert.equal(run.categoryGate.status, "skip");
  assert.equal(run.rereadCount, 1);
  assert.equal(run.billed, null);
  assert.equal(run.tokenLabel, "estimator: chars/4");
  assert.ok(run.uniqueTokens > 0);
  assert.ok(run.largestSearches.length >= 1);
  assert.match(run.largestSearches[0].label, /Read protocol/);
  assert.match(result.report, /runs: 1/);
  assert.match(result.report, /reread count: 1/);
  assert.match(result.report, /unique tokens: \d+/);
  assert.match(result.report, /billed: unavailable/);
  assert.match(result.report, /estimator: chars\/4/);
  assert.match(result.report, /reread=/);
  assert.match(result.report, /largest searches:/);
  assert.match(result.report, /category gate: skipped \(no baseline\.json\)/);
  assert.match(result.report, /malformed lines: 0/);
});

test("bad synthetic transcript fails every behavior check", () => {
  const result = evaluatePath(join(fixturesDir, "bad.jsonl"));
  assert.equal(result.exitCode, 1);
  const run = result.runs[0];
  assert.equal(run.checks.testBeforeEdit, "fail");
  assert.equal(run.checks.coreRead, "fail");
  assert.equal(run.checks.planBeforeEdit, "fail");
  assert.equal(run.checks.confidenceEvidence, "fail");
  assert.match(result.report, /test-before-edit=fail/);
  assert.match(result.report, /core-read=fail/);
  assert.match(result.report, /plan-before-edit=fail/);
  assert.match(result.report, /confidence-evidence=fail/);
});

test("fixtures directory exits non-zero while the good transcript still passes", () => {
  const result = evaluatePath(fixturesDir);
  assert.equal(result.exitCode, 1);
  assert.equal(result.runCount, 2);
  const good = result.runs.find((run) => run.file.endsWith("good.jsonl"));
  const bad = result.runs.find((run) => run.file.endsWith("bad.jsonl"));
  assert.ok(good);
  assert.ok(bad);
  assert.equal(good.exitCode, 0);
  assert.equal(bad.exitCode, 1);
});

test("a parent scan skips child fixtures directories", () => {
  const root = mkdtempSync(join(tmpdir(), "kodaelus-eval-scan-"));
  const fixtures = join(root, "fixtures");
  mkdirSync(fixtures);
  writeFileSync(
    join(fixtures, "bad.jsonl"),
    `${JSON.stringify({ tool: "Write", path: "src/app.js", content: "x" })}\n`,
    "utf8",
  );
  writeFileSync(join(root, "README.md"), "drop\n", "utf8");
  const result = evaluatePath(root, { skipChildFixtures: true });
  assert.equal(result.runCount, 0);
  assert.equal(result.exitCode, 0);
  assert.match(result.report, /runs: 0/);
  assert.match(result.report, /category gate: skipped \(no transcript\)/);
  assert.equal(evaluatePath(fixtures).exitCode, 1);
});

test("a transcript with no relevant events skips each behavior check", () => {
  const { file } = tempJsonl("empty-events.jsonl", JSON.stringify({ role: "user", content: "hello" }));
  const result = evaluatePath(file);
  assert.equal(result.exitCode, 0);
  const run = result.runs[0];
  assert.equal(run.checks.testBeforeEdit, "skip");
  assert.equal(run.checks.coreRead, "skip");
  assert.equal(run.checks.planBeforeEdit, "skip");
  assert.equal(run.checks.confidenceEvidence, "skip");
  assert.equal(run.tokenLabel, "estimator: chars/4");
  assert.equal(run.billed, null);
  assert.match(result.report, /billed: unavailable/);
});

test("usage total_tokens is labeled and is not double-counted with input and output", () => {
  const line = JSON.stringify({
    role: "assistant",
    content: "note",
    usage: { total_tokens: 10, input_tokens: 100, output_tokens: 50 },
  });
  const { file } = tempJsonl("usage.jsonl", line);
  const result = evaluatePath(file);
  const run = result.runs[0];
  assert.equal(run.tokenLabel, "total_tokens");
  assert.equal(run.billed, 10);
  assert.match(result.report, /total_tokens/);
  assert.doesNotMatch(run.tokenLabel, /estimator: chars\/4/);
});

test("input_tokens plus output_tokens is the label when total_tokens is absent", () => {
  const line = JSON.stringify({
    role: "assistant",
    content: "note",
    usage: { input_tokens: 8, output_tokens: 2 },
  });
  const { file } = tempJsonl("usage-sum.jsonl", line);
  const result = evaluatePath(file);
  assert.equal(result.runs[0].tokenLabel, "input_tokens+output_tokens");
  assert.equal(result.runs[0].billed, 10);
});

test("category gate fails only when a share is greater than baseline times 1.10", () => {
  const lines = [
    JSON.stringify({
      role: "assistant",
      content: "## Plan\nGo.\nConfidence: 80% | Evidence: temp",
      usage: { total_tokens: 9 },
    }),
    JSON.stringify({
      tool: "Read",
      path: "kodaelus/core.md",
      content: "a",
      usage: { total_tokens: 0 },
    }),
    JSON.stringify({
      tool: "Shell",
      command: "npm test",
      exitCode: 1,
      content: "not ok",
      usage: { total_tokens: 0 },
    }),
    JSON.stringify({
      tool: "StrReplace",
      path: "kodaelus/core.md",
      content: "b",
      usage: { total_tokens: 0 },
    }),
    JSON.stringify({
      tool: "Read",
      path: "kodaelus/core.md",
      content: "cccc",
      usage: { total_tokens: 11 },
    }),
  ].join("\n");
  const { dir, file } = tempJsonl("gated.jsonl", lines);
  const open = evaluatePath(file);
  assert.equal(open.runs[0].categoryGate.status, "skip");
  assert.equal(open.runs[0].shares.reread, 0.55);

  writeFileSync(join(dir, "baseline.json"), JSON.stringify({ shares: { reread: 0.4 } }), "utf8");
  const over = evaluatePath(file);
  assert.equal(over.exitCode, 1);
  assert.equal(over.runs[0].checks.testBeforeEdit, "pass");
  assert.equal(over.runs[0].categoryGate.status, "fail");
  assert.match(over.report, /category gate: fail/);
  assert.match(over.report, /1\.10/);

  writeFileSync(join(dir, "baseline.json"), JSON.stringify({ shares: { reread: 0.5 } }), "utf8");
  const boundary = evaluatePath(file);
  assert.equal(boundary.runs[0].shares.reread, 0.55);
  assert.equal(boundary.runs[0].categoryGate.status, "pass");
  assert.equal(boundary.exitCode, 0);
});

test("malformed JSONL is counted and makes behavior checks unevaluable", () => {
  const body = [
    JSON.stringify({ tool: "Read", path: "kodaelus/core.md", content: "ok" }),
    "{not json",
  ].join("\n");
  const { file } = tempJsonl("bad-line.jsonl", body);
  const result = evaluatePath(file);
  assert.equal(result.exitCode, 1);
  assert.equal(result.runs[0].malformed, 1);
  assert.equal(result.runs[0].checks.coreRead, "unevaluable");
  assert.equal(result.runs[0].checks.testBeforeEdit, "unevaluable");
  assert.match(result.report, /malformed lines: 1/);
});

test("an rg command is a search and the largest output is reported first", () => {
  const lines = [
    JSON.stringify({ tool: "Shell", command: "rg -n ledger kodaelus", content: "short" }),
    JSON.stringify({
      tool: "Grep",
      pattern: "Read protocol",
      path: "kodaelus",
      content: "x".repeat(80),
    }),
  ].join("\n");
  const { file } = tempJsonl("search.jsonl", lines);
  const result = evaluatePath(file);
  const run = result.runs[0];
  assert.ok(run.shares.search > 0);
  assert.equal(run.largestSearches.length, 2);
  assert.match(run.largestSearches[0].label, /Read protocol/);
  assert.ok(run.largestSearches[0].tokens > run.largestSearches[1].tokens);
});

test("write-baseline records measured shares and refuses an empty drop", () => {
  const lines = [
    JSON.stringify({
      role: "assistant",
      content: "## Plan\nGo.\nConfidence: 80% | Evidence: temp",
      usage: { total_tokens: 4 },
    }),
    JSON.stringify({
      tool: "Read",
      path: "kodaelus/core.md",
      content: "a",
      usage: { total_tokens: 4 },
    }),
    JSON.stringify({
      tool: "Shell",
      command: "pytest -q",
      exitCode: 1,
      content: "failed",
      usage: { total_tokens: 4 },
    }),
    JSON.stringify({
      tool: "Write",
      path: "src/app.js",
      content: "hunk",
      usage: { total_tokens: 4 },
    }),
  ].join("\n");
  const { dir, file } = tempJsonl("drop.jsonl", lines);
  const written = evaluatePath(file, { writeBaseline: true });
  assert.equal(written.exitCode, 0);
  const baselinePath = join(dir, "baseline.json");
  assert.equal(existsSync(baselinePath), true);
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  assert.equal(typeof baseline.shares.reread, "number");
  assert.equal(baseline.shares.reasoning, written.runs[0].shares.reasoning);

  const emptyDir = mkdtempSync(join(tmpdir(), "kodaelus-eval-empty-"));
  const empty = evaluatePath(emptyDir, { writeBaseline: true });
  assert.equal(empty.exitCode, 1);
  assert.equal(existsSync(join(emptyDir, "baseline.json")), false);
  assert.match(empty.report, /not writing baseline\.json/);
});
