#!/usr/bin/env node
/**
 * User-level Cursor hook: scope creep guardrail + plan estimate parsing +
 * Bug write allowlist + Suggest artifact carve-out + Prepare fix-cycle cap.
 * Events: preToolUse, beforeSubmitPrompt, afterAgentResponse, stop
 */
import { fileURLToPath } from "node:url";
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
  resolveSuggestWritePath,
  suggestionsPathTail,
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
  isShipCiRepairCapped,
  recordShipCiRepairEdit,
  isScopeApprovePrompt,
  isSessionActive,
  recordTouchedFile,
  setPlanFileEstimate,
} from "./lib/session-store.mjs";
import {
  denyBugModeWrite,
  denyPlanFirst,
  denyPrepareFixCycle,
  denyReadOnlyTool,
  denyShipCiRepair,
  denySuggestArtifactWrite,
  isMutatingToolName,
} from "./lib/mode-guard.mjs";
import { isCloudOrHeadlessRuntime } from "./lib/cloud-runtime.mjs";

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

const EDIT_PATH_KEYS = [
  "path",
  "file_path",
  "filePath",
  "target_file",
  "targetFile",
  "uri",
  "notebook_path",
];

/**
 * Strip file:// and Windows \\?\ prefixes so OneDrive paths can resolve.
 * @param {string} value
 * @returns {string}
 */
function stripPathPrefix(value) {
  let text = `${value ?? ""}`.trim();
  if (/^file:\/\//i.test(text)) {
    try {
      text = fileURLToPath(text);
    } catch {
      text = text.replace(/^file:\/\/\/?/i, "");
    }
  }
  if (text.startsWith("\\\\?\\")) {
    text = text.slice(4);
  }
  return text;
}

/**
 * @param {string[]} paths
 * @param {unknown} source
 */
function pushEditPathFields(paths, source) {
  if (!source || typeof source !== "object") return;
  const record = /** @type {Record<string, unknown>} */ (source);
  for (const key of EDIT_PATH_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      paths.push(stripPathPrefix(value));
    }
  }
}

/**
 * When root resolution fails, keep a suggestions suffix if the raw path has one.
 * @param {string} editPath
 * @returns {string | null}
 */
function suggestionsTail(editPath) {
  return suggestionsPathTail(editPath);
}

/**
 * @param {unknown} input
 * @returns {string[]}
 */
function collectEditPaths(input) {
  if (!input || typeof input !== "object") return [];
  const record = /** @type {Record<string, unknown>} */ (input);
  const toolInput =
    record.tool_input ??
    record.toolInput ??
    record.arguments ??
    record.input ??
    record;

  const paths = [];
  pushEditPathFields(paths, toolInput);
  if (toolInput !== record) {
    pushEditPathFields(paths, record);
  }

  const patch = extractPatchText(input);
  if (patch) {
    paths.push(...extractPatchTouchedPaths(patch).map((item) => stripPathPrefix(item)));
  }

  return [...new Set(paths)];
}

/**
 * @param {unknown} input
 * @param {string[]} editPaths
 * @returns {string[]}
 */
/**
 * Root resolution can collapse an out-of-workspace suggestions path to a bare
 * filename. Keep the suggestions suffix in that case. A real relative path that
 * already contains the tree (for example evil/.kodaelus/suggestions) stays as-is.
 * @param {string} rel
 * @param {string} raw
 * @returns {string}
 */
function preferSuggestionsTail(rel, raw) {
  const tail = suggestionsTail(raw);
  if (!tail || !isSuggestArtifactPath(tail)) return rel;
  const normalizedRel = `${rel ?? ""}`.replace(/\\/g, "/");
  if (normalizedRel.includes(".kodaelus/suggestions")) return rel;
  if (tail === normalizedRel || tail.endsWith(`/${normalizedRel}`)) return tail;
  return rel;
}

function toRelativePaths(input, editPaths) {
  if (editPaths.length === 0) return [];
  const projectRoot = resolveProjectRoot(input, editPaths[0]);
  /** @type {string[]} */
  const rels = [];
  for (const editPath of editPaths) {
    const stripped = stripPathPrefix(editPath);
    try {
      rels.push(preferSuggestionsTail(normalizeProjectPath(projectRoot, stripped), stripped));
    } catch {
      const tail = suggestionsTail(stripped);
      if (tail) rels.push(tail);
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

    // Suggest: Write/StrReplace only under .kodaelus/suggestions/**
    // Empty relPaths must not use the generic read-only deny (that implies Write is impossible).
    if (mode === "suggest" && isMutatingToolName(toolName)) {
      if (isWriteOrStrReplaceTool(toolName)) {
        let rels = relPaths;
        if (rels.length === 0) {
          const tail = suggestionsTail(JSON.stringify(input));
          if (tail && isSuggestArtifactPath(tail)) {
            allowTool();
          }
          denyWith(denySuggestArtifactWrite(editPaths[0] || "(unresolved path)"));
        }
        const blocked = rels.find((rel) => !isSuggestArtifactPath(rel));
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
    if ((mode === "prepare" || mode === "ship") && isWriteStrReplaceOrPatchTool(toolName)) {
      if (isPrepareFixCycleCapped(conversationId)) {
        const meta = getSessionMetadata(conversationId);
        const blocked = relPaths.find((rel) => isProductEditPath(rel));
        if (blocked) {
          denyWith(denyPrepareFixCycle(blocked, meta?.prepareFixCycleCount ?? 3));
        }
      }
    }

    // Ship CI repair cap: 3 product fixes after a red check, then ship ci continue
    if (mode === "ship" && isWriteStrReplaceOrPatchTool(toolName)) {
      const product = relPaths.find((rel) => isProductEditPath(rel));
      if (product && isShipCiRepairCapped(conversationId)) {
        const meta = getSessionMetadata(conversationId);
        denyWith(denyShipCiRepair(product, meta?.shipCiRepairCount ?? 3));
      }
      if (product) recordShipCiRepairEdit(conversationId);
    }

    if (!isMutatingMode(mode)) {
      allowTool();
    }

    if (editPaths.length === 0) {
      allowTool();
    }

    if (
      mode === "main" &&
      isCloudOrHeadlessRuntime() &&
      isMutatingToolName(toolName)
    ) {
      const meta = getSessionMetadata(conversationId);
      if (meta && meta.planFileEstimate == null) {
        denyWith(denyPlanFirst());
      }
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
