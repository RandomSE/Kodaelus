import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluatePath, expectLocal } from "./kodaelus-eval.mjs";

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
  assert.match(result.report, /re-read count: 1/);
  assert.match(result.report, /re-reads by file: kodaelus\/core.md=1/);
  assert.match(result.report, /unique tokens: \d+/);
  assert.match(result.report, /billed: unavailable/);
  assert.match(result.report, /estimator: chars\/4/);
  assert.match(result.report, /re-reads=/);
  assert.match(result.report, /largest searches:/);
  assert.match(result.report, /category gate: skipped \(no baseline\.json\)/);
  assert.match(result.report, /malformed lines: 0/);
});

test("bad synthetic transcript fails every behavior check and is not a regression", () => {
  const result = evaluatePath(join(fixturesDir, "bad.jsonl"));
  assert.equal(result.runs[0].exitCode, 1);
  assert.equal(result.exitCode, 0);
  const run = result.runs[0];
  assert.equal(run.checks.testBeforeEdit, "fail");
  assert.equal(run.checks.coreRead, "fail");
  assert.equal(run.checks.planBeforeEdit, "fail");
  assert.equal(run.checks.confidenceEvidence, "fail");
  assert.match(result.report, /test-before-edit=fail/);
  assert.match(result.report, /core\.md read before first edit\/shell=fail/);
  assert.match(result.report, /plan-before-edit=fail/);
  assert.match(result.report, /confidence-evidence=fail/);
});

test("fixtures directory is not a regression when bad fails and good passes", () => {
  const result = evaluatePath(fixturesDir);
  assert.equal(result.exitCode, 0);
  assert.ok(result.runCount >= 2);
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
  const direct = evaluatePath(fixtures);
  assert.equal(direct.runCount, 1);
  assert.equal(direct.runs[0].exitCode, 1);
  assert.equal(direct.exitCode, 0);
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
  assert.equal(open.runs[0].shares["re-reads"], 0.55);

  writeFileSync(join(dir, "baseline.json"), JSON.stringify({ shares: { "re-reads": 0.4 } }), "utf8");
  const over = evaluatePath(file);
  assert.equal(over.exitCode, 1);
  assert.equal(over.runs[0].checks.testBeforeEdit, "pass");
  assert.equal(over.runs[0].categoryGate.status, "fail");
  assert.match(over.report, /category gate: fail/);
  assert.match(over.report, /1\.10/);

  writeFileSync(join(dir, "baseline.json"), JSON.stringify({ shares: { "re-reads": 0.5 } }), "utf8");
  const boundary = evaluatePath(file);
  assert.equal(boundary.runs[0].shares["re-reads"], 0.55);
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
  assert.equal(typeof baseline.shares["re-reads"], "number");
  assert.equal(baseline.shares.reasoning, written.runs[0].shares.reasoning);

  const emptyDir = mkdtempSync(join(tmpdir(), "kodaelus-eval-empty-"));
  const empty = evaluatePath(emptyDir, { writeBaseline: true });
  assert.equal(empty.exitCode, 1);
  assert.equal(existsSync(join(emptyDir, "baseline.json")), false);
  assert.match(empty.report, /not writing baseline\.json/);
});

test("core.md read before first edit/shell fails when the read comes after a shell", () => {
  const lines = [
    JSON.stringify({
      role: "assistant",
      content: "## Plan\nWork.\nConfidence: 80% | Evidence: policy/core.md:1",
    }),
    JSON.stringify({ tool: "Shell", command: "npm test", exitCode: 1, content: "not ok" }),
    JSON.stringify({ tool: "Read", path: "policy/core.md", content: "abcd" }),
    JSON.stringify({ tool: "StrReplace", path: "src/module.txt", content: "abcd" }),
  ].join("\n");
  const { file } = tempJsonl("core-late.jsonl", lines);
  const result = evaluatePath(file);
  assert.equal(result.runs[0].checks.coreRead, "fail");
  assert.match(result.report, /core\.md read before first edit\/shell=fail/);
  assert.equal(result.runs[0].checks.testBeforeEdit, "pass");
  assert.equal(result.runs[0].checks.planBeforeEdit, "pass");
  assert.equal(result.runs[0].checks.confidenceEvidence, "pass");

  const positive = evaluatePath(join(fixturesDir, "coreRead.positive.jsonl"));
  assert.equal(positive.runs[0].checks.coreRead, "pass");
  assert.match(positive.report, /core\.md read before first edit\/shell=pass/);
});

test("each behavior check has a positive and a negative fixture", () => {
  const checks = ["testBeforeEdit", "coreRead", "planBeforeEdit", "confidenceEvidence"];
  for (const check of checks) {
    const pos = evaluatePath(join(fixturesDir, `${check}.positive.jsonl`));
    assert.equal(pos.runs[0].checks[check], "pass", check);
    assert.equal(pos.runs[0].exitCode, 0, check);
    assert.equal(pos.exitCode, 0, check);
    const neg = evaluatePath(join(fixturesDir, `${check}.negative.jsonl`));
    assert.equal(neg.runs[0].checks[check], "fail", check);
    assert.equal(neg.runs[0].exitCode, 1, check);
    assert.equal(neg.exitCode, 0, check);
    for (const other of checks) {
      if (other === check) continue;
      assert.equal(neg.runs[0].checks[other], "pass", `${check} also failed ${other}`);
    }
  }
});

test("anonymised transcript matches hand counts and stays within the baseline", () => {
  const result = evaluatePath(join(repoRoot, "evals", "anon.jsonl"));
  assert.equal(result.runCount, 1);
  assert.equal(result.exitCode, 0);
  const run = result.runs[0];
  // Each tool result is credited to its own call: the 40-char Read result is a read,
  // the 20-char Grep result is a search, and only the shell output is tool-output.
  assert.deepEqual(run.tokens, {
    reads: 10,
    "re-reads": 4,
    search: 5,
    edits: 2,
    reasoning: 19,
    "tool-output": 2,
  });
  assert.equal(run.rereadCount, 1);
  assert.deepEqual(run.rereadCounts, { "policy/core.md": 1 });
  assert.equal(run.largestOutputs.length, 1);
  assert.equal(run.largestOutputs[0].label, "not ok");
  assert.equal(run.largestOutputs[0].tokens, 2);
  assert.equal(run.checks.testBeforeEdit, "pass");
  assert.equal(run.checks.coreRead, "pass");
  assert.equal(run.checks.planBeforeEdit, "pass");
  assert.equal(run.checks.confidenceEvidence, "pass");
  assert.equal(run.categoryGate.status, "pass");
  assert.equal(run.tokenLabel, "estimator: chars/4");
  assert.match(result.report, /re-reads by file: policy\/core.md=1/);
  assert.match(result.report, /runs: 1/);
});

test("the evals tree is not a behaviour-check or category regression", () => {
  const result = evaluatePath(join(repoRoot, "evals"));
  assert.equal(result.exitCode, 0);
  assert.ok(result.runCount >= 11);
});

test("cursor-tools fixture counts re-reads, nested tool output, and dotnet test", () => {
  const result = evaluatePath(join(fixturesDir, "cursor-tools.jsonl"));
  assert.equal(result.exitCode, 0);
  assert.equal(result.runCount, 1);
  const run = result.runs[0];
  assert.equal(run.rereadCount, 1);
  assert.deepEqual(run.rereadCounts, { "kodaelus/core.md": 1 });
  assert.ok(run.tokens.reads > 0);
  assert.ok(run.tokens.search > 0);
  assert.ok(run.tokens.edits > 0);
  assert.ok(run.tokens["tool-output"] > 0);
  assert.ok(run.shares.reasoning < 1);
  assert.equal(run.checks.coreRead, "pass");
  assert.equal(run.checks.testBeforeEdit, "pass");
  assert.equal(run.checks.planBeforeEdit, "pass");
  assert.equal(run.checks.confidenceEvidence, "pass");
  assert.equal(run.categoryGate.status, "skip");
  assert.ok(run.largestOutputs.some((item) => item.label === "dotnet test"));
  assert.match(run.largestSearches[0].label, /glob_file_search/);
});

test("failing dotnet build before a product edit passes test-before-edit", () => {
  const lines = [
    JSON.stringify({
      role: "assistant",
      content: "## Plan\nBuild.\nConfidence: 80% | Evidence: src/App.cs:1",
    }),
    JSON.stringify({ tool: "read_file", tool_args: { target_file: "kodaelus/core.md" } }),
    JSON.stringify({
      tool: "run_terminal_cmd",
      tool_args: { command: "dotnet build" },
      exitCode: 1,
    }),
    JSON.stringify({ tool: "search_replace", tool_args: { path: "src/App.cs", new_string: "b" } }),
  ].join("\n");
  const { file } = tempJsonl("dotnet-build.jsonl", lines);
  const result = evaluatePath(file);
  assert.equal(result.runs[0].checks.testBeforeEdit, "pass");
  assert.equal(result.runs[0].checks.coreRead, "pass");
});

test("dotnet run before a product edit does not satisfy test-before-edit", () => {
  const lines = [
    JSON.stringify({
      role: "assistant",
      content: "## Plan\nRun.\nConfidence: 80% | Evidence: src/App.cs:1",
    }),
    JSON.stringify({ tool: "Read", path: "kodaelus/core.md", content: "abcd" }),
    JSON.stringify({ tool: "run_terminal_cmd", tool_args: { command: "dotnet run" }, exitCode: 1 }),
    JSON.stringify({ tool: "StrReplace", path: "src/App.cs", content: "b" }),
  ].join("\n");
  const { file } = tempJsonl("dotnet-run.jsonl", lines);
  const result = evaluatePath(file);
  assert.equal(result.runs[0].checks.testBeforeEdit, "fail");
  assert.equal(result.runs[0].checks.coreRead, "pass");
});

test("a string output field on a tool result contributes tokens", () => {
  const { file } = tempJsonl(
    "output-field.jsonl",
    JSON.stringify({ role: "tool", output: "x".repeat(40) }),
  );
  const result = evaluatePath(file);
  assert.ok(result.runs[0].tokens["tool-output"] > 0);
});

test("flat cursor rows credit each tool_result to its own tool category", () => {
  const big = (n) => "x".repeat(n);
  const lines = [
    { role: "assistant", thinking: big(400), text: big(40) },
    { role: "assistant", tool_calls: [{ tool_call_id: "a", tool_name: "read_file", tool_args: { target_file: "/w/src/A.js" } }] },
    { role: "tool", tool_name: "read_file", tool_args: { target_file: "/w/src/A.js" }, tool_result: { resultType: "readFileResult", value: { contents: big(200) } } },
    { role: "tool", tool_name: "read_file", tool_args: { target_file: "/w/src/A.js" }, tool_result: { resultType: "readFileResult", value: { contents: big(100) } } },
    { role: "tool", tool_name: "grep", tool_result: { resultType: "grepResult", value: { internal: { results: [{ resource: "src/A.js", results: [{ match: { previewText: big(120) } }] }] } } } },
    { role: "tool", tool_name: "run_terminal_cmd", tool_args: { command: "npm test" }, tool_result: { resultType: "runTerminalCommandV2Result", value: { output: `not ok 1\n${big(140)}`, exitCode: 1 } } },
    { role: "tool", tool_name: "search_replace", tool_result: { resultType: "editFileResult", value: { diff: { chunks: [{ diffString: `--- a/w/src/A.js\n+++ b/w/src/A.js\n${big(160)}` }] } } } },
  ].map((row) => JSON.stringify(row)).join("\n");
  const { file } = tempJsonl("cursor-flat.jsonl", lines);
  const run = evaluatePath(file).runs[0];
  assert.equal(run.rereadCount, 1);
  assert.deepEqual(run.rereadCounts, { "/w/src/A.js": 1 });
  assert.ok(run.tokens.reads >= 50, `reads ${run.tokens.reads}`);
  assert.ok(run.tokens["re-reads"] >= 25, `re-reads ${run.tokens["re-reads"]}`);
  assert.ok(run.tokens.search >= 30, `search ${run.tokens.search}`);
  assert.ok(run.tokens.edits >= 40, `edits ${run.tokens.edits}`);
  assert.ok(run.tokens.reasoning >= 110, `reasoning ${run.tokens.reasoning}`);
  assert.ok(run.tokens["tool-output"] >= 35, `tool-output ${run.tokens["tool-output"]}`);
  assert.equal(run.checks.testBeforeEdit, "pass");
});

test("tool_result.value.exitCode zero with a configured failure summary is a failure", () => {
  const lines = [
    { role: "tool", tool_name: "run_terminal_cmd", tool_args: { command: "make check" }, tool_result: { value: { output: "SUMMARY: 2 failed", exitCode: 0 } } },
    { role: "tool", tool_name: "search_replace", tool_result: { value: { diff: { chunks: [{ diffString: "--- a/lib/x.js\n+++ b/lib/x.js\n+y" }] } } } },
  ].map((row) => JSON.stringify(row)).join("\n");
  const { dir, file } = tempJsonl("cfg.jsonl", lines);
  writeFileSync(join(dir, "config.json"), JSON.stringify({ testCommands: ["(?:^|\\s)make check(?:\\s|$)"], failurePatterns: ["\\b[1-9]\\d* failed\\b"] }));
  const run = evaluatePath(file).runs[0];
  assert.equal(run.checks.testBeforeEdit, "pass");
});

test("expectLocal compares re-reads exactly and shares within two points, and skips a missing folder", () => {
  const missing = expectLocal(join(tmpdir(), "kodaelus-no-such-local-dir"));
  assert.equal(missing.exitCode, 0);
  assert.match(missing.report, /skipped/);

  const rows = [
    { role: "assistant", thinking: "x".repeat(400) },
    { role: "tool", tool_name: "read_file", tool_args: { target_file: "src/A.js" }, tool_result: { value: { contents: "x".repeat(200) } } },
    { role: "tool", tool_name: "read_file", tool_args: { target_file: "src/A.js" }, tool_result: { value: { contents: "x".repeat(200) } } },
  ].map((row) => JSON.stringify(row)).join("\n");
  const { dir } = tempJsonl("run.jsonl", rows);
  const expected = {
    rereads_per_file: { "src/A.js": 1 },
    shares: { reads: 0.25, "re-reads": 0.25, reasoning: 0.5, search: 0, edits: 0, "tool-output": 0 },
    behaviour_checks_expected: { coreRead: "fail" },
  };
  writeFileSync(join(dir, "run.expected.json"), JSON.stringify(expected));
  const ok = expectLocal(dir);
  assert.equal(ok.exitCode, 0, ok.report);

  expected.shares.reasoning = 0.45;
  expected.rereads_per_file = { "src/A.js": 2 };
  writeFileSync(join(dir, "run.expected.json"), JSON.stringify(expected));
  const bad = expectLocal(dir);
  assert.equal(bad.exitCode, 1);
  assert.match(bad.report, /reasoning/);
  assert.match(bad.report, /re-reads/);
});

test("a parent scan skips a local folder of private fixtures", () => {
  const { dir } = tempJsonl("top.jsonl", JSON.stringify({ role: "assistant", content: "hi" }));
  mkdirSync(join(dir, "local"));
  writeFileSync(join(dir, "local", "private.jsonl"), `${JSON.stringify({ role: "assistant", content: "x" })}\n`);
  assert.equal(evaluatePath(dir).runCount, 1);
});
