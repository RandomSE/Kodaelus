#!/usr/bin/env node
/**
 * User-level Cursor hook: TDD red-phase / write-order for Main (not Mode Lite).
 * Events: preToolUse (deny product impl before a failing test run),
 *         stop (follow-up when first test command was already green).
 */
import { resolveProjectRoot } from "./lib/entry-point-guard.mjs";
import { normalizeProjectPath } from "./lib/deletion-guard.mjs";
import { extractPatchText, extractPatchTouchedPaths } from "./lib/patch-guard.mjs";
import { isWriteStrReplaceOrPatchTool } from "./lib/path-allowlist.mjs";
import {
  buildTddRedPhaseFollowup,
  denyTddRedPhase,
  shouldDenyProductWriteForTddRedPhase,
  tddRedPhaseSelfCheckFails,
} from "./lib/tdd-order-guard.mjs";
import {
  getSessionMetadata,
  getSessionMode,
  isSessionActive,
} from "./lib/session-store.mjs";

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
      rels.push(`${editPath}`.replace(/\\/g, "/"));
    }
  }
  return rels;
}

const input = await readInput();
const event = `${input.hook_event_name ?? ""}`;
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;
const text = `${input.response ?? input.text ?? input.agent_response ?? ""}`;
const loopCount = Number(input.loop_count ?? input.loopCount ?? 0) || 0;

try {
  if (!isSessionActive(conversationId)) {
    if (event === "preToolUse") allowTool();
    allowEmpty();
  }

  const mode = getSessionMode(conversationId) ?? "main";
  const meta = getSessionMetadata(conversationId);

  if (event === "preToolUse") {
    if (mode === "lite") allowTool();
    const toolName = `${input.tool_name ?? input.toolName ?? ""}`;
    if (!isWriteStrReplaceOrPatchTool(toolName)) allowTool();
    const relPaths = toRelativePaths(input, collectEditPaths(input));
    if (
      shouldDenyProductWriteForTddRedPhase({
        mode,
        relativePaths: relPaths,
        touchedFiles: meta?.touchedFiles ?? [],
        firstFailingTest: meta?.firstFailingTest ?? null,
        shellEvidence: meta?.shellEvidence ?? [],
      })
    ) {
      process.stdout.write(`${JSON.stringify(denyTddRedPhase())}\n`);
      process.exit(0);
    }
    allowTool();
  }

  if (event === "stop") {
    if (
      tddRedPhaseSelfCheckFails({
        mode,
        touchedFiles: meta?.touchedFiles ?? [],
        shellEvidence: meta?.shellEvidence ?? [],
        firstFailingTest: meta?.firstFailingTest ?? null,
      })
    ) {
      process.stdout.write(
        JSON.stringify({
          followup_message: buildTddRedPhaseFollowup(loopCount),
        }) + "\n",
      );
      process.exit(2);
    }
  }
} catch (err) {
  console.error(
    `Kodaelus TDD order guard error: ${err instanceof Error ? err.message : "unknown"}`,
  );
  if (event === "preToolUse") allowTool();
  if (event === "stop") process.exit(2);
}

if (event === "preToolUse") allowTool();
allowEmpty();
