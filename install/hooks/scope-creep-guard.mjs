#!/usr/bin/env node
/**
 * User-level Cursor hook: scope creep guardrail + plan estimate parsing +
 * Bug write allowlist + Suggest artifact carve-out + Prepare fix-cycle cap.
 * Events: preToolUse, beforeSubmitPrompt, afterAgentResponse, stop
 */
import { parseFileCountFromText } from "./lib/plan-estimate.mjs";
import { resolveProjectRoot } from "./lib/entry-point-guard.mjs";
import { normalizeProjectPath } from "./lib/deletion-guard.mjs";
import { extractPatchText, extractPatchTouchedPaths } from "./lib/patch-guard.mjs";
import {
  isBugDiagnosticWritePath,
  isProductEditPath,
  isSuggestArtifactPath,
  isWriteOrStrReplaceTool,
  isWriteStrReplaceOrPatchTool,
} from "./lib/path-allowlist.mjs";
import {
  approveScope,
  getScopeStatus,
  getSessionMetadata,
  getSessionMode,
  isBugInvestigationMode,
  isMutatingMode,
  isPrepareFixCycleCapped,
  isReadOnlyMode,
  isScopeApprovePrompt,
  isSessionActive,
  recordTouchedFile,
  setPlanFileEstimate,
} from "./lib/session-store.mjs";
import {
  denyBugModeWrite,
  denyPrepareFixCycle,
  denyReadOnlyTool,
  denySuggestArtifactWrite,
  isMutatingToolName,
} from "./lib/mode-guard.mjs";

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
 * @param {{ permission: string, user_message: string, agent_message: string }} denial
 */
function denyWith(denial) {
  process.stdout.write(`${JSON.stringify(denial)}\n`);
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

/**
 * @param {unknown} input
 * @param {string[]} editPaths
 * @returns {string[]}
 */
function toRelativePaths(input, editPaths) {
  if (editPaths.length === 0) return [];
  const projectRoot = resolveProjectRoot(input, editPaths[0]);
  /** @type {string[]} */
  const rels = [];
  for (const editPath of editPaths) {
    try {
      rels.push(normalizeProjectPath(projectRoot, editPath));
    } catch {
      // Skip paths outside project root.
    }
  }
  return rels;
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
    const editPaths = collectEditPaths(input);
    const relPaths = toRelativePaths(input, editPaths);

    // Suggest: allow Write/StrReplace only under .kodaelus/suggestions/**
    if (mode === "suggest" && isMutatingToolName(toolName)) {
      if (isWriteOrStrReplaceTool(toolName) && relPaths.length > 0) {
        const blocked = relPaths.find((rel) => !isSuggestArtifactPath(rel));
        if (blocked) {
          denyWith(denySuggestArtifactWrite(blocked));
        }
        allowTool();
      }
      denyWith(denyReadOnlyTool(mode));
    }

    if (isReadOnlyMode(mode) && isMutatingToolName(toolName)) {
      denyWith(denyReadOnlyTool(mode));
    }

    // Bug Investigation: diagnostic write allowlist
    if (isBugInvestigationMode(mode) && isWriteStrReplaceOrPatchTool(toolName)) {
      if (relPaths.length === 0) {
        allowTool();
      }
      const blocked = relPaths.find((rel) => !isBugDiagnosticWritePath(rel));
      if (blocked) {
        denyWith(denyBugModeWrite(blocked));
      }
      allowTool();
    }

    // Prepare fix-cycle cap: deny product edits after 3 fix-rerun cycles
    if (mode === "prepare" && isWriteStrReplaceOrPatchTool(toolName)) {
      if (isPrepareFixCycleCapped(conversationId)) {
        const meta = getSessionMetadata(conversationId);
        const blocked = relPaths.find((rel) => isProductEditPath(rel));
        if (blocked) {
          denyWith(denyPrepareFixCycle(blocked, meta?.prepareFixCycleCount ?? 3));
        }
      }
    }

    if (!isMutatingMode(mode)) {
      allowTool();
    }

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
