/**
 * Transcript token-budget eval.
 * One JSONL file is one run. Shares use every event's tokens.
 * Unique tokens count the first time a content hash is seen.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const CATEGORIES = ["reads", "re-reads", "search", "edits", "reasoning", "tool-output"];
const TEST_COMMAND_PATTERNS = [
  /(?:^|\s)(?:npm test|node --test|pytest|cargo test|go test)(?:\s|$)/,
  /(?:^|\s)dotnet (?:test|build)(?:\s|$)/,
];
const RG_COMMAND = /(?:^|\s|[;&|])rg(?:\s|$)/;

/**
 * @param {string} command
 */
function isTestCommand(command) {
  return TEST_COMMAND_PATTERNS.some((pattern) => pattern.test(command || ""));
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
    : behaviorChecks(parsed.events);
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
  return { events, malformed };
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
    events.push({
      tool,
      path,
      command,
      pattern,
      content: explicit || payloadFrom(tool, { ...input, command, path, pattern }),
      exitCode: numericExit(obj),
      usage: null,
      raw: rawLine,
    });
  }

  if (obj.tool_result !== undefined && obj.tool_result !== null) {
    events.push({
      kind: "tool-output",
      content: toolResultText(obj.tool_result),
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
function behaviorChecks(events) {
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

    if (isTestCommand(event.command || "")) {
      seenTest = true;
      if (isFailure(event) && !seenProduct) {
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
function isFailure(event) {
  if (typeof event.exitCode === "number") return event.exitCode !== 0;
  return /\b(fail|failed|not ok)\b/i.test(event.content || "");
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
  const value = obj.exitCode ?? obj.exit_code;
  return typeof value === "number" ? value : undefined;
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
  for (const key of ["content", "output", "text"]) {
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
