#!/usr/bin/env node
/**
 * User-level Cursor hook: block edit and shell tools until core.md has been read.
 * Events: preToolUse (Read stays allowed; Write/StrReplace/Delete/ApplyPatch may deny),
 *         beforeShellExecution (deny until the read).
 * Fails open when core.md is not on disk, when the conversation id is missing,
 * or when the guard itself errors.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  corePolicyExists,
  decideCoreRead,
  denyUntilCoreRead,
  extractToolPath,
  hasCoreRead,
  recordCoreRead,
} from "./lib/core-read-guard.mjs";

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

function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");
  process.exit(0);
}

/**
 * @param {Record<string, unknown>} input
 */
function projectRootFrom(input) {
  const roots = input.workspace_roots ?? input.workspaceRoots;
  if (Array.isArray(roots)) {
    for (const root of roots) {
      if (typeof root === "string" && root.trim()) return resolve(root.trim());
    }
  }
  if (typeof input.cwd === "string" && input.cwd.trim()) return resolve(input.cwd.trim());
  return process.cwd();
}

const input = await readInput();
const event = `${input.hook_event_name ?? ""}`;
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;
const toolName = `${input.tool_name ?? input.toolName ?? ""}`;

try {
  if (event && event !== "preToolUse" && event !== "beforeShellExecution") {
    process.stdout.write("{}\n");
    process.exit(0);
  }
  if (!conversationId) allow();

  const cursorHome = process.env.CURSOR_HOME ?? join(homedir(), ".cursor");
  const projectRoot = projectRootFrom(input);
  const decision = decideCoreRead({
    event: event || "preToolUse",
    toolName,
    filePath: extractToolPath(input),
    coreExists: corePolicyExists(projectRoot, cursorHome),
    alreadyRead: hasCoreRead(conversationId),
  });

  if (decision === "record") {
    recordCoreRead(conversationId);
    allow();
  }
  if (decision === "deny") {
    process.stdout.write(`${JSON.stringify(denyUntilCoreRead())}\n`);
    process.exit(0);
  }
} catch (err) {
  console.error(
    `Kodaelus core read guard error: ${err instanceof Error ? err.message : "unknown"}`,
  );
}

allow();
