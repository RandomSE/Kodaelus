/**
 * Transcript token-budget eval.
 * One JSONL file is one run. Shares use every event's tokens.
 * Unique tokens count the first time a content hash is seen.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CATEGORIES = ["reads", "re-reads", "search", "edits", "reasoning", "tool-output"];
const DEFAULT_TEST_COMMANDS = [/(?:^|\s)(?:npm test|node --test|pytest|cargo test|go test)(?:\s|$)/];
const DEFAULT_FAILURE_PATTERNS = [/\bnot ok\b/, /\b[1-9]\d* (?:failed|failing)\b/i];
const RG_COMMAND = /(?:^|\s|[;&|])rg(?:\s|$)/;
const REPO_CONFIG = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "evals", "config.json");

/**
 * Eval config: built-in generic defaults, plus `testCommands` and `failurePatterns`
 * (regex source strings) from the repo `evals/config.json` and the nearest
 * `config.json` at or above the transcript's directory.
 * @param {string} file
 */
function loadConfig(file) {
  const testCommands = [...DEFAULT_TEST_COMMANDS];
  const failurePatterns = [...DEFAULT_FAILURE_PATTERNS];
  const sources = [REPO_CONFIG];
  let dir = dirname(resolve(file));
  for (;;) {
    const candidate = join(dir, "config.json");
    if (existsSync(candidate)) {
      sources.push(candidate);
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const source of new Set(sources.map((item) => resolve(item)))) {
    if (!existsSync(source)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(source, "utf8"));
    } catch {
      continue;
    }
    for (const text of Array.isArray(parsed.testCommands) ? parsed.testCommands : []) {
      testCommands.push(new RegExp(text));
    }
    for (const text of Array.isArray(parsed.failurePatterns) ? parsed.failurePatterns : []) {
      failurePatterns.push(new RegExp(text, "m"));
    }
  }
  return { testCommands, failurePatterns };
}

/**
 * @param {string} command
 * @param {{ testCommands: RegExp[] }} config
 */
function isTestCommand(command, config) {
  return config.testCommands.some((pattern) => pattern.test(command || ""));
}

/**
 * @param {string} target file or directory
 * @param {{ skipChildFixtures?: boolean, writeBaseline?: boolean }} [options]
 */
export function evaluatePath(target, options = {}) {
  const abs = resolve(target);
  if (!existsSync(abs)) {
    return {
      exitCode: 1,
      runCount: 0,
      runs: [],
      report: `missing path: ${target}\n`,
    };
  }

  const files = collectJsonl(abs, options.skipChildFixtures === true);
  if (files.length === 0) {
    const lines = [
      "runs: 0",
      "category gate: skipped (no transcript)",
      "malformed lines: 0",
    ];
    if (options.writeBaseline) {
      lines.push("not writing baseline.json");
    }
    return {
      exitCode: options.writeBaseline ? 1 : 0,
      runCount: 0,
      runs: [],
      report: `${lines.join("\n")}\n`,
    };
  }

  const runs = files.map((file) => evaluateFile(file));
  if (options.writeBaseline) {
    const byDir = new Map();
    for (const run of runs) {
      if (run.exitCode !== 0) continue;
      byDir.set(dirname(run.file), run.shares);
    }
    for (const [dir, shares] of byDir) {
      writeFileSync(join(dir, "baseline.json"), `${JSON.stringify({ shares }, null, 2)}\n`, "utf8");
    }
  }

  const exitCode = runs.some((run) => isRegression(run)) ? 1 : 0;
  const report = [`runs: ${runs.length}`, ...runs.map(formatRun)].join("\n\n");
  return {
    exitCode,
    runCount: runs.length,
    runs,
    report: `${report}\n`,
  };
}

const SHARE_TOLERANCE = 0.02;

/**
 * Compare each `<name>.jsonl` in a local folder with `<name>.expected.json`:
 * re-reads per file exactly, category shares within two points, and any listed behavior checks.
 * A missing folder is a clean skip (CI has no private fixtures).
 * @param {string} dir
 */
export function expectLocal(dir) {
  const abs = resolve(dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    return { exitCode: 0, report: `expect: skipped (no ${dir})\n` };
  }
  const lines = [];
  let failed = false;
  const files = readdirSync(abs).filter((name) => name.endsWith(".jsonl")).sort();
  for (const name of files) {
    const expectedFile = join(abs, name.replace(/\.jsonl$/, ".expected.json"));
    if (!existsSync(expectedFile)) {
      lines.push(`${name}: skipped (no ${basename(expectedFile)})`);
      continue;
    }
    const expected = JSON.parse(readFileSync(expectedFile, "utf8"));
    const run = evaluateFile(join(abs, name));
    const problems = [];
    const wantRereads = expected.rereads_per_file || {};
    const gotRereads = run.rereadCounts || {};
    for (const file of new Set([...Object.keys(wantRereads), ...Object.keys(gotRereads)])) {
      if ((wantRereads[file] || 0) !== (gotRereads[file] || 0)) {
        problems.push(`re-reads ${file}: expected ${wantRereads[file] || 0}, got ${gotRereads[file] || 0}`);
      }
    }
    for (const [key, want] of Object.entries(expected.shares || {})) {
      const got = run.shares[key] ?? 0;
      if (Math.abs(got - want) > SHARE_TOLERANCE) {
        problems.push(`${key} share: expected ${want.toFixed(4)}, got ${got.toFixed(4)}`);
      }
    }
    for (const [key, want] of Object.entries(expected.behaviour_checks_expected || {})) {
      if (run.checks[key] !== want) problems.push(`${key}: expected ${want}, got ${run.checks[key]}`);
    }
    if (problems.length > 0) failed = true;
    lines.push(`${name}: ${problems.length === 0 ? "ok" : `FAIL\n  ${problems.join("\n  ")}`}`);
  }
  if (files.length === 0) lines.push("expect: skipped (no transcripts)");
  return { exitCode: failed ? 1 : 0, report: `${lines.join("\n")}\n` };
}

/**
 * @param {string} abs
 * @param {boolean} skipChildFixtures
 * @returns {string[]}
 */
function collectJsonl(abs, skipChildFixtures) {
  const info = statSync(abs);
  if (info.isFile()) return [abs];
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const full = join(abs, entry.name);
    if (entry.isDirectory()) {
      if (skipChildFixtures && entry.name === "fixtures") continue;
      // Private real-transcript fixtures are checked only by expectLocal.
      if (entry.name === "local") continue;
      found.push(...collectJsonl(full, skipChildFixtures));
      continue;
    }
    if (entry.name.endsWith(".jsonl")) found.push(full);
  }
  return found.sort();
}

/**
 * @param {string} file
 */
function evaluateFile(file) {
  const text = readFileSync(file, "utf8");
  const parsed = parseJsonl(text);
  const tallied = tally(parsed.events);
  const unevaluable = parsed.malformed > 0;
  const checks = unevaluable
    ? {
        testBeforeEdit: "unevaluable",
        coreRead: "unevaluable",
        planBeforeEdit: "unevaluable",
        confidenceEvidence: "unevaluable",
      }
    : behaviorChecks(parsed.events, loadConfig(file));
  const categoryGate = categoryGateFor(file, tallied.shares);
  const exitCode =
    unevaluable ||
    categoryGate.status === "fail" ||
    Object.values(checks).some((status) => status === "fail")
      ? 1
      : 0;

  return {
    file,
    exitCode,
    checks,
    categoryGate,
    rereadCount: tallied.rereadCount,
    rereadCounts: tallied.rereadCounts,
    largestOutputs: tallied.largestOutputs,
    billed: tallied.billed,
    tokenLabel: tallied.tokenLabel,
    uniqueTokens: tallied.uniqueTokens,
    largestSearches: tallied.largestSearches,
    shares: tallied.shares,
    malformed: parsed.malformed,
    tokens: tallied.tokens,
  };
}

/**
 * @param {string} text
 */
function parseJsonl(text) {
  /** @type {object[]} */
  const events = [];
  let malformed = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        malformed += 1;
        continue;
      }
      events.push(...eventsFrom(value, line));
    } catch {
      malformed += 1;
    }
  }
  return { events: attachResults(events), malformed };
}

/**
 * Credit a separate tool-result event to the most recent tool call that has no result yet,
 * so its tokens count as that call's read, search, edit, or command output.
 * @param {object[]} events
 */
function attachResults(events) {
  let pending = null;
  for (const event of events) {
    if (event.tool) {
      pending = event.hasResult ? null : event;
      continue;
    }
    if (event.kind !== "tool-output" || !pending) continue;
    pending.content = event.content || pending.content;
    if (pending.exitCode === undefined) pending.exitCode = event.exitCode;
    if (!pending.path) pending.path = event.path || "";
    pending.hasResult = true;
    event.kind = "skip";
    pending = null;
  }
  return events;
}

/**
 * @param {object} obj
 * @param {string} rawLine
 */
function eventsFrom(obj, rawLine) {
  const usage = extractUsage(obj);
  /** @type {object[]} */
  const events = [];

  if (typeof obj.thinking === "string" && obj.thinking.length > 0) {
    events.push({ kind: "reasoning", content: obj.thinking, usage: null, raw: rawLine });
    if (typeof obj.text === "string" && obj.text.length > 0) {
      events.push({ kind: "reasoning", content: obj.text, usage: null, raw: rawLine });
    }
  }

  const blocks = Array.isArray(obj.content)
    ? obj.content
    : obj.message && Array.isArray(obj.message.content)
      ? obj.message.content
      : null;

  if (blocks) {
    events.push(...eventsFromBlocks({ ...obj, content: blocks }, rawLine, null));
  }

  const args = objectField(obj.tool_args) || objectField(obj.input) || objectField(obj.arguments);
  const tool = firstString(obj.tool, obj.toolName, obj.tool_name, blocks ? "" : obj.name);
  const alreadyHasTool = events.some((event) => event.tool);

  if (
    !blocks &&
    typeof obj.content === "string" &&
    obj.content.length > 0 &&
    !tool &&
    !args &&
    (obj.role === "assistant" || obj.kind === "reasoning")
  ) {
    events.push({ kind: "reasoning", content: obj.content, usage: null, raw: rawLine });
  }

  if (!alreadyHasTool && tool) {
    const input = args || {};
    const command = firstString(obj.command, input.command);
    const path = firstString(
      obj.path,
      obj.file_path,
      obj.filePath,
      input.path,
      input.file_path,
      input.target_file,
      input.target_directory,
    );
    const pattern = firstString(obj.pattern, input.pattern, input.glob_pattern);
    const explicit = blocks ? "" : stringContent(obj.content ?? obj.text ?? obj.output ?? obj.result ?? "");
    const hasResult = obj.tool_result !== undefined && obj.tool_result !== null;
    // A flat row carries the call and its result: credit the result to this tool.
    const resultText = hasResult ? resultTextFor(tool, obj.tool_result) : "";
    events.push({
      tool,
      path: path || (hasResult ? diffPath(obj.tool_result) : ""),
      command,
      pattern,
      content: resultText || explicit || payloadFrom(tool, { ...input, command, path, pattern }),
      exitCode: hasResult ? numericExit(obj.tool_result) ?? numericExit(obj) : numericExit(obj),
      hasResult,
      usage: null,
      raw: rawLine,
    });
  }

  if (obj.tool_result !== undefined && obj.tool_result !== null && !(!alreadyHasTool && tool)) {
    events.push({
      kind: "tool-output",
      content: resultTextFor("", obj.tool_result),
      path: diffPath(obj.tool_result),
      exitCode: numericExit(obj.tool_result) ?? numericExit(obj),
      command: "",
      usage: null,
      raw: rawLine,
    });
  }

  if (events.length === 0) {
    const content = stringContent(obj.content ?? obj.text ?? obj.output ?? obj.result ?? "");
    if (obj.role === "user") {
      events.push({ kind: "skip", content, usage: null, raw: rawLine });
    } else if (obj.role === "tool" || obj.type === "tool_result") {
      events.push({
        kind: "tool-output",
        content: toolResultText(obj) || content,
        exitCode: numericExit(obj),
        usage: null,
        raw: rawLine,
      });
    } else if (obj.role === "assistant" || obj.kind === "reasoning") {
      events.push({ kind: "reasoning", content, usage: null, raw: rawLine });
    } else {
      events.push({ kind: "skip", content, usage: null, raw: rawLine });
    }
  }

  if (usage && events.length > 0) {
    const carrier = events.find((event) => event.kind !== "skip") || events[0];
    carrier.usage = usage;
  }
  return events;
}

/**
 * @param {object} obj
 * @param {string} rawLine
 * @param {{ tokens: number, field: string } | null} usage
 */
function eventsFromBlocks(obj, rawLine, usage) {
  /** @type {object[]} */
  const events = [];
  /** @type {string[]} */
  const texts = [];
  for (const block of obj.content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "tool_use" || block.type === "tool_call") {
      const input = block.input && typeof block.input === "object" ? block.input : {};
      const tool = firstString(block.name, block.tool);
      const command = firstString(input.command);
      const path = firstString(input.path, input.file_path, input.target_file, input.target_directory);
      const pattern = firstString(input.pattern, input.glob_pattern);
      events.push({
        tool,
        path,
        command,
        pattern,
        content: payloadFrom(tool, { ...input, command, path, pattern }),
        exitCode: numericExit(input),
        usage: null,
        raw: rawLine,
      });
      continue;
    }
    if (block.type === "tool_result") {
      events.push({
        kind: "tool-output",
        content: toolResultText(block),
        exitCode: numericExit(block),
        command: "",
        usage: null,
        raw: rawLine,
      });
      continue;
    }
    if (typeof block.text === "string") texts.push(block.text);
  }
  if (texts.length > 0 && obj.role !== "user") {
    events.unshift({
      kind: "reasoning",
      content: texts.join("\n"),
      usage: null,
      raw: rawLine,
    });
  }
  if (usage && events.length > 0) events[0].usage = usage;
  return events;
}

/**
 * @param {object[]} events
 */
function tally(events) {
  const tokens = Object.fromEntries(CATEGORIES.map((key) => [key, 0]));
  const seenHash = new Set();
  const readPaths = new Set();
  /** @type {{ label: string, tokens: number }[]} */
  const searches = [];
  /** @type {{ label: string, tokens: number }[]} */
  const outputs = [];
  /** @type {Record<string, number>} */
  const rereadCounts = {};
  const fields = new Set();
  let sawEstimate = false;
  let billedSum = 0;
  let sawUsage = false;
  let uniqueTokens = 0;
  let rereadCount = 0;

  for (const event of events) {
    const kind = classify(event, readPaths);
    if (!kind) continue;

    const payload = typeof event.content === "string" ? event.content : "";
    let amount = 0;
    if (event.usage) {
      amount = event.usage.tokens;
      fields.add(event.usage.field);
      billedSum += event.usage.tokens;
      sawUsage = true;
    } else {
      amount = estimateTokens(payload);
      sawEstimate = true;
    }

    const hash = createHash("sha256").update(String(payload)).digest("hex");
    if (!seenHash.has(hash)) {
      seenHash.add(hash);
      uniqueTokens += amount;
    }

    if (kind.category === "re-reads") {
      rereadCount += 1;
      const label = kind.label || "(unknown)";
      rereadCounts[label] = (rereadCounts[label] || 0) + 1;
    }
    tokens[kind.category] += amount;
    if (kind.category === "search") {
      searches.push({ label: kind.label, tokens: amount });
    }
    if (kind.category === "tool-output" && amount > 0) {
      outputs.push({ label: kind.label, tokens: amount });
    }
  }

  searches.sort((a, b) => b.tokens - a.tokens || a.label.localeCompare(b.label));
  outputs.sort((a, b) => b.tokens - a.tokens || a.label.localeCompare(b.label));
  const total = CATEGORIES.reduce((sum, key) => sum + tokens[key], 0);
  const shares = {};
  for (const key of CATEGORIES) {
    shares[key] = total === 0 ? 0 : tokens[key] / total;
  }

  let tokenLabel = "estimator: chars/4";
  if (fields.size === 1 && !sawEstimate) {
    tokenLabel = [...fields][0];
  } else if (fields.size > 0) {
    const names = [...fields].join(", ");
    tokenLabel = sawEstimate ? `${names} + estimator: chars/4` : names;
  }

  return {
    tokens,
    shares,
    rereadCount,
    rereadCounts,
    uniqueTokens,
    largestSearches: searches,
    largestOutputs: outputs,
    billed: sawUsage ? billedSum : null,
    tokenLabel,
  };
}

/**
 * @param {object} event
 * @param {Set<string>} readPaths
 */
function classify(event, readPaths) {
  if (event.kind === "skip") return null;
  if (event.kind === "tool-output") {
    return { category: "tool-output", label: outputLabel(event) };
  }
  const tool = event.tool || "";
  if (isReadTool(tool)) {
    const path = normalizePath(event.path || "");
    if (path && readPaths.has(path)) {
      return { category: "re-reads", label: path };
    }
    if (path) readPaths.add(path);
    return { category: "reads", label: path };
  }
  if (isSearch(tool, event.command || "")) {
    return { category: "search", label: searchLabel(event) };
  }
  if (isEditTool(tool)) {
    return { category: "edits", label: event.path || tool };
  }
  if (event.kind === "reasoning") {
    return { category: "reasoning", label: "assistant" };
  }
  if (isShellTool(tool)) {
    return { category: "tool-output", label: outputLabel(event) };
  }
  return null;
}

/**
 * @param {object[]} events
 */
function behaviorChecks(events, config = loadConfig(REPO_CONFIG)) {
  let seenRead = false;
  let sawCore = false;
  let seenTest = false;
  let seenFailedTest = false;
  let failedBeforeProduct = false;
  let seenProduct = false;
  let seenEdit = false;
  let sawPlan = false;
  let planBeforeEdit = false;
  let confidenceSeen = 0;
  let confidenceBad = 0;

  for (const event of events) {
    const text = event.content || "";
    if (event.kind === "reasoning" && hasPlanMarker(text)) sawPlan = true;
    const confidence = scanConfidence(text);
    confidenceSeen += confidence.seen;
    confidenceBad += confidence.bad;

    if (isReadTool(event.tool || "")) {
      seenRead = true;
      if (isCorePath(event.path || "")) sawCore = true;
    }

    if (isTestCommand(event.command || "", config)) {
      seenTest = true;
      if (isFailure(event, config) && !seenProduct) {
        seenFailedTest = true;
        failedBeforeProduct = true;
      }
    }

    if (isEditTool(event.tool || "")) {
      if (!seenEdit) planBeforeEdit = sawPlan;
      seenEdit = true;
      if (!isTestPath(event.path || "")) seenProduct = true;
    }
  }

  let testBeforeEdit = "skip";
  if (seenTest || seenProduct) {
    if (seenProduct) testBeforeEdit = failedBeforeProduct ? "pass" : "fail";
    else testBeforeEdit = seenFailedTest ? "pass" : "fail";
  }

  return {
    testBeforeEdit,
    coreRead: !seenRead ? "skip" : sawCore ? "pass" : "fail",
    planBeforeEdit: !seenEdit ? "skip" : planBeforeEdit ? "pass" : "fail",
    confidenceEvidence: confidenceSeen === 0 ? "skip" : confidenceBad === 0 ? "pass" : "fail",
  };
}

/**
 * @param {string} file
 * @param {Record<string, number>} actual
 */
function categoryGateFor(file, actual) {
  const baselinePath = join(dirname(file), "baseline.json");
  if (!existsSync(baselinePath)) {
    return { status: "skip", detail: "no baseline.json" };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch {
    return { status: "fail", detail: "baseline.json is not valid JSON" };
  }
  const source =
    parsed && typeof parsed === "object" && parsed.shares && typeof parsed.shares === "object"
      ? parsed.shares
      : parsed;
  const keys = CATEGORIES.filter((key) => source && typeof source[key] === "number");
  if (keys.length === 0) {
    return { status: "fail", detail: "baseline.json has no numeric shares" };
  }
  /** @type {string[]} */
  const fails = [];
  for (const key of keys) {
    const limit = source[key] * 1.1;
    if (actual[key] > limit) {
      fails.push(
        `${key} share ${actual[key].toFixed(4)} > baseline ${source[key].toFixed(4)} * 1.10`,
      );
    }
  }
  if (fails.length > 0) {
    return { status: "fail", detail: fails.join("; ") };
  }
  return { status: "pass", detail: `compared: ${keys.join(", ")}` };
}

/**
 * @param {object} run
 */
function formatRun(run) {
  const shareText = CATEGORIES.map((key) => `${key}=${run.shares[key].toFixed(4)}`).join(" ");
  const billed = run.billed === null ? "unavailable" : String(run.billed);
  const gate =
    run.categoryGate.status === "skip"
      ? `category gate: skipped (${run.categoryGate.detail})`
      : `category gate: ${run.categoryGate.status} (${run.categoryGate.detail})`;
  const files = Object.keys(run.rereadCounts || {}).sort();
  const byFile =
    files.length === 0
      ? "none"
      : files.map((file) => `${file}=${run.rereadCounts[file]}`).join("; ");
  return [
    `file: ${basename(run.file)}`,
    `token label: ${run.tokenLabel}`,
    `billed: ${billed}`,
    `unique tokens: ${run.uniqueTokens}`,
    `re-read count: ${run.rereadCount}`,
    `re-reads by file: ${byFile}`,
    `shares: ${shareText}`,
    `largest searches: ${formatList(run.largestSearches)}`,
    `largest outputs: ${formatList(run.largestOutputs)}`,
    `checks: test-before-edit=${run.checks.testBeforeEdit} core-read=${run.checks.coreRead} plan-before-edit=${run.checks.planBeforeEdit} confidence-evidence=${run.checks.confidenceEvidence}`,
    gate,
    `malformed lines: ${run.malformed}`,
  ].join("\n");
}

/**
 * @param {{ label: string, tokens: number }[]} items
 */
function formatList(items) {
  if (!items || items.length === 0) return "none";
  return items
    .slice(0, 5)
    .map((item) => `${item.label} (${item.tokens})`)
    .join("; ");
}

/**
 * A negative fixture is supposed to fail its checks.
 * A regression is a positive file that fails, or a negative file that passes.
 * @param {{ file: string, exitCode: number }} run
 */
function isRegression(run) {
  const negative = expectsNegative(run.file);
  const failed = run.exitCode !== 0;
  return negative ? !failed : failed;
}

/**
 * @param {string} file
 */
function expectsNegative(file) {
  const name = basename(file);
  return name === "bad.jsonl" || name.endsWith(".negative.jsonl");
}

/**
 * @param {object} obj
 */
function extractUsage(obj) {
  /** @type {object[]} */
  const sources = [];
  if (obj.usage && typeof obj.usage === "object") sources.push(obj.usage);
  sources.push(obj);
  for (const source of sources) {
    if (typeof source.total_tokens === "number") {
      return { tokens: source.total_tokens, field: "total_tokens" };
    }
  }
  for (const source of sources) {
    const pair = usagePair(source, ["input_tokens", "output_tokens"]);
    if (pair) return pair;
  }
  for (const source of sources) {
    const pair = usagePair(source, ["prompt_tokens", "completion_tokens"]);
    if (pair) return pair;
  }
  return null;
}

/**
 * @param {object} source
 * @param {string[]} keys
 */
function usagePair(source, keys) {
  const present = keys.filter((key) => typeof source[key] === "number");
  if (present.length === 0) return null;
  const tokens = present.reduce((sum, key) => sum + source[key], 0);
  return { tokens, field: present.join("+") };
}

/**
 * @param {string} text
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * @param {string} name
 */
function normTool(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * @param {string} name
 */
function isReadTool(name) {
  const tool = normTool(name);
  return tool === "read" || tool === "readfile";
}

/**
 * @param {string} name
 */
function isEditTool(name) {
  const tool = normTool(name);
  return (
    tool === "write" || tool === "strreplace" || tool === "searchreplace" || tool === "applypatch"
  );
}

/**
 * @param {string} name
 */
function isShellTool(name) {
  const tool = normTool(name);
  return tool === "shell" || tool === "runterminalcmd";
}

/**
 * @param {string} name
 * @param {string} command
 */
function isSearch(name, command) {
  const tool = normTool(name);
  if (
    tool === "grep" ||
    tool === "glob" ||
    tool === "globfilesearch" ||
    tool === "search" ||
    tool === "ripgrep" ||
    tool === "rg"
  ) {
    return true;
  }
  return isShellTool(name) && RG_COMMAND.test(command);
}

/**
 * @param {object} event
 */
function searchLabel(event) {
  if (event.pattern) {
    const path = event.path ? ` ${event.path}` : "";
    return `${event.tool} ${event.pattern}${path}`.trim();
  }
  if (event.command) return event.command;
  return event.tool || "search";
}

/**
 * @param {string} path
 */
function normalizePath(path) {
  return String(path || "").replace(/\\/g, "/").trim();
}

/**
 * @param {string} path
 */
function isCorePath(path) {
  const normalized = normalizePath(path);
  return normalized === "core.md" || normalized.endsWith("/core.md");
}

/**
 * @param {string} path
 */
function isTestPath(path) {
  const normalized = normalizePath(path);
  return /\.test\.|\.spec\.|_test\.|(^|\/)tests\//.test(normalized);
}

/**
 * @param {object} event
 */
function isFailure(event, config) {
  const text = event.content || "";
  if (typeof event.exitCode === "number" && event.exitCode !== 0) return true;
  if (config && config.failurePatterns.some((pattern) => pattern.test(text))) return true;
  if (typeof event.exitCode === "number") return false;
  return /\b(fail|failed|not ok)\b/i.test(text);
}

/**
 * @param {string} text
 */
function hasPlanMarker(text) {
  return String(text || "")
    .split(/\n/)
    .some((line) => {
      const trimmed = line.trim();
      return /^##\s+Plan\b/.test(trimmed) || /^Plan\b/.test(trimmed) || /^\*\*Plan\b/.test(trimmed);
    });
}

/**
 * @param {string} text
 */
function scanConfidence(text) {
  let seen = 0;
  let bad = 0;
  for (const line of String(text || "").split(/\n/)) {
    if (!/Confidence:\s*\d{1,3}%/.test(line)) continue;
    seen += 1;
    if (!line.includes("Evidence:")) bad += 1;
  }
  return { seen, bad };
}

/**
 * @param {object} obj
 */
function numericExit(obj) {
  if (!obj || typeof obj !== "object") return undefined;
  const nested = objectField(obj.value);
  const value = obj.exitCode ?? obj.exit_code ?? nested?.exitCode ?? nested?.exit_code;
  return typeof value === "number" ? value : undefined;
}

/**
 * Text a tool result contributes: file contents, diff hunks, command output,
 * or, for searches with structured matches, the serialized result value.
 * @param {string} tool
 * @param {unknown} result
 */
function resultTextFor(tool, result) {
  const diff = diffText(result);
  if (diff) return diff;
  const text = toolResultText(result);
  if (text) return text;
  const obj = objectField(result);
  if (!obj) return "";
  const value = obj.value === undefined ? obj : obj.value;
  return value && typeof value === "object" ? JSON.stringify(value) : "";
}

/**
 * @param {unknown} result
 */
function diffChunks(result) {
  const value = objectField(objectField(result)?.value) || objectField(result);
  const chunks = value?.diff?.chunks;
  return Array.isArray(chunks) ? chunks.filter((chunk) => typeof chunk?.diffString === "string") : [];
}

/**
 * @param {unknown} result
 */
function diffText(result) {
  return diffChunks(result)
    .map((chunk) => chunk.diffString)
    .join("\n");
}

/**
 * Edited path from a unified diff header (`+++ b/<path>`), when the call has no path argument.
 * @param {unknown} result
 */
function diffPath(result) {
  for (const chunk of diffChunks(result)) {
    const match = /^\+\+\+ (?:b\/)?(\S+)/m.exec(chunk.diffString);
    if (match && match[1] !== "/dev/null") return match[1];
  }
  return "";
}

/**
 * @param {string} tool
 * @param {object} input
 */
function payloadFrom(tool, input) {
  if (isEditTool(tool)) {
    return firstString(input.new_string, input.contents, input.content, input.replacement, input.path);
  }
  if (isReadTool(tool)) return firstString(input.content, input.path);
  if (isSearch(tool, input.command || "")) {
    return firstString(input.content, input.pattern, input.command, input.path);
  }
  if (isShellTool(tool)) return firstString(input.content, input.command);
  return firstString(input.content, input.command, input.pattern, input.path);
}

/**
 * @param {object} event
 */
function outputLabel(event) {
  const text = String(event.content || "");
  if (!text) return "tool-result";
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}

/**
 * @param {unknown} value
 */
function objectField(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return null;
}

/**
 * @param {unknown} value
 */
function toolResultText(value) {
  if (typeof value === "string") return value;
  const obj = objectField(value);
  if (!obj) return "";
  return textFromFields(obj) || textFromNestedValue(obj) || scalarOrOneLevel(obj.result);
}

/**
 * @param {object} obj
 */
function textFromFields(obj) {
  for (const key of ["content", "contents", "output", "text"]) {
    const found = scalarOrOneLevel(obj[key]);
    if (found) return found;
  }
  return "";
}

/**
 * @param {object} obj
 */
function textFromNestedValue(obj) {
  const nested = objectField(obj.value);
  if (!nested) return "";
  const deeper = objectField(nested.value);
  return textFromFields(nested) || (deeper ? textFromFields(deeper) : "");
}

/**
 * A string, or one object level of content, output, or text.
 * @param {unknown} value
 */
function scalarOrOneLevel(value) {
  if (typeof value === "string" && value.length > 0) return value;
  const obj = objectField(value);
  if (!obj) return "";
  return firstString(obj.content, obj.output, obj.text, obj.result);
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

/**
 * @param {unknown} value
 */
function stringContent(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block.text === "string") return block.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
