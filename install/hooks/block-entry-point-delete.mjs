#!/usr/bin/env node
/**
 * User-level Cursor hook: block Delete tool on entry-point files while Kodaelus is active.
 * Event: preToolUse (matcher: Delete)
 */
import { checkEntryPoint, extractDeletePath, resolveProjectRoot } from "./lib/entry-point-guard.mjs";
import { isSessionActive } from "./lib/session-store.mjs";

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
 * @param {string} path
 * @param {string[]} reasons
 */
function deny(path, reasons) {
  const detail = reasons.join("; ");
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      user_message: `Kodaelus blocked deletion of entry-point file "${path}". ${detail}. Use deprecation or move logic instead.`,
      agent_message:
        `Deletion of "${path}" is hard-blocked: entry-point detection (${detail}). ` +
        "Do not retry. Report BLOCKED in File Deletions manifest and propose alternatives.",
    }) + "\n",
  );
  process.exit(0);
}

const input = await readInput();
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;

try {
  if (!isSessionActive(conversationId)) {
    allow();
  }

  const targetPath = extractDeletePath(input);
  if (!targetPath) {
    allow();
  }

  const projectRoot = resolveProjectRoot(input, targetPath);
  const { blocked, reasons } = checkEntryPoint(targetPath, projectRoot);
  if (blocked) {
    deny(targetPath, reasons);
  }
} catch {
  // Fail open: never block deletes if guard fails unexpectedly.
}

allow();
