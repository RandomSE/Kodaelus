#!/usr/bin/env node
/**
 * User-level Cursor hook: scope creep guardrail + plan estimate parsing.
 * Events: preToolUse, beforeSubmitPrompt, afterAgentResponse, stop
 */
import { parseFileCountFromText } from "./lib/plan-estimate.mjs";
import { resolveProjectRoot } from "./lib/entry-point-guard.mjs";
import { normalizeProjectPath } from "./lib/deletion-guard.mjs";
import { extractPatchText, extractPatchTouchedPaths } from "./lib/patch-guard.mjs";
import {
  approveScope,
  getScopeStatus,
  getSessionMode,
  isMutatingMode,
  isReadOnlyMode,
  isScopeApprovePrompt,
  isSessionActive,
  recordTouchedFile,
  setPlanFileEstimate,
} from "./lib/session-store.mjs";
import { denyReadOnlyTool, isMutatingToolName } from "./lib/mode-guard.mjs";

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function allowEmpty() {
  process.stdout.write("{}\n");
  process.exit(0);
}

function allowTool() {
  process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");
  process.exit(0);
}

/**
 * @param {number} count
 * @param {number} limit
 */
function denyScope(count, limit) {
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      user_message:
        `Kodaelus scope guardrail: ${count} files touched (limit ${limit}). ` +
        "Summarize the scope delta and reply **scope approved** to continue.",
      agent_message:
        `Scope creep guardrail triggered (${count}/${limit} files). Pause, summarize delta, ask user to reply "scope approved".`,
    }) + "\n",
  );
  process.exit(0);
}

/**
 * @param {unknown} input
 * @returns {string[]}
 */
function collectEditPaths(input) {
  if (!input || typeof input !== "object") return [];
  const record = /** @type {Record<string, unknown>} */ (input);
  const toolName = `${record.tool_name ?? record.toolName ?? ""}`;
  const toolInput =
    record.tool_input ??
    record.toolInput ??
    record.arguments ??
    record.input ??
    record;

  const paths = [];
  if (toolInput && typeof toolInput === "object") {
    const ti = /** @type {Record<string, unknown>} */ (toolInput);
    if (typeof ti.path === "string" && ti.path.trim()) {
      paths.push(ti.path.trim());
    }
  }

  const patch = extractPatchText(input);
  if (patch) {
    paths.push(...extractPatchTouchedPaths(patch));
  }

  if (toolName.includes("MCP") && toolInput && typeof toolInput === "object") {
    const ti = /** @type {Record<string, unknown>} */ (toolInput);
    if (typeof ti.path === "string" && ti.path.trim()) {
      paths.push(ti.path.trim());
    }
  }

  return [...new Set(paths)];
}

const input = await readInput();
const event = `${input.hook_event_name ?? ""}`;
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;

try {
  if (!isSessionActive(conversationId)) {
    if (event === "preToolUse") allowTool();
    allowEmpty();
  }

  const mode = getSessionMode(conversationId) ?? "main";

  if (event === "beforeSubmitPrompt") {
    const prompt = `${input.prompt ?? ""}`;
    if (isScopeApprovePrompt(prompt)) {
      approveScope(conversationId);
    }
    allowEmpty();
  }

  if (event === "afterAgentResponse" || event === "stop") {
    const text = `${input.response ?? input.text ?? input.agent_response ?? ""}`;
    if (isMutatingMode(mode)) {
      const estimate = parseFileCountFromText(text);
      if (estimate != null) {
        setPlanFileEstimate(conversationId, estimate);
      }
    }
    allowEmpty();
  }

  if (event === "preToolUse") {
    const toolName = `${input.tool_name ?? input.toolName ?? ""}`;

    if (isReadOnlyMode(mode) && isMutatingToolName(toolName)) {
      process.stdout.write(`${JSON.stringify(denyReadOnlyTool(mode))}\n`);
      process.exit(0);
    }

    if (!isMutatingMode(mode)) {
      allowTool();
    }

    const editPaths = collectEditPaths(input);
    if (editPaths.length === 0) {
      allowTool();
    }

    const projectRoot = resolveProjectRoot(input, editPaths[0]);
    for (const editPath of editPaths) {
      try {
        const rel = normalizeProjectPath(projectRoot, editPath);
        recordTouchedFile(conversationId, rel);
      } catch {
        // Skip paths outside project root.
      }
    }

    const { exceeded, count, limit } = getScopeStatus(conversationId);
    if (exceeded) {
      denyScope(count, limit);
    }
  }
} catch {
  if (event === "preToolUse") allowTool();
  allowEmpty();
}

if (event === "preToolUse") allowTool();
allowEmpty();
