#!/usr/bin/env node
/**
 * User-level Cursor hook: unicode dash guard (U+2013 en dash, U+2014 em dash).
 * Events: preToolUse, afterAgentResponse, stop
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPreToolDenyAgentMessage,
  buildStopFollowupMessage,
  containsUnicodeDash,
  countUnicodeDashes,
  extractEditableTexts,
  findUnicodeDashViolations,
  replaceUnicodeDashes,
} from "./lib/dash-guard.mjs";
import { resolveProjectRoot } from "./lib/entry-point-guard.mjs";
import {
  getSessionMode,
  isSessionActive,
} from "./lib/session-store.mjs";

const CHECKED_MODES = new Set(["main", "lite", "bug", "suggest", "question", "prepare"]);

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
 * @param {string} agentMessage
 */
function denyTool(agentMessage) {
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      user_message: "Kodaelus dash guard blocked an edit containing unicode dashes (U+2013/U+2014).",
      agent_message: agentMessage,
    }) + "\n",
  );
  process.exit(0);
}

/**
 * @param {unknown} input
 * @returns {string | null}
 */
function resolveArtifactRoot(input) {
  const record = input && typeof input === "object" ? /** @type {Record<string, unknown>} */ (input) : {};
  const roots = record.workspace_roots ?? record.workspaceRoots;
  if (Array.isArray(roots)) {
    for (const root of roots) {
      if (typeof root === "string" && root.trim()) {
        return resolveProjectRoot(input, root);
      }
    }
  }
  if (typeof record.cwd === "string" && record.cwd.trim()) {
    return resolveProjectRoot(input, record.cwd);
  }
  return null;
}

/**
 * @param {unknown} input
 * @param {string} conversationId
 * @param {string} text
 * @returns {string | null}
 */
function writeSanitizedArtifact(input, conversationId, text) {
  const projectRoot = resolveArtifactRoot(input);
  if (!projectRoot) return null;

  const safeId = conversationId.replace(/[^\w.-]+/g, "_") || "unknown";
  const relPath = join(".kodaelus", "dash-guard", `${safeId}-fix.md`);
  const absPath = join(projectRoot, relPath);

  try {
    mkdirSync(join(projectRoot, ".kodaelus", "dash-guard"), { recursive: true });
    writeFileSync(absPath, replaceUnicodeDashes(text, { skipCode: true }), "utf8");
    return relPath.replace(/\\/g, "/");
  } catch (err) {
    console.error(
      `Kodaelus dash guard artifact error: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
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
  if (!CHECKED_MODES.has(mode)) {
    if (event === "preToolUse") allowTool();
    allowEmpty();
  }

  if (event === "preToolUse") {
    const editableTexts = extractEditableTexts(input);
    let totalCount = 0;
    /** @type {{ index: number, snippet: string, char: string }[]} */
    const violations = [];

    for (const text of editableTexts) {
      totalCount += countUnicodeDashes(text);
      if (violations.length < 3) {
        const remaining = 3 - violations.length;
        violations.push(...findUnicodeDashViolations(text, remaining));
      }
    }

    if (totalCount === 0) {
      allowTool();
    }

    console.error(`Kodaelus dash guard: blocked edit with ${totalCount} unicode dash character(s).`);
    denyTool(buildPreToolDenyAgentMessage(totalCount, violations));
  }

  const text = `${input.response ?? input.text ?? input.agent_response ?? ""}`;
  const dashCount = countUnicodeDashes(text);

  if (event === "afterAgentResponse") {
    if (dashCount > 0) {
      console.error(`Kodaelus dash guard: observed ${dashCount} unicode dash character(s) in response.`);
    }
    allowEmpty();
  }

  if (event === "stop" && containsUnicodeDash(text)) {
    const loopCount = Number(input.loop_count ?? input.loopCount ?? 0);
    const violations = findUnicodeDashViolations(text, 3);
    const artifactPath =
      loopCount >= 1 ? null : writeSanitizedArtifact(input, conversationId, text);

    const followup_message = buildStopFollowupMessage({
      count: dashCount,
      violations,
      artifactPath,
      loopCount,
    });

    console.error(`Kodaelus dash guard: ${dashCount} unicode dash character(s) on stop.`);

    process.stdout.write(JSON.stringify({ followup_message }) + "\n");
    process.exit(2);
  }
} catch (err) {
  console.error(`Kodaelus dash guard error: ${err instanceof Error ? err.message : "unknown"}`);
  if (event === "stop") {
    process.exit(2);
  }
  if (event === "preToolUse") {
    allowTool();
  }
}

allowEmpty();
