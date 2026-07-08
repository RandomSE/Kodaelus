#!/usr/bin/env node
/**
 * User-level Cursor hook: block shell workspace mutators in read-only Kodaelus modes.
 * Event: beforeShellExecution
 */
import { denyReadOnlyShellDelete } from "./lib/mode-guard.mjs";
import { isBlockedReadOnlyShellCommand } from "./lib/shell-mutator-guard.mjs";
import { getSessionMode, isReadOnlyMode, isSessionActive } from "./lib/session-store.mjs";

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
 * @param {string} mode
 */
function deny(mode) {
  const denial = denyReadOnlyShellDelete();
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      user_message:
        `Kodaelus ${mode} mode is read-only. Shell command blocked. ` +
        "Reply **use kodaelus main** or **use kodaelus lite** to mutate the workspace.",
      agent_message: denial.agent_message,
    }) + "\n",
  );
  process.exit(0);
}

const input = await readInput();
const command = `${input.command ?? ""}`;
const conversationId = `${input.conversation_id ?? input.conversationId ?? ""}`;

try {
  if (!isSessionActive(conversationId)) {
    allow();
  }

  const mode = getSessionMode(conversationId) ?? "main";
  if (isReadOnlyMode(mode) && isBlockedReadOnlyShellCommand(command)) {
    deny(mode);
  }
} catch {
  // Fail open.
}

allow();
